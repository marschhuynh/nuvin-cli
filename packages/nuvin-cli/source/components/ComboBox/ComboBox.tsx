import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import chalk from 'chalk';
import { useTheme } from '@/contexts/ThemeContext.js';
import { processPasteChunk, createPasteState, type PasteState } from '@/utils/pasteHandler.js';
import { ScrollableSelectList, type ScrollableSelectItem } from '@/components/ScrollableSelectList/index.js';

export type ComboBoxItem = {
  label: string;
  value: string;
};

export type ComboBoxProps = {
  items: ComboBoxItem[];
  placeholder?: string;
  maxDisplayItems?: number;
  enableRotation?: boolean;
  showSearchInput?: boolean;
  showItemCount?: boolean;
  focus?: boolean;
  onSelect: (item: ComboBoxItem) => void;
  onCancel?: () => void;
};

export const ComboBox: React.FC<ComboBoxProps> = ({
  items,
  maxDisplayItems,
  placeholder = 'Type to search...',
  enableRotation = false,
  showSearchInput = true,
  showItemCount = true,
  focus = true,
  onSelect,
  onCancel,
}) => {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [filteredItems, setFilteredItems] = useState<ComboBoxItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const pasteStateRef = useRef<PasteState>(createPasteState());

  useEffect(() => {
    const filtered = input.trim()
      ? items.filter((item) => item.label.toLowerCase().includes(input.toLowerCase()))
      : items;

    setFilteredItems(filtered);
  }, [input, items]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems]);

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
        if (filteredItems.length > 0) {
          onSelect(filteredItems[selectedIndex]);
        }
        return;
      }

      if (key.escape) {
        onCancel?.();
        return;
      }

      if (key.upArrow || key.downArrow) {
        return;
      }

      if (key.backspace || key.delete) {
        setInput((prev) => prev.slice(0, -1));
        return;
      }

      if (inputChar && !key.ctrl && !key.meta) {
        setInput((prev) => prev + inputChar);
      }
    },
    { isActive: showSearchInput },
  );

  const scrollableItems: ScrollableSelectItem<ComboBoxItem>[] = filteredItems.map((item) => ({
    key: item.value,
    value: item,
  }));

  const handleSelect = useCallback((item: ScrollableSelectItem<ComboBoxItem>) => {
    onSelect(item.value);
  }, [onSelect]);

  const handleHighlight = useCallback((_: ScrollableSelectItem<ComboBoxItem>, index: number) => {
    setSelectedIndex(index);
  }, []);

  const renderItem = useCallback((item: ComboBoxItem, isSelected: boolean) => (
    <Box>
      <Text>{isSelected ? '❯ ' : '  '}</Text>
      <Text
        color={isSelected ? theme.model?.selectedItem || theme.colors.accent : theme.model?.item || 'white'}
        bold={isSelected}
      >
        {item.label}
      </Text>
    </Box>
  ), [theme]);

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

          <ScrollableSelectList
            items={scrollableItems}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
            onHighlight={handleHighlight}
            renderItem={renderItem}
            focus={focus}
            enableRotation={enableRotation}
            maxHeight={maxDisplayItems}
          />
        </Box>
      )}
    </Box>
  );
};
