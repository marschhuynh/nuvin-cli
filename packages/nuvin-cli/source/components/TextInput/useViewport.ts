import { useState, useCallback, useEffect, useMemo } from 'react';
import { getLineInfo } from '@/utils/textNavigation.js';

export type ViewportState = {
  scrollOffset: number;
  visibleStartLine: number;
  visibleEndLine: number;
  totalLines: number;
};

export type UseViewportOptions = {
  value: string;
  cursorOffset: number;
  maxHeight?: number;
};

export function useViewport({ value, cursorOffset, maxHeight }: UseViewportOptions) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const lines = useMemo(() => value.split('\n'), [value]);
  const totalLines = lines.length;

  const needsScrolling = maxHeight !== undefined && totalLines > maxHeight;

  const contentHeight = useMemo(() => {
    if (!maxHeight || !needsScrolling) {
      return totalLines;
    }
    let reserved = 0;
    if (scrollOffset > 0) reserved += 1;
    if (scrollOffset + (maxHeight - reserved) < totalLines) reserved += 1;
    return Math.max(1, maxHeight - reserved);
  }, [maxHeight, needsScrolling, scrollOffset, totalLines]);

  const lineInfo = getLineInfo(value, cursorOffset);
  const cursorLine = lineInfo.lineIndex;

  useEffect(() => {
    if (!maxHeight || !needsScrolling) {
      setScrollOffset(0);
      return;
    }

    setScrollOffset((currentOffset) => {
      const hasTopIndicator = currentOffset > 0;
      const effectiveHeight = hasTopIndicator ? maxHeight - 2 : maxHeight - 1;

      if (cursorLine < currentOffset) {
        return cursorLine;
      }

      if (cursorLine >= currentOffset + effectiveHeight) {
        const newOffset = cursorLine - effectiveHeight + 1;
        const maxScroll = Math.max(0, totalLines - (maxHeight - 1));
        return Math.min(newOffset, maxScroll);
      }

      return currentOffset;
    });
  }, [cursorLine, maxHeight, needsScrolling, totalLines]);

  const getVisibleContent = useCallback((): {
    visibleValue: string;
    cursorOffsetInView: number;
    visibleStartLine: number;
    visibleEndLine: number;
    showTopIndicator: boolean;
    showBottomIndicator: boolean;
    linesAbove: number;
    linesBelow: number;
  } => {
    if (!maxHeight || !needsScrolling) {
      return {
        visibleValue: value,
        cursorOffsetInView: cursorOffset,
        visibleStartLine: 0,
        visibleEndLine: totalLines - 1,
        showTopIndicator: false,
        showBottomIndicator: false,
        linesAbove: 0,
        linesBelow: 0,
      };
    }

    const showTopIndicator = scrollOffset > 0;
    const availableForContent = showTopIndicator ? maxHeight - 1 : maxHeight;
    
    const startLine = scrollOffset;
    const tentativeEndLine = Math.min(startLine + availableForContent, totalLines);
    const showBottomIndicator = tentativeEndLine < totalLines;
    
    const endLine = showBottomIndicator 
      ? Math.min(startLine + availableForContent - 1, totalLines)
      : tentativeEndLine;

    const visibleLines_ = lines.slice(startLine, endLine);
    const visibleValue = visibleLines_.join('\n');

    let charsBeforeStartLine = 0;
    for (let i = 0; i < startLine; i++) {
      charsBeforeStartLine += lines[i].length + 1;
    }

    const cursorOffsetInView = Math.max(0, cursorOffset - charsBeforeStartLine);

    return {
      visibleValue,
      cursorOffsetInView,
      visibleStartLine: startLine,
      visibleEndLine: endLine - 1,
      showTopIndicator,
      showBottomIndicator,
      linesAbove: scrollOffset,
      linesBelow: totalLines - endLine,
    };
  }, [value, cursorOffset, maxHeight, needsScrolling, scrollOffset, lines, totalLines]);

  const scrollTo = useCallback((line: number) => {
    if (!maxHeight) return;
    const maxScroll = Math.max(0, totalLines - contentHeight);
    setScrollOffset(Math.max(0, Math.min(line, maxScroll)));
  }, [maxHeight, totalLines, contentHeight]);

  const scrollBy = useCallback((delta: number) => {
    if (!maxHeight) return;
    setScrollOffset((current) => {
      const maxScroll = Math.max(0, totalLines - contentHeight);
      return Math.max(0, Math.min(current + delta, maxScroll));
    });
  }, [maxHeight, totalLines, contentHeight]);

  return {
    scrollOffset,
    totalLines,
    visibleLines: contentHeight,
    cursorLine,
    getVisibleContent,
    scrollTo,
    scrollBy,
    hasScrolling: needsScrolling,
  };
}
