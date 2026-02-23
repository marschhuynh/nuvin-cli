import type React from 'react';
import { useMemo, useCallback, useRef } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useInput } from '@/contexts/InputContext/index.js';
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import type { CompleteCustomCommand, CommandSource } from '@nuvin/nuvin-core';

interface CommandListProps {
  commands: CompleteCustomCommand[];
  onCommandSelect: (index: number) => void;
  onEdit?: (commandId: string) => void;
  onDelete?: (commandId: string) => void;
  onNew?: () => void;
  getShadowedCommands: (commandId: string) => CompleteCustomCommand[];
  maxHeight?: number;
  flexGrow?: number;
  focus?: boolean;
}

const SOURCE_LABELS: Record<CommandSource, string> = {
  global: 'G',
  profile: 'P',
  local: 'L',
};

const SOURCE_NAMES: Record<CommandSource, string> = {
  global: 'Global',
  profile: 'Profile',
  local: 'Local',
};

export const CommandList: React.FC<CommandListProps> = ({
  commands,
  onCommandSelect,
  onEdit,
  onDelete,
  onNew,
  getShadowedCommands,
  focus = true,
}) => {
  const { theme } = useTheme();
  const currentIndexRef = useRef(0);

  const comboBoxItems = useMemo<ComboBoxItem[]>(
    () =>
      commands.map((cmd) => ({
        label: `/${cmd.id}`,
        value: cmd.id,
      })),
    [commands],
  );

  const renderCommandItem = useCallback(
    (item: ComboBoxItem, isSelected: boolean) => {
      const command = commands.find((c) => c.id === item.value);
      if (!command) return null;

      const accentColor = theme.colors.accent;
      const sourceLabel = SOURCE_LABELS[command.source];
      const shadowedCommands = getShadowedCommands(command.id);

      return (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color={isSelected ? accentColor : undefined}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? accentColor : theme.colors.text} bold={isSelected}>
              /{command.id}
            </Text>
            <Text> </Text>
            <Text color={theme.history.help} dimColor>
              [{sourceLabel}]
            </Text>
            {shadowedCommands.length > 0 && (
              <>
                <Text> </Text>
                <Text color={theme.colors.warning}>
                  ⚠ shadows {shadowedCommands.map((c) => SOURCE_NAMES[c.source].toLowerCase()).join(', ')}
                </Text>
              </>
            )}
          </Box>
          {isSelected && (
            <Box marginLeft={4} flexDirection="column">
              <Text dimColor wrap="wrap">
                └─ {command.description}
              </Text>
            </Box>
          )}
        </Box>
      );
    },
    [commands, getShadowedCommands, theme],
  );

  const handleSelect = useCallback(
    (item: ComboBoxItem) => {
      const command = commands.find((c) => c.id === item.value);
      if (command) {
        onEdit?.(command.id);
      }
    },
    [commands, onEdit],
  );

  const handleHighlight = useCallback(
    (_item: ComboBoxItem | null, index: number) => {
      currentIndexRef.current = index;
      onCommandSelect(index);
    },
    [onCommandSelect],
  );

  useInput(
    (input) => {
      if ((input === 'x' || input === 'X') && onDelete) {
        const command = commands[currentIndexRef.current];
        if (command) {
          onDelete(command.id);
        }
      }
    },
    { isActive: focus },
  );

  return (
    <Box flexDirection="column" width="100%" flexGrow={1} overflow="hidden">
      <Box marginBottom={1} flexShrink={0}>
        <Text color={theme.tokens.cyan} bold>
          Commands ({commands.length})
        </Text>
      </Box>

      <ComboBox
        items={comboBoxItems}
        placeholder="Search commands..."
        enableRotation={true}
        showItemCount={false}
        focus={focus}
        renderItem={renderCommandItem}
        onSelect={handleSelect}
        onHighlight={handleHighlight}
        onNew={onNew}
      />
    </Box>
  );
};
