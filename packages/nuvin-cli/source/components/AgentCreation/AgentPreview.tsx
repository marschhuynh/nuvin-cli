import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useInput } from '@/contexts/InputContext/index.js';
import { FocusProvider, useFocus } from '@/contexts/InputContext/FocusContext.js';
import { AppModal } from '@/components/AppModal.js';
import type { AgentTemplate } from '@nuvin/nuvin-core';
import { HelpText } from '@/components/HelpText.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

const MODAL_HEIGHT = 30;

interface AgentPreviewProps {
  preview: Partial<AgentTemplate> & { instructions: string };
  onSave: () => void;
  onEdit: () => void;
}

type ActionButtonProps = {
  label: string;
  onExecute: () => void;
  autoFocus?: boolean;
};

const ActionButton: React.FC<ActionButtonProps> = ({ label, onExecute, autoFocus }) => {
  const { theme } = useTheme();
  const { isFocused } = useFocus({ active: true, autoFocus });

  useInput(
    (_input, key) => {
      if (key.return) {
        onExecute();
        return true;
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box alignItems="center">
      <Text color={isFocused ? theme.colors.primary : undefined} bold>
        {isFocused ? '❯ ' : '  '}
      </Text>
      <Text dimColor={!isFocused} color={isFocused ? theme.colors.primary : theme.modal.help} bold={isFocused}>
        {label}
      </Text>
    </Box>
  );
};

const AgentPreviewContent: React.FC<AgentPreviewProps> = ({ preview, onSave, onEdit }) => {
  const { rows } = useStdoutDimensions();
  const { theme } = useTheme();
  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1}>
      <HelpText
        segments={[
          { text: 'Tab', highlight: true },
          { text: ' to cycle • ' },
          { text: 'Enter', highlight: true },
          { text: ' to select • ' },
          { text: 'ESC', highlight: true },
          { text: ' to cancel' },
        ]}
      />
    </Box>
  );

  return (
    <AppModal visible={true} title="Preview Generated Agent" footer={footerContent} height={Math.min(MODAL_HEIGHT, rows - 4)}>
      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text color={theme.colors.primary} bold>
            {preview.name || 'Custom Agent'}
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            Name:
          </Text>
          <Text>{preview.name || '(auto-generated)'}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            Description:
          </Text>
          <Text>{preview.description || 'Custom specialist agent'}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            Allowed Tools:
          </Text>
          <Text>{preview.allowed_tools?.join(', ') || 'Read, WebSearch'}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            Temperature:
          </Text>
          <Text>{preview.temperature ?? 0.7}</Text>
        </Box>

        <Box flexDirection="row" gap={2} marginY={1}>
          <ActionButton label="Save" onExecute={onSave} autoFocus />
          <ActionButton label="Edit" onExecute={onEdit} />
        </Box>
      </Box>
    </AppModal>
  );
};

export const AgentPreview: React.FC<AgentPreviewProps> = (props) => {
  return (
    <FocusProvider>
      <AgentPreviewContent {...props} />
    </FocusProvider>
  );
};
