export type VimMode = "insert" | "normal";

export type LineInfo = {
  lines: string[];
  lineIndex: number;
  column: number;
  lineStart: number;
  lineEnd: number;
};

export function getLineInfo(value: string, offset: number): LineInfo {
  const lines = value.split("\n");

  let currentPos = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
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
  const lastLine = lines[lastIndex] ?? "";
  const lineStart = value.length - lastLine.length;
  return {
    lines,
    lineIndex: lastIndex,
    column: lastLine.length,
    lineStart,
    lineEnd: value.length,
  };
}

export function moveCursorVertically(
  value: string,
  offset: number,
  direction: "up" | "down",
): number | null {
  if (!value.includes("\n")) {
    return null;
  }

  const info = getLineInfo(value, offset);
  const targetIndex = direction === "up" ? info.lineIndex - 1 : info.lineIndex + 1;

  if (targetIndex < 0 || targetIndex >= info.lines.length) {
    return null;
  }

  const targetLineLength = (info.lines[targetIndex] ?? "").length;
  const targetColumn = Math.min(info.column, targetLineLength);

  let newPos = 0;
  for (let i = 0; i < targetIndex; i++) {
    newPos += (info.lines[i] ?? "").length + 1;
  }

  return newPos + targetColumn;
}

export function moveCursorVisually(
  value: string,
  offset: number,
  direction: "up" | "down",
  wrapWidth: number,
): number | null {
  if (wrapWidth <= 0) {
    return moveCursorVertically(value, offset, direction);
  }

  const info = getLineInfo(value, offset);
  const currentLine = info.lines[info.lineIndex] ?? "";
  const column = info.column;

  const totalWrappedRows = Math.max(1, Math.ceil(currentLine.length / wrapWidth));
  const maxRowIndex = totalWrappedRows - 1;

  let wrappedRowInLine = Math.floor(column / wrapWidth);
  wrappedRowInLine = Math.min(wrappedRowInLine, maxRowIndex);

  const rowStartCol = wrappedRowInLine * wrapWidth;
  const visualColInRow = column - rowStartCol;

  if (direction === "up") {
    if (wrappedRowInLine > 0) {
      const newColumn =
        (wrappedRowInLine - 1) * wrapWidth + Math.min(visualColInRow, wrapWidth - 1);
      return info.lineStart + Math.min(newColumn, currentLine.length);
    }
    if (info.lineIndex === 0) {
      return null;
    }
    const prevLine = info.lines[info.lineIndex - 1] ?? "";
    const prevLineStart = info.lineStart - prevLine.length - 1;
    const prevTotalRows = Math.max(1, Math.ceil(prevLine.length / wrapWidth));
    const targetRowStart = (prevTotalRows - 1) * wrapWidth;
    const targetColumn = targetRowStart + Math.min(visualColInRow, wrapWidth - 1);
    return prevLineStart + Math.min(targetColumn, prevLine.length);
  } else {
    if (wrappedRowInLine < totalWrappedRows - 1) {
      const newColumn =
        (wrappedRowInLine + 1) * wrapWidth + Math.min(visualColInRow, wrapWidth - 1);
      return info.lineStart + Math.min(newColumn, currentLine.length);
    }
    if (info.lineIndex >= info.lines.length - 1) {
      return null;
    }
    const nextLine = info.lines[info.lineIndex + 1] ?? "";
    const nextLineStart = info.lineEnd + 1;
    const targetColumn = Math.min(visualColInRow, wrapWidth - 1);
    return nextLineStart + Math.min(targetColumn, nextLine.length);
  }
}

export function findNextWordEnd(text: string, start: number): number {
  let i = start;

  while (i < text.length && /\s/.test(text[i] ?? "")) {
    i++;
  }

  while (i < text.length && !/\s/.test(text[i] ?? "")) {
    i++;
  }

  return Math.min(i, text.length);
}

export function clampOffset(valueLength: number, offset: number, mode: VimMode): number {
  if (valueLength <= 0) {
    return 0;
  }

  if (mode === "normal") {
    const maxOffset = Math.max(0, valueLength - 1);
    return Math.max(0, Math.min(offset, maxOffset));
  }

  return Math.max(0, Math.min(offset, valueLength));
}
