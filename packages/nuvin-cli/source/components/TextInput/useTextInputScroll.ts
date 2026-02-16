import { useEffect, useState, useMemo } from 'react';
import type { BoxRef } from 'ink';

export type UseTextInputScrollOptions = {
  scrollRef: React.RefObject<BoxRef | null>;
  maxLines: number | undefined;
  visualLineCount: number;
  cursorVisualRow: number;
};

export type UseTextInputScrollReturn = {
  scrollOffset: number;
  scrollRatio: number;
  visibleRatio: number;
  hasScrolling: boolean;
  visibleLines: number;
};

export function useTextInputScroll({
  scrollRef,
  maxLines,
  visualLineCount,
  cursorVisualRow,
}: UseTextInputScrollOptions): UseTextInputScrollReturn {
  const [scrollOffset, setScrollOffset] = useState(0);

  const hasScrolling = maxLines !== undefined && visualLineCount > maxLines;
  const visibleLines = maxLines ?? visualLineCount;

  useEffect(() => {
    if (!hasScrolling) {
      if (scrollOffset !== 0) {
        setScrollOffset(0);
      }
      return;
    }

    if (!scrollRef.current) return;

    const visualRow = cursorVisualRow;
    const maxScroll = Math.max(0, visualLineCount - visibleLines);

    if (visualRow < scrollOffset) {
      const newOffset = Math.max(0, visualRow);
      setScrollOffset(newOffset);
      scrollRef.current.scrollTo({ y: newOffset });
    } else if (visualRow >= scrollOffset + visibleLines) {
      const newOffset = Math.min(maxScroll, visualRow - visibleLines + 1);
      setScrollOffset(newOffset);
      scrollRef.current.scrollTo({ y: newOffset });
    } else if (scrollOffset > maxScroll) {
      setScrollOffset(maxScroll);
      scrollRef.current.scrollTo({ y: maxScroll });
    }
  }, [cursorVisualRow, hasScrolling, scrollOffset, visibleLines, visualLineCount, scrollRef]);

  const scrollRatio = useMemo(() => {
    if (!hasScrolling || visualLineCount <= visibleLines) return 0;
    const maxScroll = visualLineCount - visibleLines;
    return maxScroll > 0 ? scrollOffset / maxScroll : 0;
  }, [hasScrolling, visualLineCount, visibleLines, scrollOffset]);

  const visibleRatio = useMemo(() => {
    if (visualLineCount === 0) return 1;
    return Math.min(1, visibleLines / visualLineCount);
  }, [visualLineCount, visibleLines]);

  return {
    scrollOffset,
    scrollRatio,
    visibleRatio,
    hasScrolling,
    visibleLines,
  };
}
