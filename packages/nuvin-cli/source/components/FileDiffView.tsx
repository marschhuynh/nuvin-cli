import { Box, Text } from 'ink';
import { useStdoutDimensions } from '@/hooks';
import { theme } from '@/theme';

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

  const editDistance = levenshteinDistance(str1, str2);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
      }
    }
  }

  return dp[m][n];
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
  lineNumWidth?: number;
};

export function DiffLineView({ line, lineNumWidth = 3 }: DiffLineViewProps) {
  const { cols } = useStdoutDimensions();
  const lineNum = line.oldLineNum || line.newLineNum || 0;
  const lineNumStr = `${String(lineNum).padStart(lineNumWidth, ' ')}│ `;

  if (line.type === 'modify' && line.segments) {
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
        <Box flexDirection="row" flexWrap="wrap" width={cols - lineNumStr.length - 5}>
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
  const content = line.content.replace(/\t/g, '  ');

  return (
    <Box>
      <Box>
        <Text dimColor color={theme.diff.lineNumber}>
          {lineNumStr}
        </Text>
        <Text color={prefixColor}>{prefix}</Text>
      </Box>
      <Box flexWrap="wrap" width={cols - lineNumStr.length - 5}>
        <Text backgroundColor={bgColor} color={fgColor}>
          {content}
        </Text>
      </Box>
    </Box>
  );
}

type FileDiffViewProps = {
  blocks: DiffBlock[];
  filePath?: string;
  showPath?: boolean;
  lineNumbers?: LineNumbers;
};

export function FileDiffView({ blocks, filePath, showPath = false, lineNumbers }: FileDiffViewProps) {
  return (
    <Box flexDirection="column">
      {showPath && filePath && (
        <Box marginLeft={2}>
          <Text color={theme.diff.pathLabel}>path: </Text>
          <Text>{filePath}</Text>
        </Box>
      )}
      {blocks.map((b, idx) => {
        const diff = createSimpleDiff(b.search, b.replace, lineNumbers);
        const hasChanges = diff.some((d) => d.type !== 'context');

        const maxLineNum = Math.max(...diff.map((line) => Math.max(line.oldLineNum || 0, line.newLineNum || 0)));
        const lineNumWidth = String(maxLineNum).length;

        return (
          <Box key={`block-${b.replace}`} flexDirection="column">
            {blocks.length > 1 && (
              <Text color={theme.diff.blockSeparator} dimColor>
                ─── Block {idx + 1}/{blocks.length} ───
              </Text>
            )}
            {hasChanges ? (
              <Box flexDirection="column">
                {diff.map((line, ldx) => {
                  const lineKey = `line-${idx}-${ldx}-${line.type}-${line.oldLineNum || ''}-${line.newLineNum || ''}`;
                  return <DiffLineView key={lineKey} line={line} lineNumWidth={lineNumWidth} />;
                })}
              </Box>
            ) : (
              <Text color={theme.diff.noChanges} dimColor>
                {' '}
                (no changes)
              </Text>
            )}
          </Box>
        );
      })}
      {blocks.length === 0 && (
        <Box marginLeft={2}>
          <Text color={theme.diff.noBlocks}>No changes to display</Text>
        </Box>
      )}
    </Box>
  );
}
