import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { useStdoutDimensions } from '@/hooks';
import type { Theme } from '@/theme';
import { useTheme } from '@/contexts/ThemeContext.js';

export type DiffSegment = {
  text: string;
  type: 'unchanged' | 'add' | 'remove';
};

export type DiffLine = {
  type: 'add' | 'remove' | 'context' | 'modify';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
  segments?: DiffSegment[];
};

export type DiffBlock = {
  search: string;
  replace: string;
};

export type LineNumbers = {
  oldStartLine: number;
  oldEndLine: number;
  newStartLine: number;
  newEndLine: number;
  oldLineCount: number;
  newLineCount: number;
};

export function createSimpleDiff(search: string, replace: string, lineNumbers?: LineNumbers): DiffLine[] {
  // Defensive check for undefined/null values
  const searchStr = search ?? '';
  const replaceStr = replace ?? '';

  // Remove trailing newline to avoid empty line at end
  const searchTrimmed = searchStr.replace(/\n$/, '');
  const replaceTrimmed = replaceStr.replace(/\n$/, '');

  const searchLines = searchTrimmed.split('\n');
  const replaceLines = replaceTrimmed.split('\n');
  const diff: DiffLine[] = [];

  // If content is identical, show as context
  if (searchTrimmed === replaceTrimmed) {
    searchLines.forEach((line, i) => {
      const realLineNum = lineNumbers ? lineNumbers.oldStartLine + i : i + 1;
      diff.push({ type: 'context', content: line, oldLineNum: realLineNum, newLineNum: realLineNum });
    });
    return diff;
  }

  // Use LCS-based diff algorithm to find real changes
  const lcs = computeLCS(searchLines, replaceLines);
  const changes = buildDiffFromLCS(searchLines, replaceLines, lcs, lineNumbers);

  return changes;
}

// Compute Longest Common Subsequence
function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

// Compute character-level diff for inline highlighting using Myers algorithm
function computeInlineDiff(oldText: string, newText: string): { old: DiffSegment[]; new: DiffSegment[] } {
  const oldSegments: DiffSegment[] = [];
  const newSegments: DiffSegment[] = [];

  // Find common prefix
  let prefixLen = 0;
  while (prefixLen < oldText.length && prefixLen < newText.length && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix
  let suffixLen = 0;
  while (
    suffixLen < oldText.length - prefixLen &&
    suffixLen < newText.length - prefixLen &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // Extract the different parts
  const oldMiddle = oldText.slice(prefixLen, oldText.length - suffixLen);
  const newMiddle = newText.slice(prefixLen, newText.length - suffixLen);

  // Add common prefix
  if (prefixLen > 0) {
    oldSegments.push({ type: 'unchanged', text: oldText.slice(0, prefixLen) });
    newSegments.push({ type: 'unchanged', text: newText.slice(0, prefixLen) });
  }

  // Add different middle parts
  if (oldMiddle.length > 0) {
    oldSegments.push({ type: 'remove', text: oldMiddle });
  }
  if (newMiddle.length > 0) {
    newSegments.push({ type: 'add', text: newMiddle });
  }

  // Add common suffix
  if (suffixLen > 0) {
    oldSegments.push({ type: 'unchanged', text: oldText.slice(oldText.length - suffixLen) });
    newSegments.push({ type: 'unchanged', text: newText.slice(newText.length - suffixLen) });
  }

  return { old: oldSegments, new: newSegments };
}

// Calculate similarity ratio between two strings
function similarityRatio(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  if (longer.length === 0) return 1.0;

  // Fast early-exit: if lengths differ by >50%, similarity is guaranteed < 0.5
  const shorter = str1.length <= str2.length ? str1 : str2;
  if (shorter.length / longer.length < 0.5) return 0.0;

  const editDistance = levenshteinDistance(str1, str2);
  return (longer.length - editDistance) / longer.length;
}

// O(n) space Levenshtein using rolling array instead of full O(m×n) matrix
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = Math.min(prev[j], curr[j - 1], prev[j - 1]) + 1;
      }
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

// Build diff from LCS table with inline diff support
function buildDiffFromLCS(
  oldLines: string[],
  newLines: string[],
  lcs: number[][],
  lineNumbers?: LineNumbers,
): DiffLine[] {
  let i = oldLines.length;
  let j = newLines.length;
  let oldLineNum = lineNumbers ? lineNumbers.oldEndLine : i;
  let newLineNum = lineNumbers ? lineNumbers.newEndLine : j;

  const operations: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      operations.unshift({
        type: 'context',
        content: oldLines[i - 1],
        oldLineNum,
        newLineNum,
      });
      i--;
      j--;
      oldLineNum--;
      newLineNum--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      operations.unshift({
        type: 'add',
        content: newLines[j - 1],
        newLineNum,
      });
      j--;
      newLineNum--;
    } else if (i > 0) {
      operations.unshift({
        type: 'remove',
        content: oldLines[i - 1],
        oldLineNum,
      });
      i--;
      oldLineNum--;
    }
  }

  // Post-process: merge consecutive remove+add into modify with inline diff
  const finalOps: DiffLine[] = [];
  for (let idx = 0; idx < operations.length; idx++) {
    const curr = operations[idx];
    const next = operations[idx + 1];

    if (
      curr.type === 'remove' &&
      next?.type === 'add' &&
      curr.oldLineNum &&
      next.newLineNum &&
      curr.content.length < 500 &&
      next.content.length < 500 &&
      similarityRatio(curr.content, next.content) > 0.5
    ) {
      // Merge into a modify line with inline diff
      const inlineDiff = computeInlineDiff(curr.content, next.content);

      // Create two separate lines: one for old (remove), one for new (add)
      finalOps.push({
        type: 'modify',
        content: curr.content,
        oldLineNum: curr.oldLineNum,
        segments: inlineDiff.old,
      });
      finalOps.push({
        type: 'modify',
        content: next.content,
        newLineNum: next.newLineNum,
        segments: inlineDiff.new,
      });

      idx++; // Skip next since we've processed it
    } else {
      finalOps.push(curr);
    }
  }

  return finalOps;
}

type DiffLineViewProps = {
  line: DiffLine;
  theme: Theme;
  lineNumWidth?: number;
  contentWidth: number;
};

function DiffLineViewInner({ line, theme, lineNumWidth = 3, contentWidth }: DiffLineViewProps) {
  const lineNum = line.oldLineNum || line.newLineNum || 0;
  const lineNumStr = `${String(lineNum).padStart(lineNumWidth, ' ')}│ `;

  // Truncate extremely long lines to avoid Ink flexWrap performance cliff.
  // Lines longer than ~30 terminal rows of content get truncated with an indicator.
  const maxChars = contentWidth * 30;
  const truncatedContent = line.content.length > maxChars
    ? line.content.slice(0, maxChars)
    : line.content;
  const isTruncated = line.content.length > maxChars;

  if (line.type === 'modify' && line.segments && !isTruncated) {
    const prefix = line.oldLineNum ? '-' : '+';
    const isRemoveLine = !!line.oldLineNum;
    const prefixColor = isRemoveLine ? theme.diff.prefix.remove : theme.diff.prefix.add;
    const lineBaseBg = isRemoveLine ? theme.diff.background.remove : theme.diff.background.add;

    return (
      <Box>
        <Box>
          <Text dimColor color={theme.diff.lineNumber}>
            {lineNumStr}
          </Text>
          <Text color={prefixColor}>{prefix}</Text>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" width={contentWidth}>
          {line.segments.map((segment, segIdx) => {
            const isHighlighted =
              (isRemoveLine && segment.type === 'remove') || (!isRemoveLine && segment.type === 'add');
            const segmentBg = isHighlighted
              ? isRemoveLine
                ? theme.diff.background.removeHighlight
                : theme.diff.background.addHighlight
              : lineBaseBg;

            const text = segment.text.replace(/\t/g, '  ');

            return (
              <Text key={`${lineNum}-${segIdx}-${segment.type}`} backgroundColor={segmentBg} color={theme.diff.text}>
                {text}
              </Text>
            );
          })}
        </Box>
      </Box>
    );
  }

  const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
  const prefixColor =
    line.type === 'add'
      ? theme.diff.prefix.add
      : line.type === 'remove'
        ? theme.diff.prefix.remove
        : theme.diff.prefix.context;
  const bgColor =
    line.type === 'add' ? theme.diff.background.add : line.type === 'remove' ? theme.diff.background.remove : undefined;
  const fgColor = line.type === 'add' || line.type === 'remove' ? theme.diff.text : theme.diff.contextText;
  const content = (isTruncated ? truncatedContent + '…' : line.content).replace(/\t/g, '  ');

  return (
    <Box>
      <Box>
        <Text dimColor color={theme.diff.lineNumber}>
          {lineNumStr}
        </Text>
        <Text color={prefixColor}>{prefix}</Text>
      </Box>
      <Box flexWrap="wrap" width={contentWidth}>
        <Text backgroundColor={bgColor} color={fgColor}>
          {content}
        </Text>
      </Box>
    </Box>
  );
}

export const FileDiffView = React.memo(FileDiffViewInner);

export const DiffLineView = React.memo(DiffLineViewInner);

type FileDiffViewProps = {
  blocks: DiffBlock[];
  filePath?: string;
  showPath?: boolean;
  lineNumbers?: LineNumbers;
};

function FileDiffViewInner({ blocks, filePath, showPath = false, lineNumbers }: FileDiffViewProps) {
  const { theme } = useTheme();
  const { cols } = useStdoutDimensions();

  // Content-based key so inline-array callers (e.g. blocks={[{...}]}) don't break memoization
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const blocksKey = blocks.map((b) => `${b.search}\0${b.replace}`).join('\x01');

  // Memoize all diff calculations
  const blockData = useMemo(() => {
    return blocks.map((b, idx) => {
      const diff = createSimpleDiff(b.search, b.replace, lineNumbers);
      const hasChanges = diff.some((d) => d.type !== 'context');
      const maxLineNum = diff.reduce(
        (max, line) => Math.max(max, line.oldLineNum ?? 0, line.newLineNum ?? 0),
        0,
      );
      const lineNumWidth = String(maxLineNum).length;

      return {
        diff,
        hasChanges,
        lineNumWidth,
        blockIndex: idx,
        totalBlocks: blocks.length,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- blocksKey is a content-based proxy for blocks
  }, [blocksKey, lineNumbers]);

  // Calculate max lineNumWidth across all blocks for consistency
  const globalLineNumWidth = useMemo(() => {
    if (blockData.length === 0) return 3;
    return Math.max(...blockData.map((b) => b.lineNumWidth));
  }, [blockData]);

  // lineNumStr is `padStart(lineNumWidth) + '│ '` = lineNumWidth + 2 chars, plus the prefix char = +1
  const contentWidth = cols - globalLineNumWidth - 2 - 5;

  return (
    <Box flexDirection="column">
      {showPath && filePath && (
        <Box marginLeft={2}>
          <Text color={theme.diff.pathLabel}>path: </Text>
          <Text>{filePath}</Text>
        </Box>
      )}
      {blockData.map((block) => (
        <Box key={`block-${block.blockIndex}`} flexDirection="column">
          {block.totalBlocks > 1 && (
            <Text color={theme.diff.blockSeparator} dimColor>
              ─── Block {block.blockIndex + 1}/{block.totalBlocks} ───
            </Text>
          )}
          {block.hasChanges ? (
            <Box flexDirection="column">
              {block.diff.map((line, ldx) => {
                const lineKey = `line-${block.blockIndex}-${ldx}-${line.type}-${line.oldLineNum || ''}-${line.newLineNum || ''}`;
                return <DiffLineView key={lineKey} line={line} theme={theme} lineNumWidth={globalLineNumWidth} contentWidth={contentWidth} />;
              })}
            </Box>
          ) : (
            <Text color={theme.diff.noChanges} dimColor>
              {' '}
              (no changes)
            </Text>
          )}
        </Box>
      ))}
      {blocks.length === 0 && (
        <Box marginLeft={2}>
          <Text color={theme.diff.noBlocks}>No changes to display</Text>
        </Box>
      )}
    </Box>
  );
}
