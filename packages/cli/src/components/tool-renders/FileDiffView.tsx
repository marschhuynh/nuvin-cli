import { Box, Text, useWindowSize } from "@nuvin/ink";
import type { JsonObject } from "@nuvin/nuvin-core/shared";
import React from "react";

import type { Theme } from "#src/lib/theme/runtime.js";
import { useTheme } from "#src/lib/theme/store.js";

export type DiffSegment = {
  text: string;
  type: "add" | "remove" | "unchanged";
};

export type DiffLine = {
  content: string;
  newLineNum?: number;
  oldLineNum?: number;
  segments?: DiffSegment[];
  type: "add" | "context" | "modify" | "remove";
};

export type DiffBlock = {
  replace: string;
  search: string;
};

export type LineNumbers = JsonObject & {
  newEndLine: number;
  newLineCount: number;
  newStartLine: number;
  oldEndLine: number;
  oldLineCount: number;
  oldStartLine: number;
};

export type DiffLineRenderModel = {
  bodySegments: DiffLineBodySegmentRenderModel[];
  bodyText: string;
  gutterText: string;
  lineNumberColor: string;
  lineNumberText: string;
  separatorColor: string;
  separatorText: string;
};

export type DiffLineBodySegmentRenderModel = {
  background?: string;
  color: string;
  text: string;
};

// Hard cap on LCS matrix size to keep TUI responsive on huge edits.
// 250k cells ≈ 500x500 lines, well under any reasonable file-edit block.
const MAX_LCS_CELLS = 250_000;

export function createSimpleDiff(
  search: string,
  replace: string,
  lineNumbers?: LineNumbers,
): DiffLine[] {
  const searchTrimmed = search.replace(/\n$/, "");
  const replaceTrimmed = replace.replace(/\n$/, "");
  const searchLines = searchTrimmed.split("\n");
  const replaceLines = replaceTrimmed.split("\n");

  if (searchTrimmed === replaceTrimmed) {
    return searchLines.map((line, index) => {
      const lineNum = lineNumbers ? lineNumbers.oldStartLine + index : index + 1;
      return {
        type: "context",
        content: line,
        oldLineNum: lineNum,
        newLineNum: lineNum,
      };
    });
  }

  if (searchLines.length * replaceLines.length > MAX_LCS_CELLS) {
    return buildRawReplacementDiff(searchLines, replaceLines, lineNumbers);
  }

  return buildDiffFromLcs(
    searchLines,
    replaceLines,
    computeLcs(searchLines, replaceLines),
    lineNumbers,
  );
}

function buildRawReplacementDiff(
  oldLines: string[],
  newLines: string[],
  lineNumbers?: LineNumbers,
): DiffLine[] {
  const oldStart = lineNumbers ? lineNumbers.oldStartLine : 1;
  const newStart = lineNumbers ? lineNumbers.newStartLine : 1;
  const removed: DiffLine[] = oldLines.map((content, index) => ({
    type: "remove",
    content,
    oldLineNum: oldStart + index,
  }));
  const added: DiffLine[] = newLines.map((content, index) => ({
    type: "add",
    content,
    newLineNum: newStart + index,
  }));
  return [...removed, ...added];
}

function computeLcs(a: string[], b: string[]): number[][] {
  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      matrix[i][j] =
        a[i - 1] === b[j - 1]
          ? (matrix[i - 1]?.[j - 1] ?? 0) + 1
          : Math.max(matrix[i - 1]?.[j] ?? 0, matrix[i]?.[j - 1] ?? 0);
    }
  }

  return matrix;
}

function computeInlineDiff(
  oldText: string,
  newText: string,
): { newSegments: DiffSegment[]; oldSegments: DiffSegment[] } {
  const oldSegments: DiffSegment[] = [];
  const newSegments: DiffSegment[] = [];

  let prefixLen = 0;
  while (
    prefixLen < oldText.length &&
    prefixLen < newText.length &&
    oldText[prefixLen] === newText[prefixLen]
  ) {
    prefixLen += 1;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldText.length - prefixLen &&
    suffixLen < newText.length - prefixLen &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen += 1;
  }

  const oldMiddle = oldText.slice(prefixLen, oldText.length - suffixLen);
  const newMiddle = newText.slice(prefixLen, newText.length - suffixLen);

  if (oldMiddle.length === 0 || newMiddle.length === 0) {
    if (prefixLen > 0) {
      oldSegments.push({ type: "unchanged", text: oldText.slice(0, prefixLen) });
      newSegments.push({ type: "unchanged", text: newText.slice(0, prefixLen) });
    }
    if (oldMiddle.length > 0) oldSegments.push({ type: "remove", text: oldMiddle });
    if (newMiddle.length > 0) newSegments.push({ type: "add", text: newMiddle });
    if (suffixLen > 0) {
      oldSegments.push({ type: "unchanged", text: oldText.slice(oldText.length - suffixLen) });
      newSegments.push({ type: "unchanged", text: newText.slice(newText.length - suffixLen) });
    }

    return { oldSegments, newSegments };
  }

  let oldChangeStart = prefixLen;
  let oldChangeEnd = oldText.length - suffixLen;
  let newChangeStart = prefixLen;
  let newChangeEnd = newText.length - suffixLen;

  while (
    oldChangeStart > 0 &&
    newChangeStart > 0 &&
    isWordChar(oldText[oldChangeStart - 1]) &&
    isWordChar(newText[newChangeStart - 1])
  ) {
    oldChangeStart -= 1;
    newChangeStart -= 1;
  }

  while (
    oldChangeEnd < oldText.length &&
    newChangeEnd < newText.length &&
    isWordChar(oldText[oldChangeEnd]) &&
    isWordChar(newText[newChangeEnd])
  ) {
    oldChangeEnd += 1;
    newChangeEnd += 1;
  }

  const unchangedPrefix = oldText.slice(0, oldChangeStart);
  const oldChangedToken = oldText.slice(oldChangeStart, oldChangeEnd);
  const newChangedToken = newText.slice(newChangeStart, newChangeEnd);
  const oldSuffix = oldText.slice(oldChangeEnd);
  const newSuffix = newText.slice(newChangeEnd);

  if (unchangedPrefix.length > 0) {
    oldSegments.push({ type: "unchanged", text: unchangedPrefix });
    newSegments.push({ type: "unchanged", text: unchangedPrefix });
  }
  if (oldChangedToken.length > 0) oldSegments.push({ type: "remove", text: oldChangedToken });
  if (newChangedToken.length > 0) newSegments.push({ type: "add", text: newChangedToken });
  if (oldSuffix.length > 0) {
    oldSegments.push({ type: "unchanged", text: oldSuffix });
  }
  if (newSuffix.length > 0) {
    newSegments.push({ type: "unchanged", text: newSuffix });
  }

  return { oldSegments, newSegments };
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

function countNonWhitespace(text: string): number {
  return text.replace(/\s/g, "").length;
}

function commonPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
}

function commonSuffixLength(a: string, b: string, prefixLength: number): number {
  let length = 0;
  while (
    length < a.length - prefixLength &&
    length < b.length - prefixLength &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function hasStableInlineAnchor(a: string, b: string): boolean {
  const minMeaningfulLength = Math.min(countNonWhitespace(a), countNonWhitespace(b));
  if (minMeaningfulLength < 6) return false;

  const prefixLength = commonPrefixLength(a, b);
  const suffixLength = commonSuffixLength(a, b, prefixLength);
  const prefixWeight = countNonWhitespace(a.slice(0, prefixLength));
  const suffixWeight = countNonWhitespace(a.slice(a.length - suffixLength));
  const stableWeight = prefixWeight + suffixWeight;

  return stableWeight >= 6 && stableWeight / minMeaningfulLength >= 0.45;
}

function levenshteinDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] =
        a[i - 1] === b[j - 1]
          ? (previous[j - 1] ?? 0)
          : Math.min(previous[j] ?? 0, current[j - 1] ?? 0, previous[j - 1] ?? 0) + 1;
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length] ?? 0;
}

function similarityRatio(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  if (longer.length === 0) return 1;
  const shorter = a.length <= b.length ? a : b;
  if (shorter.length / longer.length < 0.5) return 0;
  return (longer.length - levenshteinDistance(a, b)) / longer.length;
}

function canInlinePairLines(oldLine: DiffLine, newLine: DiffLine): boolean {
  if (oldLine.content.length >= 500 || newLine.content.length >= 500) return false;
  return (
    similarityRatio(oldLine.content, newLine.content) > 0.5 &&
    hasStableInlineAnchor(oldLine.content, newLine.content)
  );
}

type ReplacementPair = {
  addedIndex: number;
  removedIndex: number;
};

function findReplacementPairs(removed: DiffLine[], added: DiffLine[]): ReplacementPair[] {
  const pairs: ReplacementPair[] = [];
  const usedAdded = new Set<number>();
  const sameLength = removed.length === added.length;

  for (let removedIndex = 0; removedIndex < removed.length; removedIndex += 1) {
    const oldLine = removed[removedIndex];
    if (!oldLine) continue;

    if (sameLength) {
      const newLine = added[removedIndex];
      if (newLine && canInlinePairLines(oldLine, newLine)) {
        pairs.push({ removedIndex, addedIndex: removedIndex });
        usedAdded.add(removedIndex);
      }
      continue;
    }

    let bestAddedIndex = -1;
    let bestScore = 0.5;
    for (let addedIndex = 0; addedIndex < added.length; addedIndex += 1) {
      if (usedAdded.has(addedIndex)) continue;
      const newLine = added[addedIndex];
      if (!newLine || !canInlinePairLines(oldLine, newLine)) continue;
      const score = similarityRatio(oldLine.content, newLine.content);
      if (score > bestScore) {
        bestScore = score;
        bestAddedIndex = addedIndex;
      }
    }

    if (bestAddedIndex >= 0) {
      pairs.push({ removedIndex, addedIndex: bestAddedIndex });
      usedAdded.add(bestAddedIndex);
    }
  }

  return pairs;
}

function applyReplacementPairing(removed: DiffLine[], added: DiffLine[]): DiffLine[] {
  const removedWithSegments = removed.map((line) => ({ ...line }));
  const addedWithSegments = added.map((line) => ({ ...line }));

  for (const pair of findReplacementPairs(removed, added)) {
    const oldLine = removed[pair.removedIndex];
    const newLine = added[pair.addedIndex];
    if (!oldLine || !newLine) continue;
    const inlineDiff = computeInlineDiff(oldLine.content, newLine.content);
    removedWithSegments[pair.removedIndex] = {
      type: "modify",
      content: oldLine.content,
      oldLineNum: oldLine.oldLineNum,
      segments: inlineDiff.oldSegments,
    };
    addedWithSegments[pair.addedIndex] = {
      type: "modify",
      content: newLine.content,
      newLineNum: newLine.newLineNum,
      segments: inlineDiff.newSegments,
    };
  }

  return [...removedWithSegments, ...addedWithSegments];
}

function buildDiffFromLcs(
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
        type: "context",
        content: oldLines[i - 1] ?? "",
        oldLineNum,
        newLineNum,
      });
      i -= 1;
      j -= 1;
      oldLineNum -= 1;
      newLineNum -= 1;
    } else if (j > 0 && (i === 0 || (lcs[i]?.[j - 1] ?? 0) >= (lcs[i - 1]?.[j] ?? 0))) {
      operations.unshift({
        type: "add",
        content: newLines[j - 1] ?? "",
        newLineNum,
      });
      j -= 1;
      newLineNum -= 1;
    } else if (i > 0) {
      operations.unshift({
        type: "remove",
        content: oldLines[i - 1] ?? "",
        oldLineNum,
      });
      i -= 1;
      oldLineNum -= 1;
    }
  }

  const finalOps: DiffLine[] = [];
  let index = 0;
  while (index < operations.length) {
    const current = operations[index];
    if (!current) {
      index += 1;
      continue;
    }

    if (current.type !== "remove") {
      finalOps.push(current);
      index += 1;
      continue;
    }

    const removed: DiffLine[] = [];
    while (operations[index]?.type === "remove") {
      const removedLine = operations[index];
      if (removedLine) removed.push(removedLine);
      index += 1;
    }

    const added: DiffLine[] = [];
    while (operations[index]?.type === "add") {
      const addedLine = operations[index];
      if (addedLine) added.push(addedLine);
      index += 1;
    }

    if (added.length > 0) {
      finalOps.push(...applyReplacementPairing(removed, added));
    } else {
      finalOps.push(...removed);
    }
  }

  return finalOps;
}

type DiffLineViewProps = {
  contentWidth: number;
  line: DiffLine;
  lineNumWidth: number;
  theme: Theme;
};

function getLineTone(line: DiffLine): "add" | "context" | "remove" {
  const isModifyLine = line.type === "modify";
  const isRemoveSide = isModifyLine && line.oldLineNum !== undefined;
  if (line.type === "add" || (isModifyLine && !isRemoveSide)) return "add";
  if (line.type === "remove" || isRemoveSide) return "remove";
  return "context";
}

function createPlainBodySegment(
  prefix: string,
  content: string,
  tone: "add" | "context" | "remove",
  theme: Theme,
): DiffLineBodySegmentRenderModel[] {
  if (tone === "add") {
    return [
      {
        background: theme.diff.background.add,
        color: theme.diff.highlightText,
        text: `${prefix}${content}`,
      },
    ];
  }

  if (tone === "remove") {
    return [
      {
        background: theme.diff.background.remove,
        color: theme.diff.highlightText,
        text: `${prefix}${content}`,
      },
    ];
  }

  return [
    {
      color: theme.diff.contextText,
      text: `${prefix}${content}`,
    },
  ];
}

function createSegmentedBody(
  line: DiffLine,
  prefix: string,
  tone: "add" | "context" | "remove",
  theme: Theme,
): DiffLineBodySegmentRenderModel[] | undefined {
  if (line.type !== "modify" || !line.segments) return undefined;

  const baseBackground =
    tone === "add"
      ? theme.diff.background.add
      : tone === "remove"
        ? theme.diff.background.remove
        : undefined;
  const baseColor = tone === "context" ? theme.diff.contextText : theme.diff.highlightText;
  const segments: DiffLineBodySegmentRenderModel[] = [
    {
      background: baseBackground,
      color: baseColor,
      text: prefix,
    },
  ];

  for (const segment of line.segments) {
    if (segment.text.length === 0) continue;
    const text = segment.text.replace(/\t/g, "  ");
    if (segment.type === "add") {
      segments.push({
        background: theme.diff.background.addHighlight,
        color: theme.diff.highlightText,
        text,
      });
    } else if (segment.type === "remove") {
      segments.push({
        background: theme.diff.background.removeHighlight,
        color: theme.diff.highlightText,
        text,
      });
    } else {
      segments.push({
        background: baseBackground,
        color: baseColor,
        text,
      });
    }
  }

  return segments;
}

export function createDiffLineRenderModel(
  line: DiffLine,
  lineNumWidth: number,
  contentWidth: number,
  theme: Theme,
): DiffLineRenderModel {
  const lineNum = line.oldLineNum ?? line.newLineNum ?? 0;
  const maxChars = contentWidth * 30;
  const isTruncated = line.content.length > maxChars;
  const truncatedContent = isTruncated ? line.content.slice(0, maxChars) : line.content;
  const content = (isTruncated ? `${truncatedContent}…` : line.content).replace(/\t/g, "  ");
  const tone = getLineTone(line);
  const prefix = tone === "add" ? "+" : tone === "remove" ? "-" : " ";
  const lineNumberText = String(lineNum).padStart(lineNumWidth, " ");
  const separatorText = "│ ";
  const segmentedBody = isTruncated ? undefined : createSegmentedBody(line, prefix, tone, theme);
  const bodySegments = segmentedBody ?? createPlainBodySegment(prefix, content, tone, theme);
  const bodyText = bodySegments.map((segment) => segment.text).join("");

  if (tone === "add") {
    return {
      bodySegments,
      bodyText,
      gutterText: `${lineNumberText}${separatorText}`,
      lineNumberColor: theme.diff.prefix.add,
      lineNumberText,
      separatorColor: theme.diff.lineNumber,
      separatorText,
    };
  }

  if (tone === "remove") {
    return {
      bodySegments,
      bodyText,
      gutterText: `${lineNumberText}${separatorText}`,
      lineNumberColor: theme.diff.prefix.remove,
      lineNumberText,
      separatorColor: theme.diff.lineNumber,
      separatorText,
    };
  }

  return {
    bodySegments,
    bodyText,
    gutterText: `${lineNumberText}${separatorText}`,
    lineNumberColor: theme.diff.lineNumber,
    lineNumberText,
    separatorColor: theme.diff.lineNumber,
    separatorText,
  };
}

function DiffLineViewInner({ contentWidth, line, lineNumWidth, theme }: DiffLineViewProps) {
  const model = createDiffLineRenderModel(line, lineNumWidth, contentWidth, theme);

  return (
    <Text>
      <Text color={model.lineNumberColor}>{model.lineNumberText}</Text>
      <Text color={model.separatorColor}>{model.separatorText}</Text>
      {model.bodySegments.map((segment, index) => (
        <Text
          key={`${index}-${segment.text}-${segment.color}-${segment.background ?? ""}`}
          backgroundColor={segment.background}
          color={segment.color}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

const DiffLineView = React.memo(DiffLineViewInner);

type FileDiffViewProps = {
  blocks: DiffBlock[];
  filePath?: string;
  lineNumbers?: LineNumbers;
  showPath?: boolean;
};

function sameLineNumbers(a: LineNumbers | undefined, b: LineNumbers | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.oldStartLine === b.oldStartLine &&
    a.oldEndLine === b.oldEndLine &&
    a.newStartLine === b.newStartLine &&
    a.newEndLine === b.newEndLine &&
    a.oldLineCount === b.oldLineCount &&
    a.newLineCount === b.newLineCount
  );
}

export type DiffHunk = {
  hiddenBefore: number;
  lines: DiffLine[];
};

export const DEFAULT_HUNK_CONTEXT = 3;

export function buildHunks(diff: DiffLine[], context = DEFAULT_HUNK_CONTEXT): DiffHunk[] {
  if (diff.length === 0) return [];

  type Range = { end: number; start: number };
  const ranges: Range[] = [];
  let current: Range | undefined;

  for (let i = 0; i < diff.length; i += 1) {
    const line = diff[i];
    if (!line || line.type === "context") continue;
    const start = Math.max(0, i - context);
    const end = Math.min(diff.length - 1, i + context);
    if (current && start <= current.end + 1) {
      current.end = Math.max(current.end, end);
    } else {
      if (current) ranges.push(current);
      current = { end, start };
    }
  }
  if (current) ranges.push(current);

  const hunks: DiffHunk[] = [];
  let previousEnd = -1;
  for (const range of ranges) {
    hunks.push({
      hiddenBefore: range.start - (previousEnd + 1),
      lines: diff.slice(range.start, range.end + 1),
    });
    previousEnd = range.end;
  }
  return hunks;
}

function FileDiffViewInner({ blocks, filePath, lineNumbers, showPath = false }: FileDiffViewProps) {
  const theme = useTheme();
  const { columns } = useWindowSize();

  const blockData = React.useMemo(() => {
    return blocks.map((block, blockIndex) => {
      const diff = createSimpleDiff(block.search, block.replace, lineNumbers);
      const maxLineNum = diff.reduce(
        (max, line) => Math.max(max, line.oldLineNum ?? 0, line.newLineNum ?? 0),
        0,
      );
      const hunks = buildHunks(diff);
      return {
        blockIndex,
        hasChanges: hunks.length > 0,
        hunks,
        lineNumWidth: Math.max(String(maxLineNum).length, 3),
        totalBlocks: blocks.length,
      };
    });
  }, [blocks, lineNumbers]);

  const globalLineNumWidth = blockData.length
    ? Math.max(...blockData.map((block) => block.lineNumWidth))
    : 3;
  const contentWidth = Math.max(columns - globalLineNumWidth - 8, 10);

  return (
    <Box flexDirection="column">
      {showPath && filePath ? (
        <Box marginLeft={2}>
          <Text color={theme.diff.pathLabel}>path: </Text>
          <Text>{filePath}</Text>
        </Box>
      ) : null}
      {blockData.map((block) => (
        <Box key={`block-${block.blockIndex}`} flexDirection="column">
          {block.totalBlocks > 1 ? (
            <Text color={theme.diff.blockSeparator} dimColor>
              {`--- Block ${block.blockIndex + 1}/${block.totalBlocks} ---`}
            </Text>
          ) : null}
          {block.hasChanges ? (
            <Box flexDirection="column">
              {block.hunks.map((hunk, hunkIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: hunk order is stable for a given diff render.
                <Box key={`hunk-${hunkIndex}`} flexDirection="column">
                  {hunk.hiddenBefore > 0 ? (
                    <Text color={theme.diff.blockSeparator} dimColor>
                      {`    ⋯ ${hunk.hiddenBefore} unchanged line${hunk.hiddenBefore === 1 ? "" : "s"} ⋯`}
                    </Text>
                  ) : null}
                  {hunk.lines.map((line) => (
                    <DiffLineView
                      key={`${block.blockIndex}-${line.type}-${line.oldLineNum ?? ""}-${line.newLineNum ?? ""}-${line.content}`}
                      contentWidth={contentWidth}
                      line={line}
                      lineNumWidth={globalLineNumWidth}
                      theme={theme}
                    />
                  ))}
                </Box>
              ))}
            </Box>
          ) : (
            <Text color={theme.diff.noChanges} dimColor>
              {" "}
              (no changes)
            </Text>
          )}
        </Box>
      ))}
      {blocks.length === 0 ? (
        <Box marginLeft={2}>
          <Text color={theme.diff.noBlocks}>No changes to display</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export const FileDiffView = React.memo(FileDiffViewInner, (prev, next) => {
  if (prev.filePath !== next.filePath || prev.showPath !== next.showPath) return false;
  if (!sameLineNumbers(prev.lineNumbers, next.lineNumbers)) return false;
  if (prev.blocks.length !== next.blocks.length) return false;
  return prev.blocks.every(
    (block, index) =>
      block.search === next.blocks[index]?.search && block.replace === next.blocks[index]?.replace,
  );
});
