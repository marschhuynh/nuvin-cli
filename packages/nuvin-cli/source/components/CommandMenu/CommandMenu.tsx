import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { SelectInput, type SelectInputItem, type SelectInputHandle } from '../SelectInput/SelectInput.js';
import { useAltMode } from '@/contexts/AltModeContext.js';
import { CommandMenuItemComponent } from './CommandMenuItem.js';

export type CommandMenuItem = {
  label: string;
  value: string;
  description?: string;
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

    const maxCommandWidth = Math.max(...items.map((item) => stringWidth(`${item.value} - `)));

    return (
      <Box flexDirection="column" flexGrow={1} width={'100%'}>
        <Box paddingX={altMode ? 1 : 0}>
          <SelectInput
            ref={selectInputRef}
            items={selectItems}
            limit={5}
            focus={focus}
            enableRotation={false}
            showScrollIndicators={true}
            onHighlight={(item) => onHighlight?.(item.value)}
            itemComponent={(props) => <CommandMenuItemComponent {...props} commandWidth={maxCommandWidth} />}
            indicatorComponent={({ isSelected }) => (
              <Box flexShrink={0}>
                <Text>{isSelected ? '❯ ' : '  '}</Text>
              </Box>
            )}
          />
        </Box>
      </Box>
    );
  },
);
