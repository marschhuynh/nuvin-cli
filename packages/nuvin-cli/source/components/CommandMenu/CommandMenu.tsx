import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { SelectInput, type SelectInputItem, type SelectInputHandle } from '../SelectInput/SelectInput.js';
import { useAltMode } from '@/contexts/AltModeContext.js';

export type CommandMenuItem = {
  label: string;
  value: string;
};

export type CommandMenuHandle = {
  getSelectedIndex: () => number;
  setSelectedIndex: (index: number) => void;
  getSelectedItem: () => CommandMenuItem | undefined;
};

export type CommandMenuProps = {
  items: CommandMenuItem[];
  focus?: boolean;
  onHighlight?: (item: CommandMenuItem) => void;
};

export const CommandMenu = forwardRef<CommandMenuHandle, CommandMenuProps>(
  ({ items, focus = false, onHighlight }, ref) => {
    const { theme } = useTheme();
    const { altMode } = useAltMode();
    const selectInputRef = useRef<SelectInputHandle>(null);

    useImperativeHandle(ref, () => ({
      getSelectedIndex: () => selectInputRef.current?.getSelectedIndex() ?? 0,
      setSelectedIndex: (index: number) => selectInputRef.current?.setSelectedIndex(index),
      getSelectedItem: () => items[selectInputRef.current?.getSelectedIndex() ?? 0],
    }));

    if (items.length === 0) {
      return null;
    }

    const selectItems: SelectInputItem<CommandMenuItem>[] = items.map((item) => ({
      key: item.value,
      label: item.label,
      value: item,
    }));

    return (
      <Box flexDirection="column" flexGrow={1} width={'100%'}>
        {/* <Box backgroundColor={theme.colors.accent}>
          <Text color={theme.tokens.black} bold>
            {' '}
            Commands ({items.length}) - Use ↑↓ to navigate, Enter to select, Esc to cancel
          </Text>
        </Box> */}
        <Box paddingX={altMode ? 1 : 0}>
          <SelectInput
            ref={selectInputRef}
            items={selectItems}
            limit={10}
            focus={focus}
            enableRotation={false}
            showScrollIndicators={true}
            onHighlight={(item) => onHighlight?.(item.value)}
            itemComponent={({ isSelected, label }) => (
              <Text
                color={isSelected ? theme.model?.selectedItem || theme.colors.accent : theme.model?.item || 'white'}
                bold={isSelected}
              >
                {label}
              </Text>
            )}
            indicatorComponent={({ isSelected }) => <Text>{isSelected ? '❯ ' : '  '}</Text>}
          />
        </Box>
      </Box>
    );
  },
);
