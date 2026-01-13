import { useState, useCallback, useEffect, useMemo } from 'react';
import type { LineIndex } from './useLineIndex.js';

export type ViewportState = {
  scrollOffset: number;
  visibleStartLine: number;
  visibleEndLine: number;
  totalLines: number;
};

export type UseViewportOptions = {
  value: string;
  cursorOffset: number;
  maxLines?: number;
  lineIndex: LineIndex;
};

export function useViewport({ value, cursorOffset, maxLines, lineIndex }: UseViewportOptions) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const { lineStarts, lineCount: totalLines, getLineInfo, getLineRange } = lineIndex;

  const needsScrolling = maxLines !== undefined && totalLines > maxLines;
  const visibleLines = maxLines ?? totalLines;

  const cursorLine = useMemo(() => {
    return getLineInfo(cursorOffset).lineIndex;
  }, [getLineInfo, cursorOffset]);

  useEffect(() => {
    if (!needsScrolling) {
      setScrollOffset(0);
      return;
    }

    setScrollOffset((currentOffset) => {
      if (cursorLine < currentOffset) {
        return cursorLine;
      }

      if (cursorLine >= currentOffset + visibleLines) {
        return cursorLine - visibleLines + 1;
      }

      return currentOffset;
    });
  }, [cursorLine, visibleLines, needsScrolling]);

  const visibleContent = useMemo(() => {
    if (!needsScrolling) {
      return {
        visibleValue: value,
        cursorOffsetInView: cursorOffset,
        visibleStartLine: 0,
        visibleEndLine: totalLines - 1,
        linesAbove: 0,
        linesBelow: 0,
        visibleStartChar: 0,
        visibleEndChar: value.length,
      };
    }

    const startLine = scrollOffset;
    const endLine = Math.min(startLine + visibleLines, totalLines);

    const visibleValue = getLineRange(startLine, endLine - 1);

    const charsBeforeStartLine = lineStarts[startLine] ?? 0;
    const charsAtEndLine = lineStarts[endLine] ?? value.length;
    const cursorOffsetInView = Math.max(0, cursorOffset - charsBeforeStartLine);

    return {
      visibleValue,
      cursorOffsetInView,
      visibleStartLine: startLine,
      visibleEndLine: endLine - 1,
      linesAbove: scrollOffset,
      linesBelow: Math.max(0, totalLines - endLine),
      visibleStartChar: charsBeforeStartLine,
      visibleEndChar: charsAtEndLine,
    };
  }, [value, cursorOffset, needsScrolling, scrollOffset, visibleLines, totalLines, lineStarts, getLineRange]);

  const scrollRatio = useMemo(() => {
    if (!needsScrolling || value.length === 0) return 0;
    const { visibleStartChar } = visibleContent;
    const maxScrollChar = Math.max(0, value.length - (visibleContent.visibleEndChar - visibleContent.visibleStartChar));
    return maxScrollChar > 0 ? visibleStartChar / maxScrollChar : 0;
  }, [needsScrolling, value.length, visibleContent]);

  const visibleRatio = useMemo(() => {
    if (value.length === 0) return 1;
    const visibleChars = visibleContent.visibleEndChar - visibleContent.visibleStartChar;
    return Math.min(1, visibleChars / value.length);
  }, [value.length, visibleContent]);

  const getVisibleContent = useCallback(() => visibleContent, [visibleContent]);

  const scrollTo = useCallback(
    (line: number) => {
      if (!needsScrolling) return;
      const maxScroll = Math.max(0, totalLines - visibleLines);
      setScrollOffset(Math.max(0, Math.min(line, maxScroll)));
    },
    [needsScrolling, totalLines, visibleLines],
  );

  const scrollBy = useCallback(
    (delta: number) => {
      if (!needsScrolling) return;
      setScrollOffset((current) => {
        const maxScroll = Math.max(0, totalLines - visibleLines);
        return Math.max(0, Math.min(current + delta, maxScroll));
      });
    },
    [needsScrolling, totalLines, visibleLines],
  );

  return {
    scrollOffset,
    totalLines,
    visibleLines,
    cursorLine,
    getVisibleContent,
    scrollTo,
    scrollBy,
    hasScrolling: needsScrolling,
    scrollRatio,
    visibleRatio,
  };
}
