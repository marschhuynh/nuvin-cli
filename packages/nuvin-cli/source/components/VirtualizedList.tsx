import { type DOMElement, type BoxRef, Box, type BoxProps, measureElement, Text } from 'ink';
import { useRef, useEffect, useCallback, useState, useMemo, useLayoutEffect, type ReactNode } from 'react';
import { useMouse, useInput, useFocus, type MouseEvent, type Key } from '../contexts/InputContext/index.js';

type ScrollInfo = {
  scrollY: number;
  containerHeight: number;
  contentHeight: number;
};

function Scrollbar({
  scrollInfo,
  color = 'gray',
  trackColor = 'dim',
}: {
  scrollInfo: ScrollInfo;
  color?: string;
  trackColor?: string;
}) {
  const { scrollY, containerHeight, contentHeight } = scrollInfo;

  if (contentHeight <= containerHeight || containerHeight <= 0) {
    return null;
  }

  const trackHeight = containerHeight;
  const thumbHeight = Math.max(1, Math.round((containerHeight / contentHeight) * trackHeight));
  const maxScrollY = contentHeight - containerHeight;
  const scrollRatio = maxScrollY > 0 ? scrollY / maxScrollY : 0;
  const thumbPosition = Math.round(scrollRatio * (trackHeight - thumbHeight));

  const track: string[] = [];
  for (let i = 0; i < trackHeight; i++) {
    if (i >= thumbPosition && i < thumbPosition + thumbHeight) {
      track.push('┃');
    } else {
      track.push('│');
    }
  }

  return (
    <Box flexDirection="column" flexShrink={0} marginLeft={1}>
      {track.map((char, i) => (
        <Text key={`track-${i}-${char}`} color={char === '┃' ? color : trackColor}>
          {char}
        </Text>
      ))}
    </Box>
  );
}

export type VirtualizedListProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T, index: number) => string;
  overscan?: number;
  scrollStep?: number;
  enableMouseScroll?: boolean;
  showScrollbar?: boolean;
  scrollbarColor?: string;
  scrollbarTrackColor?: string;
  mousePriority?: number;
  enableKeyboardScroll?: boolean;
  focus?: boolean;
  manualFocus?: boolean;
  onFocusChange?: (focused: boolean) => void;
} & Omit<BoxProps, 'ref' | 'overflow' | 'children'>;

export function VirtualizedList<T>({
  items,
  renderItem,
  keyExtractor,
  overscan = 10,
  scrollStep = 1,
  enableMouseScroll = true,
  showScrollbar = true,
  scrollbarColor = 'white',
  scrollbarTrackColor = 'gray',
  mousePriority = 0,
  enableKeyboardScroll = true,
  focus: externalFocus,
  manualFocus = false,
  onFocusChange,
  ...boxProps
}: VirtualizedListProps<T>) {
  const containerRef = useRef<BoxRef>(null);
  const contentRef = useRef<BoxRef>(null);
  const itemRefsMap = useRef<Map<string, DOMElement>>(new Map());
  const shouldAutoScrollRef = useRef(true);
  const heightCacheRef = useRef<Map<string, number>>(new Map());
  const [heightCacheVersion, setHeightCacheVersion] = useState(0);

  const [scrollY, setScrollY] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const measureVisibleItems = useCallback(() => {
    let hasChanges = false;

    for (const [key, element] of itemRefsMap.current) {
      try {
        const { height } = measureElement(element);
        if (height > 0 && heightCacheRef.current.get(key) !== height) {
          heightCacheRef.current.set(key, height);
          hasChanges = true;
        }
      } catch {
        // Element might not be mounted
      }
    }

    if (hasChanges) {
      setHeightCacheVersion((v) => v + 1);
    }
  }, []);

  useLayoutEffect(() => {
    measureVisibleItems();
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: heightCacheVersion is needed
  const { itemOffsets, totalContentHeight } = useMemo(() => {
    const offsets: number[] = [];
    let total = 0;

    for (let i = 0; i < items.length; i++) {
      offsets.push(total);
      const key = keyExtractor(items[i], i);
      const cachedHeight = heightCacheRef.current.get(key);
      if (cachedHeight !== undefined) {
        total += cachedHeight;
      } else {
        total += 1;
      }
    }

    return {
      itemOffsets: offsets,
      totalContentHeight: total,
    };
  }, [items, keyExtractor, heightCacheVersion]);

  const needsScrollbar = showScrollbar && totalContentHeight > containerHeight;
  const internalFocus = useFocus({ active: needsScrollbar && !manualFocus });
  const isFocused = externalFocus !== undefined ? externalFocus : internalFocus.isFocused;

  useEffect(() => {
    onFocusChange?.(isFocused);
  }, [isFocused, onFocusChange]);

  const findStartIndex = useCallback(
    (scrollPos: number): number => {
      if (items.length === 0) return 0;
      if (scrollPos <= 0) return 0;

      let low = 0;
      let high = itemOffsets.length - 1;

      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (itemOffsets[mid] < scrollPos) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }

      return Math.max(0, low - 1);
    },
    [itemOffsets, items.length],
  );

  const visibleRange = useMemo(() => {
    if (items.length === 0) return { start: 0, end: -1 };
    if (containerHeight <= 0) return { start: 0, end: Math.min(overscan, items.length - 1) };

    const maxScrollY = Math.max(0, totalContentHeight - containerHeight);
    const effectiveScrollY = shouldAutoScrollRef.current ? maxScrollY : scrollY;
    const clampedScrollY = Math.max(0, Math.min(effectiveScrollY, maxScrollY));
    const startIndex = Math.max(0, findStartIndex(clampedScrollY) - overscan);

    let endIndex = startIndex;
    let accHeight = itemOffsets[startIndex] || 0;
    const viewportEnd = clampedScrollY + containerHeight;

    while (endIndex < items.length && accHeight < viewportEnd) {
      const key = keyExtractor(items[endIndex], endIndex);
      const height = heightCacheRef.current.get(key) ?? 1;
      accHeight += height;
      endIndex++;
    }

    endIndex = Math.min(items.length - 1, endIndex + overscan);

    return { start: startIndex, end: endIndex };
  }, [items, scrollY, containerHeight, overscan, findStartIndex, itemOffsets, keyExtractor, totalContentHeight]);

  const scrollTo = useCallback(
    (newY: number) => {
      const currentMaxScrollY = Math.max(0, totalContentHeight - containerHeight);
      const clampedY = Math.max(0, Math.min(newY, currentMaxScrollY));
      setScrollY(clampedY);

      const isAtBottom = clampedY >= currentMaxScrollY - 1;
      shouldAutoScrollRef.current = isAtBottom;
    },
    [totalContentHeight, containerHeight],
  );

  const scrollBy = useCallback(
    (delta: number) => {
      const currentMaxScrollY = Math.max(0, totalContentHeight - containerHeight);
      setScrollY((y) => {
        const newY = Math.max(0, Math.min(y + delta, currentMaxScrollY));
        const isAtBottom = newY >= currentMaxScrollY - 1;
        shouldAutoScrollRef.current = isAtBottom;
        return newY;
      });
    },
    [totalContentHeight, containerHeight],
  );

  const handleMouseEvent = useCallback(
    (event: MouseEvent) => {
      const multiplier = event.count || 1;
      if (event.type === 'wheel-up') {
        scrollBy(-scrollStep * multiplier);
        return true;
      }
      if (event.type === 'wheel-down') {
        scrollBy(scrollStep * multiplier);
        return true;
      }
    },
    [scrollBy, scrollStep],
  );

  const handleKeyboardEvent = useCallback(
    (input: string, _key: Key) => {
      if (!isFocused || !needsScrollbar || !enableKeyboardScroll) {
        if (isFocused && (input === 'j' || input === 'k' || input === 'g' || input === 'G')) {
          return true;
        }
        return;
      }

      if (input === 'j') {
        scrollBy(scrollStep);
        return true;
      }
      if (input === 'k') {
        scrollBy(-scrollStep);
        return true;
      }
      if (input === 'g') {
        scrollTo(0);
        shouldAutoScrollRef.current = false;
        return true;
      }
      if (input === 'G') {
        const currentMaxScrollY = Math.max(0, totalContentHeight - containerHeight);
        scrollTo(currentMaxScrollY);
        shouldAutoScrollRef.current = true;
        return true;
      }
    },
    [
      isFocused,
      scrollBy,
      scrollStep,
      needsScrollbar,
      scrollTo,
      totalContentHeight,
      containerHeight,
      enableKeyboardScroll,
    ],
  );

  useMouse(handleMouseEvent, { isActive: enableMouseScroll && needsScrollbar, priority: mousePriority });
  useInput(handleKeyboardEvent, { isActive: needsScrollbar, priority: mousePriority });

  useLayoutEffect(() => {
    if (containerRef.current) {
      const { height } = measureElement(containerRef.current);
      if (height > 0 && height !== containerHeight) {
        setContainerHeight(height);
      }
    }
  });

  useEffect(() => {
    if (containerHeight <= 0) return;
    const maxScroll = Math.max(0, totalContentHeight - containerHeight);

    if (shouldAutoScrollRef.current) {
      setScrollY((current) => (current === maxScroll ? current : maxScroll));
    } else {
      setScrollY((current) => Math.min(current, maxScroll));
    }
  }, [totalContentHeight, containerHeight]);

  const topOffset =
    visibleRange.start >= 0 && visibleRange.start < itemOffsets.length ? itemOffsets[visibleRange.start] : 0;
  const visibleItems = items.slice(visibleRange.start, visibleRange.end + 1);

  const scrollInfo: ScrollInfo = {
    scrollY,
    containerHeight,
    contentHeight: totalContentHeight,
  };

  const registerItemRef = useCallback((key: string, element: DOMElement | null) => {
    if (element) {
      itemRefsMap.current.set(key, element);
    } else {
      itemRefsMap.current.delete(key);
    }
  }, []);

  const maxScrollY = Math.max(0, totalContentHeight - containerHeight);
  const effectiveScrollY = shouldAutoScrollRef.current ? maxScrollY : scrollY;
  const clampedScrollY = Math.max(0, Math.min(effectiveScrollY, maxScrollY));
  const skippedItemsHeight = topOffset;
  const marginTopValue = -clampedScrollY + skippedItemsHeight;

  return (
    <Box flexDirection="row" overflow="hidden" {...boxProps}>
      <Box ref={containerRef} flexDirection="column" flexGrow={1} overflow="hidden">
        <Box ref={contentRef} flexDirection="column" marginTop={marginTopValue}>
          {visibleItems.map((item, i) => {
            const actualIndex = visibleRange.start + i;
            const key = keyExtractor(item, actualIndex);
            return (
              <Box key={key} flexShrink={0} ref={(el) => registerItemRef(key, el)}>
                {renderItem(item, actualIndex)}
              </Box>
            );
          })}
        </Box>
      </Box>
      {needsScrollbar && <Scrollbar scrollInfo={scrollInfo} color={scrollbarColor} trackColor={scrollbarTrackColor} />}
    </Box>
  );
}
