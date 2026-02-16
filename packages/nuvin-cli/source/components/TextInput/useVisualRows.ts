import { useMemo } from 'react';
import type { LineIndex } from './useLineIndex.js';
import { splitByVisualWidth, countVisualRows, charColToVisualPosition } from './widthUtils.js';

export type VisualRow = {
  text: string;
  logicalLine: number;
  startCol: number;
  endCol: number;
  isFullLine: boolean;
};

export type CursorInfo = {
  logicalRow: number;
  logicalCol: number;
  visualRow: number;
  visualCol: number;
};

export type UseVisualRowsOptions = {
  value: string;
  cursorOffset: number;
  mask: string | undefined;
  effectiveWidth: number;
  maxLines: number | undefined;
  lineIndex: LineIndex;
};

export type UseVisualRowsReturn = {
  lines: string[];
  visualRows: VisualRow[];
  cursorInfo: CursorInfo;
};

export function useVisualRows({
  value,
  cursorOffset,
  mask,
  effectiveWidth,
  maxLines,
  lineIndex,
}: UseVisualRowsOptions): UseVisualRowsReturn {
  const lines = useMemo(() => {
    const displayValue = mask ? mask.repeat(value.length) : value;
    return displayValue.split('\n');
  }, [value, mask]);

  const visualRows = useMemo(() => {
    // Only split into visual rows when scrolling is needed
    // Otherwise let Text wrap naturally
    if (!effectiveWidth || effectiveWidth <= 0 || maxLines === undefined) {
      return lines.map((line, logicalIndex) => ({
        text: line,
        logicalLine: logicalIndex,
        startCol: 0,
        endCol: line.length,
        isFullLine: true,
      }));
    }

    const rows: VisualRow[] = [];

    for (let logicalIndex = 0; logicalIndex < lines.length; logicalIndex++) {
      const line = lines[logicalIndex] ?? '';
      if (line.length === 0) {
        rows.push({
          text: '',
          logicalLine: logicalIndex,
          startCol: 0,
          endCol: 0,
          isFullLine: true,
        });
      } else {
        const chunks = splitByVisualWidth(line, effectiveWidth);
        for (const chunk of chunks) {
          rows.push({
            text: chunk.text,
            logicalLine: logicalIndex,
            startCol: chunk.charStart,
            endCol: chunk.charEnd,
            isFullLine: false,
          });
        }
      }
    }

    return rows;
  }, [lines, effectiveWidth, maxLines]);

  const cursorInfo = useMemo(() => {
    const info = lineIndex.getLineInfo(cursorOffset);
    const logicalRow = info.lineIndex;
    const logicalCol = info.column;

    // When not scrolling, use logical positions (Text wraps naturally)
    if (!effectiveWidth || effectiveWidth <= 0 || maxLines === undefined) {
      return {
        logicalRow,
        logicalCol,
        visualRow: logicalRow,
        visualCol: logicalCol,
      };
    }

    // Count visual rows for all lines before the cursor's logical line
    let visualRow = 0;
    for (let i = 0; i < logicalRow; i++) {
      visualRow += countVisualRows(lines[i] ?? '', effectiveWidth);
    }

    const currentLine = lines[logicalRow] ?? '';
    const pos = charColToVisualPosition(currentLine, logicalCol, effectiveWidth);
    visualRow += pos.visualRowInLine;

    return {
      logicalRow,
      logicalCol,
      visualRow,
      visualCol: pos.charColInRow,
    };
  }, [lineIndex, cursorOffset, effectiveWidth, lines, maxLines]);

  return { lines, visualRows, cursorInfo };
}
