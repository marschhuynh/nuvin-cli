import { splitByVisualWidth } from '@/components/TextInput/widthUtils.js';

export type VimMode = 'insert' | 'normal';

export type LineInfo = {
  lines: string[];
  lineIndex: number;
  column: number;
  lineStart: number;
  lineEnd: number;
};

export function getLineInfo(value: string, offset: number): LineInfo {
  const lines = value.split('\n');

  let currentPos = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineEnd = currentPos + line.length;
    if (offset <= lineEnd) {
      return {
        lines,
        lineIndex: i,
        column: offset - currentPos,
        lineStart: currentPos,
        lineEnd,
      };
    }
    currentPos = lineEnd + 1;
  }

  const lastIndex = Math.max(0, lines.length - 1);
  const lastLine = lines[lastIndex] ?? '';
  const lineStart = value.length - lastLine.length;
  return {
    lines,
    lineIndex: lastIndex,
    column: lastLine.length,
    lineStart,
    lineEnd: value.length,
  };
}

export function moveCursorVertically(value: string, offset: number, direction: 'up' | 'down'): number | null {
  if (!value.includes('\n')) {
    return null;
  }

  const info = getLineInfo(value, offset);
  const targetIndex = direction === 'up' ? info.lineIndex - 1 : info.lineIndex + 1;

  if (targetIndex < 0 || targetIndex >= info.lines.length) {
    return null;
  }

  const targetLineLength = info.lines[targetIndex].length;
  const targetColumn = Math.min(info.column, targetLineLength);

  let newPos = 0;
  for (let i = 0; i < targetIndex; i++) {
    newPos += info.lines[i].length + 1;
  }

  return newPos + targetColumn;
}

export function moveCursorVisually(
  value: string,
  offset: number,
  direction: 'up' | 'down',
  wrapWidth: number,
): number | null {
  if (wrapWidth <= 0) {
    return moveCursorVertically(value, offset, direction);
  }

  const info = getLineInfo(value, offset);
  const currentLine = info.lines[info.lineIndex] ?? '';
  const column = info.column;

  const chunks = splitByVisualWidth(currentLine, wrapWidth);
  const totalWrappedRows = chunks.length;

  // Find which chunk the cursor is in
  let wrappedRowInLine = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (column >= chunk.charStart && column < chunk.charEnd) {
      wrappedRowInLine = i;
      break;
    }
    // Cursor at end of line — belongs to last chunk
    if (column >= chunk.charEnd && i === chunks.length - 1) {
      wrappedRowInLine = i;
    }
  }

  const currentChunk = chunks[wrappedRowInLine]!;
  const colInRow = column - currentChunk.charStart;

  if (direction === 'up') {
    if (wrappedRowInLine > 0) {
      const prevChunk = chunks[wrappedRowInLine - 1]!;
      const prevChunkLen = prevChunk.charEnd - prevChunk.charStart;
      const targetCol = Math.min(colInRow, prevChunkLen);
      return info.lineStart + prevChunk.charStart + targetCol;
    }
    if (info.lineIndex === 0) {
      return null;
    }
    const prevLine = info.lines[info.lineIndex - 1] ?? '';
    const prevLineStart = info.lineStart - prevLine.length - 1;
    const prevChunks = splitByVisualWidth(prevLine, wrapWidth);
    const lastPrevChunk = prevChunks[prevChunks.length - 1]!;
    const lastPrevChunkLen = lastPrevChunk.charEnd - lastPrevChunk.charStart;
    const targetCol = Math.min(colInRow, lastPrevChunkLen);
    return prevLineStart + lastPrevChunk.charStart + targetCol;
  } else {
    if (wrappedRowInLine < totalWrappedRows - 1) {
      const nextChunk = chunks[wrappedRowInLine + 1]!;
      const nextChunkLen = nextChunk.charEnd - nextChunk.charStart;
      const targetCol = Math.min(colInRow, nextChunkLen);
      return info.lineStart + nextChunk.charStart + targetCol;
    }
    if (info.lineIndex >= info.lines.length - 1) {
      return null;
    }
    const nextLine = info.lines[info.lineIndex + 1] ?? '';
    const nextLineStart = info.lineEnd + 1;
    const nextChunks = splitByVisualWidth(nextLine, wrapWidth);
    const firstNextChunk = nextChunks[0]!;
    const firstNextChunkLen = firstNextChunk.charEnd - firstNextChunk.charStart;
    const targetCol = Math.min(colInRow, firstNextChunkLen);
    return nextLineStart + firstNextChunk.charStart + targetCol;
  }
}

export function findNextWordEnd(text: string, start: number): number {
  let i = start;

  while (i < text.length && /\s/.test(text[i])) {
    i++;
  }

  while (i < text.length && !/\s/.test(text[i])) {
    i++;
  }

  return Math.min(i, text.length);
}

export function clampOffset(valueLength: number, offset: number, mode: VimMode): number {
  if (valueLength <= 0) {
    return 0;
  }

  if (mode === 'normal') {
    const maxOffset = Math.max(0, valueLength - 1);
    return Math.max(0, Math.min(offset, maxOffset));
  }

  return Math.max(0, Math.min(offset, valueLength));
}
