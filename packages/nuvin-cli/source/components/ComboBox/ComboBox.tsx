import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';
import { useTheme } from '@/contexts/ThemeContext.js';
import { processPasteChunk, createPasteState, type PasteState } from '@/utils/pasteHandler.js';
import { SelectInput, type SelectInputItem, type SelectInputHandle } from '@/components/SelectInput/SelectInput.js';

export type ComboBoxItem = {
  label: string;
  value: string;
};

export type ComboBoxProps = {
  items: ComboBoxItem[];
  placeholder?: string;
  maxDisplayItems?: number;
  enableRotation?: boolean;
  onSelect: (item: ComboBoxItem) => void;
  onCancel?: () => void;
};

export const ComboBox: React.FC<ComboBoxProps> = ({
  items,
  maxDisplayItems = 10,
  placeholder = 'Type to search...',
  enableRotation = false,
  onSelect,
  onCancel,
}) => {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [filteredItems, setFilteredItems] = useState<ComboBoxItem[]>([]);
  const pasteStateRef = useRef<PasteState>(createPasteState());
  const selectInputRef = useRef<SelectInputHandle>(null);

  useEffect(() => {
    const filtered = input.trim()
      ? items.filter((item) => item.label.toLowerCase().includes(input.toLowerCase()))
      : items;

    setFilteredItems(filtered);
    
    if (selectInputRef.current) {
      selectInputRef.current.setSelectedIndex(0);
    }
  }, [input, items]);

  useInput((inputChar, key) => {
    const pasteResult = processPasteChunk(inputChar, pasteStateRef.current);
    pasteStateRef.current = pasteResult.newState;

    if (pasteResult.shouldWaitForMore) {
      return;
    }

    if (pasteResult.processedInput !== null) {
      inputChar = pasteResult.processedInput;
    }

    if (key.return) {
      if (filteredItems.length > 0 && selectInputRef.current) {
        const selectedIndex = selectInputRef.current.getSelectedIndex();
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
  });

  const selectInputItems: SelectInputItem<ComboBoxItem>[] = filteredItems.map((item) => ({
    key: item.value,
    label: item.label,
    value: item,
  }));

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
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.model?.label || 'cyan'}>Search: </Text>
        {renderedInput}
      </Box>

      {filteredItems.length === 0 ? (
        <Box>
          <Text color="yellow">No matches found</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>Showing {filteredItems.length} matches (↑↓ to navigate, Enter to select)</Text>
          </Box>

          <SelectInput
            ref={selectInputRef}
            items={selectInputItems}
            limit={maxDisplayItems}
            enableRotation={enableRotation}
            focus={true}
            showScrollIndicators={true}
            onSelect={(item) => onSelect(item.value)}
            itemComponent={({ isSelected, label }) => (
              <Text
                color={isSelected ? theme.model?.selectedItem || 'green' : theme.model?.item || 'white'}
                bold={isSelected}
              >
                {label}
              </Text>
            )}
            indicatorComponent={({ isSelected }) => <Text>{isSelected ? '❯ ' : '  '}</Text>}
          />
        </Box>
      )}
    </Box>
  );
};
