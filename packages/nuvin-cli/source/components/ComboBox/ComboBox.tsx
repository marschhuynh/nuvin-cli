import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Box, Text, measureElement, type BoxRef } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import chalk from 'chalk';
import { useTheme } from '@/contexts/ThemeContext.js';
import { processPasteChunk, createPasteState, type PasteState } from '@/utils/pasteHandler.js';
import { AutoScrollBox, type AutoScrollBoxHandle } from '@/components/AutoScrollBox.js';

export type ComboBoxItem = {
  label: string;
  value: string;
  group?: string;
};

type ListItem = { type: 'header'; group: string } | { type: 'item'; item: ComboBoxItem; originalIndex: number };

export type ComboBoxProps = {
  items: ComboBoxItem[];
  placeholder?: string;
  maxDisplayItems?: number;
  enableRotation?: boolean;
  showSearchInput?: boolean;
  showItemCount?: boolean;
  focus?: boolean;
  renderItem?: (item: ComboBoxItem, isSelected: boolean) => React.ReactNode;
  onSelect: (item: ComboBoxItem) => void;
  onCancel?: () => void;
  onHighlight?: (item: ComboBoxItem | null, index: number) => void;
  onSpace?: (item: ComboBoxItem) => void;
  onNew?: () => void;
};

export const ComboBox: React.FC<ComboBoxProps> = ({
  items,
  placeholder = 'Type to search...',
  enableRotation = false,
  showSearchInput = true,
  showItemCount = true,
  focus = true,
  renderItem,
  onSelect,
  onCancel,
  onHighlight,
  onSpace,
  onNew,
}) => {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const pasteStateRef = useRef<PasteState>(createPasteState());
  const scrollBoxRef = useRef<AutoScrollBoxHandle>(null);
  const itemRefs = useRef<Map<number, BoxRef>>(new Map());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search query so the expensive filter doesn't run on every keystroke.
  // Flush immediately when input is cleared so the full list appears without delay.
  useEffect(() => {
    if (!input.trim()) {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      setSearchQuery(input);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(input);
    }, 200);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [input]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(query));
  }, [searchQuery, items]);

  const { listItems, selectableIndices, listIndexToSelectablePosition } = useMemo(() => {
    const result: ListItem[] = [];
    const selectable: number[] = [];
    const positionMap = new Map<number, number>();
    let lastGroup: string | undefined;

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      if (item.group && item.group !== lastGroup) {
        result.push({ type: 'header', group: item.group });
        lastGroup = item.group;
      }
      positionMap.set(result.length, selectable.length);
      selectable.push(result.length);
      result.push({ type: 'item', item, originalIndex: i });
    }

    return { listItems: result, selectableIndices: selectable, listIndexToSelectablePosition: positionMap };
  }, [filteredItems]);

  const selectableIndicesRef = useRef(selectableIndices);
  const listItemsRef = useRef(listItems);
  selectableIndicesRef.current = selectableIndices;
  listItemsRef.current = listItems;

  const hasGroups = listItems.some((item) => item.type === 'header');

  const scrollToSelected = useCallback((index: number) => {
    const currentSelectableIndices = selectableIndicesRef.current;
    const currentListItems = listItemsRef.current;

    if (currentSelectableIndices.length === 0 || index < 0 || index >= currentSelectableIndices.length) return;

    const listIndex = currentSelectableIndices[index];
    const targetIndex = currentListItems[listIndex - 1]?.type === 'header' ? listIndex - 1 : listIndex;
    const itemRef = itemRefs.current.get(targetIndex);

    if (itemRef && scrollBoxRef.current) {
      const scrollInfo = scrollBoxRef.current.getScrollInfo();
      if (scrollInfo.containerHeight === 0) return;

      const itemDim = measureElement(itemRef);

      let itemTop = 0;
      for (let i = 0; i < targetIndex; i++) {
        const ref = itemRefs.current.get(i);
        if (ref) {
          itemTop += measureElement(ref).height;
        }
      }

      const itemBottom = itemTop + itemDim.height;
      const { scrollY, containerHeight } = scrollInfo;

      if (itemTop < scrollY) {
        scrollBoxRef.current.scrollTo(itemTop);
      } else if (itemBottom > scrollY + containerHeight) {
        scrollBoxRef.current.scrollTo(itemBottom - containerHeight);
      }
    }
  }, []);

  useEffect(() => {
    scrollToSelected(selectedIndex);
  }, [selectedIndex, scrollToSelected]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: -- We only want to reset when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    const currentSelectableIndices = selectableIndicesRef.current;
    const currentListItems = listItemsRef.current;

    if (onHighlight && currentSelectableIndices.length > 0 && selectedIndex < currentSelectableIndices.length) {
      const listIndex = currentSelectableIndices[selectedIndex];
      const listItem = currentListItems[listIndex];
      if (listItem?.type === 'item') {
        onHighlight(listItem.item, listItem.originalIndex);
      } else {
        onHighlight(null, selectedIndex);
      }
    } else if (onHighlight) {
      onHighlight(null, selectedIndex);
    }
  }, [selectedIndex, onHighlight]);

  const navigate = useCallback(
    (direction: 'up' | 'down') => {
      setSelectedIndex((prev) => {
        if (selectableIndices.length === 0) return 0;

        if (direction === 'up') {
          if (enableRotation) {
            return prev <= 0 ? selectableIndices.length - 1 : prev - 1;
          }
          return Math.max(0, prev - 1);
        }
        if (enableRotation) {
          return prev >= selectableIndices.length - 1 ? 0 : prev + 1;
        }
        return Math.min(selectableIndices.length - 1, prev + 1);
      });
    },
    [selectableIndices.length, enableRotation],
  );

  useInput(
    (inputChar, key) => {
      const pasteResult = processPasteChunk(inputChar, pasteStateRef.current);
      pasteStateRef.current = pasteResult.newState;

      if (pasteResult.shouldWaitForMore) {
        return;
      }

      if (pasteResult.processedInput !== null) {
        inputChar = pasteResult.processedInput;
      }

      if (key.return) {
        if (selectableIndices.length > 0 && selectedIndex < selectableIndices.length) {
          const listIndex = selectableIndices[selectedIndex];
          const listItem = listItems[listIndex];
          if (listItem?.type === 'item') {
            onSelect(listItem.item);
          }
        }
        return;
      }

      if (key.escape) {
        onCancel?.();
        return;
      }

      if (key.upArrow) {
        navigate('up');
        return;
      }

      if (key.downArrow) {
        navigate('down');
        return;
      }

      if (inputChar === ' ' && onSpace) {
        if (selectableIndices.length > 0 && selectedIndex < selectableIndices.length) {
          const listIndex = selectableIndices[selectedIndex];
          const listItem = listItems[listIndex];
          if (listItem?.type === 'item') {
            onSpace(listItem.item);
          }
        }
        return;
      }

      if (key.ctrl && (inputChar === 'n' || inputChar === 'N') && onNew) {
        onNew();
        return;
      }

      if (key.backspace || key.delete) {
        setInput((prev) => prev.slice(0, -1));
        return;
      }

      if (inputChar && !key.ctrl && !key.meta && inputChar.length === 1 && inputChar >= ' ') {
        setInput((prev) => prev + inputChar);
      }
    },
    { isActive: focus },
  );

  const setItemRef = useCallback((index: number, ref: BoxRef | null) => {
    if (ref) {
      itemRefs.current.set(index, ref);
    } else {
      itemRefs.current.delete(index);
    }
  }, []);

  const renderedInput = input ? (
    <>
      <Text>{input}</Text>
      <Text color={theme.model?.input || 'white'}>█</Text>
    </>
  ) : (
    <Text>
      {placeholder.length > 0 ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1)) : chalk.inverse(' ')}
    </Text>
  );

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {showSearchInput && (
        <Box marginBottom={1} flexShrink={0}>
          <Text color={theme.model?.label || 'cyan'}>Search: </Text>
          {renderedInput}
        </Box>
      )}

      {filteredItems.length === 0 ? (
        <Box>
          <Text color="yellow">No matches found</Text>
        </Box>
      ) : (
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {showItemCount && (
            <Box marginBottom={1} flexShrink={0}>
              <Text dimColor>Showing {filteredItems.length} matches (↑↓ to navigate, Enter to select)</Text>
            </Box>
          )}

          <AutoScrollBox
            ref={scrollBoxRef}
            flexGrow={1}
            enableKeyboardScroll={false}
            enableMouseScroll={false}
            manualFocus={true}
            focus={false}
            autoScrollToBottom={false}
            showScrollbar={true}
          >
            {listItems.map((listItem, index) => (
              <ComboBoxListItem
                key={listItem.type === 'header' ? `header-${listItem.group}` : `item-${listItem.item.value}-${index}`}
                listItem={listItem}
                index={index}
                isSelected={
                  listItem.type === 'item' &&
                  (listIndexToSelectablePosition.get(index) ?? -1) === selectedIndex
                }
                isHeader={listItem.type === 'header'}
                hasGroups={hasGroups}
                theme={theme}
                renderItem={renderItem}
                setItemRef={setItemRef}
              />
            ))}
          </AutoScrollBox>
        </Box>
      )}
    </Box>
  );
};

type ComboBoxListItemProps = {
  listItem: ListItem;
  index: number;
  isSelected: boolean;
  isHeader: boolean;
  hasGroups: boolean;
  theme: ReturnType<typeof useTheme>['theme'];
  renderItem?: (item: ComboBoxItem, isSelected: boolean) => React.ReactNode;
  setItemRef: (index: number, ref: BoxRef | null) => void;
};

const ComboBoxListItem = memo<ComboBoxListItemProps>(
  ({ listItem, index, isSelected, isHeader, hasGroups, theme, renderItem, setItemRef }) => {
    const refCallback = useCallback(
      (ref: BoxRef | null) => setItemRef(index, ref),
      [setItemRef, index],
    );

    let content: React.ReactNode;
    if (listItem.type === 'header') {
      content = (
        <Text color={theme.colors.muted} bold>
          {listItem.group}
        </Text>
      );
    } else if (renderItem) {
      content = renderItem(listItem.item, isSelected);
    } else {
      content = (
        <Box overflow="hidden">
          <Text>{isSelected ? '❯ ' : '  '}</Text>
          <Text
            color={isSelected ? theme.model?.selectedItem || theme.colors.accent : theme.model?.item || 'white'}
            bold={isSelected}
          >
            {listItem.item.label}
          </Text>
        </Box>
      );
    }

    return (
      <Box
        flexShrink={0}
        ref={refCallback}
        position={hasGroups && isHeader ? 'sticky' : undefined}
        top={hasGroups && isHeader ? 0 : undefined}
        backgroundColor={hasGroups && isHeader ? theme.tokens.dim : undefined}
      >
        {content}
      </Box>
    );
  },
);