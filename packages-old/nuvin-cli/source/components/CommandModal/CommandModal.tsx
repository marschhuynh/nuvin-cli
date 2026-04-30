import type React from 'react';
import { useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { CompleteCustomCommand } from '@nuvin/nuvin-core';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { useCommandModalState } from './useCommandModalState.js';
import { CommandList } from './CommandList.js';

interface CommandModalProps {
  visible: boolean;
  commands: CompleteCustomCommand[];
  activeProfile?: string;
  initialSelectedIndex?: number;
  onClose: () => void;
  onCreate?: () => void;
  onEdit?: (commandId: string) => void;
  onDelete?: (commandId: string) => void;
  getShadowedCommands: (commandId: string) => CompleteCustomCommand[];
}

export const CommandModal: React.FC<CommandModalProps> = ({
  visible,
  commands,
  activeProfile,
  initialSelectedIndex,
  onClose,
  onCreate,
  onEdit,
  onDelete,
  getShadowedCommands,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const state = useCommandModalState(commands, initialSelectedIndex);

  const handleEdit = useCallback(
    (commandId: string) => {
      onEdit?.(commandId);
    },
    [onEdit],
  );

  const handleDelete = useCallback(
    (commandId: string) => {
      onDelete?.(commandId);
    },
    [onDelete],
  );

  if (!visible) return null;

  const MODAL_HEIGHT = 30;
  const modalHeight = Math.min(MODAL_HEIGHT, rows - 4);

  const title =
    activeProfile && activeProfile !== 'default' ? `Custom Commands (Profile: ${activeProfile})` : 'Custom Commands';

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
      <HelpText
        segments={[
          { text: '↑↓', highlight: true },
          { text: ' navigate • ' },
          { text: 'Enter', highlight: true },
          { text: ' edit • ' },
          { text: 'Ctrl+N', highlight: true },
          { text: ' new • ' },
          { text: 'X', highlight: true },
          { text: ' delete • ' },
          { text: 'ESC', highlight: true },
          { text: ' exit' },
        ]}
      />
    </Box>
  );

  return (
    <AppModal
      visible={visible}
      title={title}
      closeOnEscape={true}
      closeOnEnter={false}
      onClose={onClose}
      paddingX={1}
      paddingY={0}
      footer={footerContent}
      height={modalHeight}
    >
      {commands.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.history.help}>No custom commands found. Press Ctrl+N to create a new command.</Text>
        </Box>
      ) : (
        <CommandList
          commands={commands}
          onCommandSelect={state.setSelectedIndex}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onNew={onCreate}
          getShadowedCommands={getShadowedCommands}
          flexGrow={1}
          focus={true}
        />
      )}
    </AppModal>
  );
};

export default CommandModal;
