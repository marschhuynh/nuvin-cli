import { useMemo, useCallback } from 'react';
import type { LineInfo } from '@/utils/textNavigation.js';

export type LineIndex = {
  lineStarts: number[];
  lineCount: number;
  getLineInfo: (offset: number) => LineInfo;
  getLine: (index: number) => string;
  getLineRange: (startLine: number, endLine: number) => string;
};

export function useLineIndex(value: string): LineIndex {
  const lineStarts = useMemo(() => {
    const starts = [0];
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '\n') {
        starts.push(i + 1);
      }
    }
    return starts;
  }, [value]);

  const lines = useMemo(() => {
    const result: string[] = [];
    for (let i = 0; i < lineStarts.length; i++) {
      const start = lineStarts[i] ?? 0;
      const end = i < lineStarts.length - 1 ? (lineStarts[i + 1] ?? value.length) - 1 : value.length;
      result.push(value.slice(start, end));
    }
    return result;
  }, [value, lineStarts]);

  const getLineInfo = useCallback(
    (offset: number): LineInfo => {
      const clampedOffset = Math.max(0, Math.min(offset, value.length));

      let low = 0;
      let high = lineStarts.length - 1;

      while (low < high) {
        const mid = Math.ceil((low + high + 1) / 2);
        if ((lineStarts[mid] ?? 0) <= clampedOffset) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }

      const lineIndex = low;
      const lineStart = lineStarts[lineIndex] ?? 0;
      const lineEnd = lineIndex < lineStarts.length - 1 ? (lineStarts[lineIndex + 1] ?? value.length) - 1 : value.length;

      return {
        lines,
        lineIndex,
        column: clampedOffset - lineStart,
        lineStart,
        lineEnd,
      };
    },
    [value, lineStarts, lines],
  );

  const getLine = useCallback(
    (index: number): string => {
      if (index < 0 || index >= lineStarts.length) return '';
      const start = lineStarts[index];
      const end = index < lineStarts.length - 1 ? lineStarts[index + 1] - 1 : value.length;
      return value.slice(start, end);
    },
    [value, lineStarts],
  );

  const getLineRange = useCallback(
    (startLine: number, endLine: number): string => {
      if (startLine < 0 || startLine >= lineStarts.length) return '';
      if (endLine < startLine || endLine >= lineStarts.length) {
        endLine = lineStarts.length - 1;
      }

      const start = lineStarts[startLine];
      const end = endLine < lineStarts.length - 1 ? lineStarts[endLine + 1] - 1 : value.length;
      return value.slice(start, end);
    },
    [value, lineStarts],
  );

  return {
    lineStarts,
    lineCount: lineStarts.length,
    getLineInfo,
    getLine,
    getLineRange,
  };
}
