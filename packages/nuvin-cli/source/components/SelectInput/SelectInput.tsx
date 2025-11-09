import type React from 'react';
import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { processPasteChunk, createPasteState, type PasteState } from '@/utils/pasteHandler.js';

export type SelectInputItem<T = unknown> = {
  key?: string;
  label: string;
  value: T;
};

export type SelectInputProps<T> = {
  items: SelectInputItem<T>[];
  limit?: number;
  initialIndex?: number;
  enableRotation?: boolean;
  focus?: boolean;
  itemComponent?: React.ComponentType<{
    isSelected?: boolean;
    label: string;
    value: T;
  }>;
  indicatorComponent?: React.ComponentType<{
    isSelected?: boolean;
  }>;
  showScrollIndicators?: boolean;
  onSelect?: (item: SelectInputItem<T>) => void;
  onHighlight?: (item: SelectInputItem<T>) => void;
  onNavigate?: (direction: 'up' | 'down') => boolean;
};

export type SelectInputHandle = {
  getSelectedIndex: () => number;
  setSelectedIndex: (index: number) => void;
};

const DefaultItemComponent = ({ isSelected, label }: { isSelected?: boolean; label: string }) => (
  <Text color={isSelected ? 'blue' : undefined}>{label}</Text>
);

const DefaultIndicatorComponent = ({ isSelected }: { isSelected?: boolean }) => (
  <Box>
    <Text>{isSelected ? '❯ ' : '  '}</Text>
  </Box>
);

export const SelectInput = forwardRef<SelectInputHandle, SelectInputProps<unknown>>(function SelectInput<T = unknown>(
  {
    items = [],
    limit,
    initialIndex = 0,
    enableRotation = true,
    focus = true,
    itemComponent: ItemComponent = DefaultItemComponent,
    indicatorComponent: IndicatorComponent = DefaultIndicatorComponent,
    showScrollIndicators = true,
    onSelect,
    onHighlight,
    onNavigate,
  }: SelectInputProps<T>,
  ref: React.Ref<SelectInputHandle>,
): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [scrollOffset, setScrollOffset] = useState(0);
  const pasteStateRef = useRef<PasteState>(createPasteState());
  const hasLimit = typeof limit === 'number' && limit > 0 && items.length > limit;

  useImperativeHandle(ref, () => ({
    getSelectedIndex: () => selectedIndex,
    setSelectedIndex: (index: number) => setSelectedIndex(index),
  }));

  useEffect(() => {
    if (selectedIndex >= items.length && items.length > 0) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  useEffect(() => {
    if (onHighlight && items.length > 0 && items[selectedIndex]) {
      onHighlight(items[selectedIndex] as SelectInputItem<T>);
    }
  }, [selectedIndex, items, onHighlight]);

  useEffect(() => {
    if (hasLimit && limit !== undefined) {
      if (selectedIndex < scrollOffset) {
        setScrollOffset(selectedIndex);
      } else if (selectedIndex >= scrollOffset + limit) {
        setScrollOffset(selectedIndex - limit + 1);
      }
    }
  }, [selectedIndex, scrollOffset, limit, hasLimit]);

  useInput(
    (input, key) => {
      const pasteResult = processPasteChunk(input, pasteStateRef.current);
      pasteStateRef.current = pasteResult.newState;

      if (pasteResult.shouldWaitForMore) {
        return;
      }

      if (key.return) {
        if (items.length > 0 && items[selectedIndex] && onSelect) {
          onSelect(items[selectedIndex] as SelectInputItem<T>);
        }
        return;
      }

      if (key.upArrow || (input === 'k' && !key.ctrl && !key.meta)) {
        if (onNavigate?.('up')) {
          return;
        }
        setSelectedIndex((prev) => {
          if (enableRotation) {
            return prev === 0 ? items.length - 1 : prev - 1;
          }
          return Math.max(0, prev - 1);
        });
        return;
      }

      if (key.downArrow || (input === 'j' && !key.ctrl && !key.meta)) {
        if (onNavigate?.('down')) {
          return;
        }
        setSelectedIndex((prev) => {
          if (enableRotation) {
            return prev === items.length - 1 ? 0 : prev + 1;
          }
          return Math.min(items.length - 1, prev + 1);
        });
        return;
      }
    },
    { isActive: focus },
  );

  if (items.length === 0) {
    return <Box />;
  }

  const startIndex = hasLimit && limit !== undefined ? scrollOffset : 0;
  const endIndex = hasLimit && limit !== undefined ? Math.min(scrollOffset + limit, items.length) : items.length;
  const visibleItems = items.slice(startIndex, endIndex);

  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = hasLimit && limit !== undefined && scrollOffset + limit < items.length;

  return (
    <Box flexDirection="column">
      {showScrollIndicators && (
        <Box marginLeft={1} height={1}>
          {hasMoreAbove ? <Text dimColor> ▲ {scrollOffset} more</Text> : <Text> </Text>}
        </Box>
      )}

      {visibleItems.map((item, index) => {
        const actualIndex = startIndex + index;
        const isSelected = actualIndex === selectedIndex;
        const key = item.key || String(actualIndex);

        return (
          <Box key={key}>
            <IndicatorComponent isSelected={isSelected} />
            <ItemComponent isSelected={isSelected} label={item.label} value={item.value} />
          </Box>
        );
      })}

      {showScrollIndicators && (
        <Box marginLeft={1} height={1}>
          {hasMoreBelow && limit !== undefined ? (
            <Text dimColor> ▼ {items.length - scrollOffset - limit} more</Text>
          ) : (
            <Text> </Text>
          )}
        </Box>
      )}
    </Box>
  );
}) as <T = unknown>(props: SelectInputProps<T> & { ref?: React.Ref<SelectInputHandle> }) => React.ReactElement;

export default SelectInput;
