import { Box, Text } from 'ink';
import { useStdoutDimensions } from '@/hooks';

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
  // Remove trailing newline to avoid empty line at end
  const searchTrimmed = search.replace(/\n$/, '');
  const replaceTrimmed = replace.replace(/\n$/, '');

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
  maxWidth?: number;
  lineNumWidth?: number;
};

export function DiffLineView({ line, maxWidth = 80, lineNumWidth = 3 }: DiffLineViewProps) {
  const lineNum = line.oldLineNum || line.newLineNum || 0;
  const lineNumStr = `${String(lineNum).padStart(lineNumWidth, ' ')}│`;

  // Handle modify type with inline segments
  if (line.type === 'modify' && line.segments) {
    const prefix = line.oldLineNum ? '- ' : '+ ';
    const isRemoveLine = !!line.oldLineNum;
    const lineBaseBg = isRemoveLine ? 'red' : 'green';

    // Use segments without truncation to preserve diff highlighting accuracy
    const segments: typeof line.segments = line.segments;

    return (
      <Box>
        <Text dimColor color="gray">
          {lineNumStr}
        </Text>
        <Text color="gray"> </Text>
        <Text backgroundColor={lineBaseBg} color="white">
          {prefix}
        </Text>
        {segments.map((segment, segIdx) => {
          let segmentBg: string | undefined = lineBaseBg;
          const segmentFg = 'white';

          if (segment.type === 'add') {
            segmentBg = 'greenBright';
          } else if (segment.type === 'remove') {
            segmentBg = 'redBright';
          }

          // Replace tabs with spaces to avoid Ink rendering issues with stringWidth
          const text = segment.text.replace(/\t/g, '  ');

          return (
            <Text key={`seg-${segIdx}`} backgroundColor={segmentBg} color={segmentFg}>
              {text}
            </Text>
          );
        })}
      </Box>
    );
  }

  // Handle regular add/remove/context lines
  const prefix = line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ';
  const rawContent = line.content.length > maxWidth ? `${line.content.slice(0, maxWidth)}…` : line.content;
  // Replace tabs with spaces to avoid Ink rendering issues with stringWidth
  const content = rawContent.replace(/\t/g, '  ');

  const bgColor = line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : undefined;
  const fgColor = line.type === 'add' || line.type === 'remove' ? 'white' : 'gray';

  return (
    <Box>
      <Text dimColor color="gray">
        {lineNumStr}
      </Text>
      <Text color="gray"> </Text>
      <Text backgroundColor={bgColor} color={fgColor}>
        {prefix}
        {content}
      </Text>
    </Box>
  );
}

type FileDiffViewProps = {
  blocks: DiffBlock[];
  filePath?: string;
  showPath?: boolean;
  lineNumbers?: LineNumbers;
};

export function FileDiffView({ blocks, filePath, showPath = true, lineNumbers }: FileDiffViewProps) {
  const [cols] = useStdoutDimensions();
  return (
    <Box flexDirection="column">
      {showPath && filePath && (
        <Box marginLeft={2}>
          <Text color="cyan">path: </Text>
          <Text>{filePath}</Text>
        </Box>
      )}
      {blocks.map((b, idx) => {
        const diff = createSimpleDiff(b.search, b.replace, lineNumbers);
        const hasChanges = diff.some((d) => d.type !== 'context');

        // Calculate max line number width for proper alignment
        const maxLineNum = Math.max(...diff.map((line) => Math.max(line.oldLineNum || 0, line.newLineNum || 0)));
        const lineNumWidth = String(maxLineNum).length;

        return (
          <Box key={`block-${b.replace}`} flexDirection="column">
            {blocks.length > 1 && (
              <Text color="magenta" dimColor>
                ─── Block {idx + 1}/{blocks.length} ───
              </Text>
            )}
            {hasChanges ? (
              <Box flexDirection="column">
                {diff.map((line, ldx) => {
                  // Calculate available width: terminal width - line number width - separators - prefix - padding
                  // Line number (lineNumWidth) + "│" (1) + space (1) + prefix (2) + margin (4)
                  const overhead = lineNumWidth + 1 + 1 + 2 + 4;
                  const availableWidth = Math.max(80, cols - overhead);

                  // Create unique key using line numbers and type to avoid duplicates
                  const lineKey = `line-${idx}-${ldx}-${line.type}-${line.oldLineNum || ''}-${line.newLineNum || ''}`;

                  return (
                    <DiffLineView maxWidth={availableWidth} key={lineKey} line={line} lineNumWidth={lineNumWidth} />
                  );
                })}
              </Box>
            ) : (
              <Text color="gray" dimColor>
                {' '}
                (no changes)
              </Text>
            )}
          </Box>
        );
      })}
      {blocks.length === 0 && (
        <Box marginLeft={2}>
          <Text color="red">No changes to display</Text>
        </Box>
      )}
    </Box>
  );
}
