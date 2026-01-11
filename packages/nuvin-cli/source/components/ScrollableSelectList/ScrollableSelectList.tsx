import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, measureElement, type BoxRef } from 'ink';
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
}: ScrollableSelectListProps<T>) {
  const [internalIndex, setInternalIndex] = useState(controlledIndex);
  const selectedIndex = controlledIndex !== undefined ? controlledIndex : internalIndex;

  const scrollBoxRef = useRef<AutoScrollBoxHandle>(null);
  const itemRefs = useRef<Map<number, BoxRef>>(new Map());
  const isKeyboardNavRef = useRef(false);
  const [containerHeight, setContainerHeight] = useState(0);

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
      const scrollY = scrollInfo.scrollY;

      if (itemTop < scrollY) {
        scrollBoxRef.current.scrollTo(itemTop);
      } else if (itemBottom > scrollY + containerHeight) {
        scrollBoxRef.current.scrollTo(itemBottom - containerHeight);
      }
    },
    [containerHeight, items.length],
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

  const handleScrollChange = useCallback((info: { containerHeight: number }) => {
    setContainerHeight(info.containerHeight);
  }, []);

  const setItemRef = useCallback((index: number, ref: BoxRef | null) => {
    if (ref) {
      itemRefs.current.set(index, ref);
    } else {
      itemRefs.current.delete(index);
    }
  }, []);

  return (
    <AutoScrollBox
      ref={scrollBoxRef}
      maxHeight={maxHeight}
      flexGrow={flexGrow}
      enableKeyboardScroll={false}
      enableMouseScroll={true}
      manualFocus={true}
      focus={false}
      onScrollChange={handleScrollChange}
    >
      {items.map((item, index) => (
        <Box key={item.key} flexDirection="column" ref={(ref) => setItemRef(index, ref)}>
          {renderItem(item.value, index === selectedIndex, index)}
        </Box>
      ))}
    </AutoScrollBox>
  );
}

export default ScrollableSelectList;
