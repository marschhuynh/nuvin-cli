import type React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Text, measureElement, type BoxRef } from 'ink';
import { useInput, useMouse, type MouseEvent } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';

export interface ScrollableSelectItem<T = unknown> {
  key: string;
  value: T;
}

export interface ScrollableSelectListProps<T> {
  items: ScrollableSelectItem<T>[];
  selectedIndex: number;
  onSelect?: (item: ScrollableSelectItem<T>, index: number) => void;
  onHighlight?: (item: ScrollableSelectItem<T>, index: number) => void;
  renderItem: (item: T, isSelected: boolean, index: number) => React.ReactNode;
  focus?: boolean;
  enableRotation?: boolean;
  scrollStep?: number;
  showScrollbar?: boolean;
  maxHeight?: number;
}

function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  return ((...args: unknown[]) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

function Scrollbar({
  scrollY,
  containerHeight,
  contentHeight,
  color,
  trackColor,
}: {
  scrollY: number;
  containerHeight: number;
  contentHeight: number;
  color: string;
  trackColor: string;
}) {
  if (contentHeight <= containerHeight) return null;

  const trackHeight = containerHeight;
  const thumbHeight = Math.max(1, Math.round((containerHeight / contentHeight) * trackHeight));
  const maxScrollY = contentHeight - containerHeight;
  const scrollRatio = maxScrollY > 0 ? scrollY / maxScrollY : 0;
  const thumbPosition = Math.round(scrollRatio * (trackHeight - thumbHeight));

  const track: string[] = [];
  for (let i = 0; i < trackHeight; i++) {
    track.push(i >= thumbPosition && i < thumbPosition + thumbHeight ? '┃' : '│');
  }

  return (
    <Box flexDirection="column" flexShrink={0} marginLeft={1}>
      {track.map((char, i) => (
        <Text key={`track-${i}`} color={char === '┃' ? color : trackColor}>
          {char}
        </Text>
      ))}
    </Box>
  );
}

export function ScrollableSelectList<T>({
  items,
  selectedIndex: controlledIndex,
  onSelect,
  onHighlight,
  renderItem,
  focus = true,
  enableRotation = true,
  scrollStep = 1,
  showScrollbar = true,
  maxHeight,
}: ScrollableSelectListProps<T>) {
  const { theme } = useTheme();
  const [internalIndex, setInternalIndex] = useState(controlledIndex);
  const selectedIndex = controlledIndex !== undefined ? controlledIndex : internalIndex;

  const containerRef = useRef<BoxRef>(null);
  const contentRef = useRef<BoxRef>(null);
  const itemRefs = useRef<Map<number, BoxRef>>(new Map());
  const [scrollY, setScrollY] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const isKeyboardNavRef = useRef(false);

  const updateMeasurements = useCallback(() => {
    if (containerRef.current && contentRef.current) {
      const containerDim = measureElement(containerRef.current);
      const contentDim = measureElement(contentRef.current);
      setContainerHeight(containerDim.height);
      setContentHeight(contentDim.height);
    }
  }, []);

  const updateMeasurementsThrottled = useMemo(() => throttle(updateMeasurements, 50), [updateMeasurements]);

  useEffect(() => {
    updateMeasurementsThrottled();
  }, [items, updateMeasurementsThrottled]);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!containerRef.current || !contentRef.current || containerHeight === 0 || items.length === 0) return;

      const itemRef = itemRefs.current.get(index);
      if (itemRef) {
        const itemDim = measureElement(itemRef);
        let itemTop = 0;
        for (let i = 0; i < index; i++) {
          const ref = itemRefs.current.get(i);
          if (ref) {
            itemTop += measureElement(ref).height;
          }
        }
        const itemBottom = itemTop + itemDim.height;

        let newScrollY = scrollY;
        if (itemTop < scrollY) {
          newScrollY = itemTop;
        } else if (itemBottom > scrollY + containerHeight) {
          newScrollY = itemBottom - containerHeight;
        }

        if (newScrollY !== scrollY) {
          setScrollY(newScrollY);
          containerRef.current.scrollTo({ x: 0, y: newScrollY });
        }
      }
    },
    [containerHeight, items.length, scrollY],
  );

  useEffect(() => {
    if (isKeyboardNavRef.current) {
      scrollToIndex(selectedIndex);
      isKeyboardNavRef.current = false;
    }
  }, [selectedIndex, scrollToIndex]);

  useEffect(() => {
    if (onHighlight && items[selectedIndex]) {
      onHighlight(items[selectedIndex], selectedIndex);
    }
  }, [selectedIndex, items, onHighlight]);

  const navigate = useCallback(
    (direction: 'up' | 'down') => {
      isKeyboardNavRef.current = true;
      const newIndex =
        direction === 'up'
          ? enableRotation
            ? selectedIndex === 0
              ? items.length - 1
              : selectedIndex - 1
            : Math.max(0, selectedIndex - 1)
          : enableRotation
            ? selectedIndex === items.length - 1
              ? 0
              : selectedIndex + 1
            : Math.min(items.length - 1, selectedIndex + 1);

      if (controlledIndex === undefined) {
        setInternalIndex(newIndex);
      }
      if (onHighlight && items[newIndex]) {
        onHighlight(items[newIndex], newIndex);
      }
    },
    [selectedIndex, items, enableRotation, controlledIndex, onHighlight],
  );

  useInput(
    (input, key) => {
      if (key.upArrow || input === 'k') {
        navigate('up');
        return;
      }
      if (key.downArrow || input === 'j') {
        navigate('down');
        return;
      }
      if (key.return && items[selectedIndex] && onSelect) {
        onSelect(items[selectedIndex], selectedIndex);
      }
    },
    { isActive: focus },
  );

  const handleMouse = useCallback(
    (event: MouseEvent) => {
      if (event.type === 'wheel-up') {
        const newY = Math.max(0, scrollY - scrollStep);
        setScrollY(newY);
        containerRef.current?.scrollTo({ x: 0, y: newY });
        return true;
      }
      if (event.type === 'wheel-down') {
        const maxScroll = Math.max(0, contentHeight - containerHeight);
        const newY = Math.min(maxScroll, scrollY + scrollStep);
        setScrollY(newY);
        containerRef.current?.scrollTo({ x: 0, y: newY });
        return true;
      }
    },
    [scrollStep, contentHeight, containerHeight, scrollY],
  );

  useMouse(handleMouse, { isActive: focus && contentHeight > containerHeight });

  const needsScrollbar = showScrollbar && contentHeight > containerHeight;

  const setItemRef = useCallback((index: number, ref: BoxRef | null) => {
    if (ref) {
      itemRefs.current.set(index, ref);
    } else {
      itemRefs.current.delete(index);
    }
  }, []);

  return (
    <Box flexDirection="row" width="100%" {...(maxHeight ? { maxHeight } : {})} overflow="hidden">
      <Box
        ref={containerRef}
        flexDirection="column"
        flexGrow={1}
        overflow="scroll"
        {...(maxHeight ? { maxHeight } : {})}
      >
        <Box ref={contentRef} flexDirection="column" flexShrink={0}>
          {items.map((item, index) => (
            <Box key={item.key} flexDirection="column" ref={(ref) => setItemRef(index, ref)}>
              {renderItem(item.value, index === selectedIndex, index)}
            </Box>
          ))}
        </Box>
      </Box>
      {needsScrollbar && (
        <Scrollbar
          scrollY={scrollY}
          containerHeight={containerHeight}
          contentHeight={contentHeight}
          color={theme.tokens.cyan}
          trackColor={theme.tokens.dim}
        />
      )}
    </Box>
  );
}

export default ScrollableSelectList;
