import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, measureElement, type BoxRef } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { AutoScrollBox, type AutoScrollBoxHandle } from '@/components/AutoScrollBox.js';

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
  maxHeight?: number;
  flexGrow?: number;
  showScrollIndicators?: boolean;
}

export function ScrollableSelectList<T>({
  items,
  selectedIndex: controlledIndex,
  onSelect,
  onHighlight,
  renderItem,
  focus = true,
  enableRotation = true,
  maxHeight,
  flexGrow,
  showScrollIndicators = true,
}: ScrollableSelectListProps<T>) {
  const [internalIndex, setInternalIndex] = useState(controlledIndex);
  const rawSelectedIndex = controlledIndex !== undefined ? controlledIndex : internalIndex;
  const selectedIndex = Math.min(Math.max(0, rawSelectedIndex), Math.max(0, items.length - 1));

  const scrollBoxRef = useRef<AutoScrollBoxHandle>(null);
  const itemRefs = useRef<Map<number, BoxRef>>(new Map());
  const isKeyboardNavRef = useRef(false);
  const hasInitialScrolledRef = useRef(false);
  const prevItemsLengthRef = useRef(items.length);
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const canScroll = contentHeight > containerHeight;

  useEffect(() => {
    if (prevItemsLengthRef.current !== items.length) {
      hasInitialScrolledRef.current = false;
      prevItemsLengthRef.current = items.length;
      scrollBoxRef.current?.scrollTo(0);
    }
  }, [items.length]);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!scrollBoxRef.current || containerHeight === 0 || items.length === 0) return;

      const itemRef = itemRefs.current.get(index);
      if (!itemRef) return;

      const itemDim = measureElement(itemRef);
      let itemTop = 0;
      for (let i = 0; i < index; i++) {
        const ref = itemRefs.current.get(i);
        if (ref) {
          itemTop += measureElement(ref).height;
        }
      }
      const itemBottom = itemTop + itemDim.height;

      const scrollInfo = scrollBoxRef.current.getScrollInfo();
      const currentScrollY = scrollInfo.scrollY;

      if (itemTop < currentScrollY) {
        scrollBoxRef.current.scrollTo(itemTop);
      } else if (itemBottom > currentScrollY + containerHeight) {
        scrollBoxRef.current.scrollTo(itemBottom - containerHeight);
      }
    },
    [containerHeight, items.length],
  );

  useEffect(() => {
    if (containerHeight > 0 && !hasInitialScrolledRef.current) {
      hasInitialScrolledRef.current = true;
      if (selectedIndex > 0) {
        scrollToIndex(selectedIndex);
      }
    }
  }, [containerHeight, selectedIndex, scrollToIndex]);

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

  const handleScrollChange = useCallback((info: { containerHeight: number; scrollY: number; contentHeight: number }) => {
    setContainerHeight(info.containerHeight);
    setScrollY(info.scrollY);
    setContentHeight(info.contentHeight);
  }, []);

  const setItemRef = useCallback((index: number, ref: BoxRef | null) => {
    if (ref) {
      itemRefs.current.set(index, ref);
    } else {
      itemRefs.current.delete(index);
    }
  }, []);

  const hasMoreAbove = scrollY > 0;
  const hasMoreBelow = contentHeight > containerHeight && scrollY + containerHeight < contentHeight;

  const calculateHiddenItems = useCallback((direction: 'above' | 'below') => {
    if (!canScroll) return 0;

    let count = 0;
    let accumulatedHeight = 0;

    if (direction === 'above') {
      for (let i = 0; i < items.length; i++) {
        const ref = itemRefs.current.get(i);
        if (ref) {
          const height = measureElement(ref).height;
          if (accumulatedHeight + height <= scrollY) {
            count++;
            accumulatedHeight += height;
          } else {
            break;
          }
        }
      }
    } else {
      const viewportBottom = scrollY + containerHeight;
      accumulatedHeight = 0;
      for (let i = 0; i < items.length; i++) {
        const ref = itemRefs.current.get(i);
        if (ref) {
          accumulatedHeight += measureElement(ref).height;
        }
      }
      let heightFromBottom = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        const ref = itemRefs.current.get(i);
        if (ref) {
          const height = measureElement(ref).height;
          const itemTop = accumulatedHeight - heightFromBottom - height;
          if (itemTop >= viewportBottom) {
            count++;
          } else {
            break;
          }
          heightFromBottom += height;
        }
      }
    }
    return count;
  }, [canScroll, items.length, scrollY, containerHeight]);

  const itemsAbove = hasMoreAbove ? calculateHiddenItems('above') : 0;
  const itemsBelow = hasMoreBelow ? calculateHiddenItems('below') : 0;

  const reserveIndicatorSpace = showScrollIndicators && canScroll;

  return (
    <Box flexDirection="column" flexGrow={flexGrow} overflow="hidden">
      {reserveIndicatorSpace && (
        <Box height={1} flexShrink={0}>
          {hasMoreAbove && <Text dimColor> ▲ {itemsAbove} more</Text>}
        </Box>
      )}
      <AutoScrollBox
        ref={scrollBoxRef}
        maxHeight={maxHeight ? maxHeight - (reserveIndicatorSpace ? 2 : 0) : undefined}
        flexGrow={maxHeight ? undefined : 1}
        enableKeyboardScroll={false}
        enableMouseScroll={true}
        manualFocus={true}
        focus={false}
        autoScrollToBottom={false}
        showScrollbar={false}
        onScrollChange={handleScrollChange}
      >
        {items.map((item, index) => (
          <Box key={item.key} flexDirection="column" ref={(ref) => setItemRef(index, ref)}>
            {renderItem(item.value, index === selectedIndex, index)}
          </Box>
        ))}
      </AutoScrollBox>
      {reserveIndicatorSpace && (
        <Box height={1} flexShrink={0}>
          {hasMoreBelow && <Text dimColor> ▼ {itemsBelow} more</Text>}
        </Box>
      )}
    </Box>
  );
}

export default ScrollableSelectList;
