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
  visible,
}: {
  scrollInfo: ScrollInfo;
  color?: string;
  trackColor?: string;
  visible: boolean;
}) {
  const { scrollY, containerHeight, contentHeight } = scrollInfo;

  if (containerHeight <= 0) {
    return null;
  }

  // Always reserve the column width; only draw thumb when scrollable
  const trackHeight = containerHeight;

  if (!visible || contentHeight <= containerHeight) {
    return (
      <Box flexDirection="column" flexShrink={0} marginLeft={1}>
        {Array.from({ length: trackHeight }, (_, i) => (
          <Text key={`empty-${i}`}> </Text>
        ))}
      </Box>
    );
  }

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
  estimateItemHeight?: (item: T, index: number) => number;
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
  onItemClick?: (item: T, index: number) => void;
  onEmptyClick?: () => void;
  selectedItemKey?: string | null;
} & Omit<BoxProps, 'ref' | 'overflow' | 'children'>;

export function VirtualizedList<T>({
  items,
  renderItem,
  keyExtractor,
  estimateItemHeight,
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
  onItemClick,
  onEmptyClick,
  selectedItemKey,
  width: widthProp,
  height: heightProp,
  ...boxProps
}: VirtualizedListProps<T>) {
  const containerRef = useRef<BoxRef>(null);
  const itemRefsMap = useRef<Map<string, DOMElement>>(new Map());
  const shouldAutoScrollRef = useRef(true);
  const heightCacheRef = useRef<Map<string, number>>(new Map());
  const [heightCacheVersion, setHeightCacheVersion] = useState(0);

  // Stable refs so measureVisibleItems (a stable callback) can read current values.
  // const itemsRef = useRef(items);
  // const keyExtractorRef = useRef(keyExtractor);
  // useLayoutEffect(() => {
  //   itemsRef.current = items;
  //   keyExtractorRef.current = keyExtractor;
  // });

  const [scrollY, setScrollY] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Scroll anchor: the item key that was at the top of the viewport and how far
  // into it scrollY pointed. Snapshotted before each measurement pass and used
  // to recompute scrollY afterwards so the viewport stays visually stable even
  // when items above it are measured for the first time (replacing placeholder
  // heights with true heights, which would otherwise shift the content and cause
  // a visible scroll jump).
  const scrollAnchorRef = useRef<{ key: string; offset: number } | null>(null);

  const measureVisibleItems = useCallback(() => {
    // ── Phase 1: measure all currently rendered items ──────────────────────
    const updates = new Map<string, number>();
    for (const [key, element] of itemRefsMap.current) {
      try {
        const { height } = measureElement(element);
        if (height > 0 && heightCacheRef.current.get(key) !== height) {
          updates.set(key, height);
        }
      } catch {
        // Element might not be mounted yet
      }
    }

    if (updates.size === 0) return;

    // ── Phase 2: snapshot anchor before mutating the cache ─────────────────
    // Only anchor when the user is NOT auto-scrolling; if they are, the bottom
    // anchor is already maintained by the shouldAutoScrollRef path.
    const anchor = scrollAnchorRef.current;

    // ── Phase 3: apply all height updates atomically ───────────────────────
    for (const [key, height] of updates) {
      heightCacheRef.current.set(key, height);
    }

    // ── Phase 4: recompute scrollY from anchor to prevent visual jump ──────
    if (anchor && !shouldAutoScrollRef.current) {
      // Recompute itemOffsets inline (heightCacheVersion hasn't bumped yet).
      let anchorOffset = 0;
      let anchorFound = false;
      for (let i = 0; i < items.length; i++) {
        const k = keyExtractor(items[i], i);
        if (k === anchor.key) {
          anchorFound = true;
          const corrected = anchorOffset + anchor.offset;
          setScrollY(corrected);
          break;
        }
        const h = heightCacheRef.current.get(k) ?? 1;
        anchorOffset += h;
      }
      // If anchor item is gone (evicted), fall back to clamping — the sync
      // useLayoutEffect below will handle it.
      if (!anchorFound) {
        scrollAnchorRef.current = null;
      }
    }

    setHeightCacheVersion((v) => v + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: items and keyExtractor are accessed via refs (see below) so this
  // callback never needs to be recreated.

  // Evict stale entries from caches when items change
  useEffect(() => {
    const currentKeys = new Set(items.map((item, i) => keyExtractor(item, i)));
    let hasEvictions = false;

    for (const key of heightCacheRef.current.keys()) {
      if (!currentKeys.has(key)) {
        heightCacheRef.current.delete(key);
        hasEvictions = true;
      }
    }
    for (const key of itemRefsMap.current.keys()) {
      if (!currentKeys.has(key)) {
        itemRefsMap.current.delete(key);
      }
    }

    if (hasEvictions) {
      setHeightCacheVersion((v) => v + 1);
    }
  }, [items, keyExtractor]);

  // When the viewport width changes, all cached item heights are invalid (items may reflow)
  const prevWidthRef = useRef(widthProp);
  useEffect(() => {
    if (prevWidthRef.current !== widthProp) {
      prevWidthRef.current = widthProp;
      heightCacheRef.current.clear();
      setHeightCacheVersion((v) => v + 1);
    }
  }, [widthProp]);

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
        total += estimateItemHeight ? estimateItemHeight(items[i], i) : 1;
      }
    }

    return {
      itemOffsets: offsets,
      totalContentHeight: total,
    };
  }, [items, keyExtractor, heightCacheVersion, estimateItemHeight]);

  const isScrollable = totalContentHeight > containerHeight;
  const needsScrollbar = showScrollbar && isScrollable;
  const internalFocus = useFocus({ active: isScrollable && !manualFocus });
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

  // Compute effective scroll position once — when auto-scrolling, derive from totalContentHeight
  // synchronously to avoid a one-frame lag where scrollY state hasn't caught up yet.
  const effectiveScrollY = useMemo(() => {
    const maxScroll = Math.max(0, totalContentHeight - containerHeight);
    if (shouldAutoScrollRef.current) return maxScroll;
    return Math.max(0, Math.min(scrollY, maxScroll));
  }, [scrollY, totalContentHeight, containerHeight]);

  const visibleRange = useMemo(() => {
    if (items.length === 0) return { start: 0, end: -1 };
    if (containerHeight <= 0) return { start: 0, end: Math.min(overscan, items.length - 1) };

    const startIndex = Math.max(0, findStartIndex(effectiveScrollY) - overscan);

    let endIndex = startIndex;
    let accHeight = itemOffsets[startIndex] || 0;
    const viewportEnd = effectiveScrollY + containerHeight;

    while (endIndex < items.length && accHeight < viewportEnd) {
      const key = keyExtractor(items[endIndex], endIndex);
      const height = heightCacheRef.current.get(key) ?? 1;
      accHeight += height;
      endIndex++;
    }

    endIndex = Math.min(items.length - 1, endIndex + overscan);

    return { start: startIndex, end: endIndex };
  }, [items, effectiveScrollY, containerHeight, overscan, findStartIndex, itemOffsets, keyExtractor]);

  // Update scroll anchor: the item at the top of the real viewport and how far
  // into it scrollY points. Written every render so measureVisibleItems always
  // sees the pre-measurement state when it runs in useLayoutEffect.
  // Skip when auto-scrolling — the bottom is already anchored by shouldAutoScrollRef.
  if (!shouldAutoScrollRef.current && items.length > 0 && containerHeight > 0) {
    // Find the first item whose bottom edge exceeds effectiveScrollY — that's
    // the item at the visual top of the viewport.
    const anchorIndex = findStartIndex(effectiveScrollY);
    if (anchorIndex >= 0 && anchorIndex < items.length) {
      const anchorKey = keyExtractor(items[anchorIndex], anchorIndex);
      const anchorItemTop = itemOffsets[anchorIndex] ?? 0;
      scrollAnchorRef.current = {
        key: anchorKey,
        offset: effectiveScrollY - anchorItemTop,
      };
    }
  }

  // Measure visible items after render — fires when:
  // - items reference changes (streaming: content of existing items grew/shrank)
  // - visibleRange changes (scrolling: new items entered the render window and need measuring)
  // - heightCacheVersion changes (cache invalidated by width change — items need re-measuring)
  // biome-ignore lint/correctness/useExhaustiveDependencies: items, visibleRange, and heightCacheVersion trigger remeasurement
  useLayoutEffect(() => {
    measureVisibleItems();
  }, [measureVisibleItems, items, visibleRange.start, visibleRange.end, heightCacheVersion]);

  const scrollTo = useCallback(
    (newY: number) => {
      const currentMaxScrollY = Math.max(0, totalContentHeight - containerHeight);
      const clampedY = Math.max(0, Math.min(newY, currentMaxScrollY));
      setScrollY(clampedY);

      const isAtBottom = clampedY >= currentMaxScrollY;
      shouldAutoScrollRef.current = isAtBottom;
    },
    [totalContentHeight, containerHeight],
  );

  const scrollBy = useCallback(
    (delta: number) => {
      const currentMaxScrollY = Math.max(0, totalContentHeight - containerHeight);
      setScrollY((y) => {
        const baseY = shouldAutoScrollRef.current ? currentMaxScrollY : y;
        const newY = Math.max(0, Math.min(baseY + delta, currentMaxScrollY));
        const isAtBottom = newY >= currentMaxScrollY;
        shouldAutoScrollRef.current = isAtBottom;
        return newY;
      });
    },
    [totalContentHeight, containerHeight],
  );

  const findItemAtPosition = useCallback(
    (contentY: number): number => {
      if (items.length === 0 || contentY < 0) return -1;
      let low = 0;
      let high = itemOffsets.length - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (itemOffsets[mid] <= contentY) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      const index = itemOffsets[low] <= contentY ? low : low - 1;
      if (index < 0 || index >= items.length) return -1;
      const itemTop = itemOffsets[index] ?? 0;
      const key = keyExtractor(items[index], index);
      const itemHeight = heightCacheRef.current.get(key) ?? (estimateItemHeight ? estimateItemHeight(items[index], index) : 1);
      return contentY < itemTop + itemHeight ? index : -1;
    },
    [items, itemOffsets, keyExtractor, estimateItemHeight],
  );

  const handleMouseEvent = useCallback(
    (event: MouseEvent) => {
      if (event.type === 'click' && event.button === 0 && onItemClick) {
        const containerBounds = containerRef.current?.getBounds();
        if (containerBounds) {
          // Bounds check: ignore clicks outside the container
          if (
            event.x < containerBounds.x ||
            event.x >= containerBounds.x + containerBounds.width ||
            event.y < containerBounds.y ||
            event.y >= containerBounds.y + containerBounds.height
          ) {
            return;
          }
          const contentY = effectiveScrollY + (event.y - containerBounds.y);
          const index = findItemAtPosition(contentY);
          if (index >= 0) {
            onItemClick(items[index], index);
            return true;
          }
          // Click inside container but no item hit
          onEmptyClick?.();
          return true;
        }
      }
      if (event.type === 'wheel-up' && enableMouseScroll) {
        const multiplier = event.count || 1;
        scrollBy(-scrollStep * multiplier);
        return true;
      }
      if (event.type === 'wheel-down' && enableMouseScroll) {
        const multiplier = event.count || 1;
        scrollBy(scrollStep * multiplier);
        return true;
      }
    },
    [onItemClick, onEmptyClick, items, findItemAtPosition, effectiveScrollY, enableMouseScroll, scrollBy, scrollStep],
  );

  const handleKeyboardEvent = useCallback(
    (input: string, _key: Key) => {
      if (!isFocused || !isScrollable || !enableKeyboardScroll) {
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
      isScrollable,
      scrollTo,
      totalContentHeight,
      containerHeight,
      enableKeyboardScroll,
    ],
  );

  useMouse(handleMouseEvent, { isActive: (enableMouseScroll && isScrollable) || !!onItemClick, priority: mousePriority });
  useInput(handleKeyboardEvent, { isActive: isScrollable, priority: mousePriority });

  // biome-ignore lint/correctness/useExhaustiveDependencies: items.length and heightProp intentionally trigger remeasurement
  useLayoutEffect(() => {
    if (containerRef.current) {
      const { height } = measureElement(containerRef.current);
      if (height > 0 && height !== containerHeight) {
        setContainerHeight(height);
      }
    }
  }, [items, containerHeight, heightProp]);
  // });

  // Sync scrollY state to match effective position — useLayoutEffect to avoid flicker
  useLayoutEffect(() => {
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
    scrollY: effectiveScrollY,
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

  const skippedItemsHeight = topOffset;
  const marginTopValue = -effectiveScrollY + skippedItemsHeight;

  return (
    <Box flexDirection="row" overflow="hidden" width={widthProp} height={heightProp} {...boxProps}>
      <Box ref={containerRef} flexDirection="column" flexGrow={1} overflow="hidden">
        <Box flexDirection="column" marginTop={marginTopValue}>
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
      {showScrollbar && <Scrollbar scrollInfo={scrollInfo} color={scrollbarColor} trackColor={scrollbarTrackColor} visible={needsScrollbar} />}
    </Box>
  );
}
