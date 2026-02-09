import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import TextInput from '@/components/TextInput/index.js';
import type { AgentTemplate } from '@nuvin/nuvin-core';
import { FocusProvider } from '@/contexts/InputContext/FocusContext.js';
import { HelpText } from '@/components/HelpText.js';
import { Focusable } from '@/components/Focusable/index.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

interface AgentInstructionsFormProps {
  mode: 'create' | 'edit';
  preview: Partial<AgentTemplate> & { instructions: string };
  editedInstructions: string;
  error?: string;
  onInstructionsChange: (value: string) => void;
  onNavigateBack: () => void;
}

const AgentInstructionsFormContent: React.FC<AgentInstructionsFormProps> = ({
  mode,
  preview,
  editedInstructions,
  error,
  onInstructionsChange,
  onNavigateBack: _onNavigateBack,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const title = mode === 'edit' ? 'Edit Instructions' : 'Edit Generated Instructions';

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1}>
      <HelpText
        segments={[
          { text: 'Ctrl+P', highlight: true },
          { text: ' agent details • ' },
          { text: 'Ctrl+S', highlight: true },
          { text: ' save • ' },
          { text: 'ESC', highlight: true },
          { text: ' back' },
        ]}
      />
    </Box>
  );

  const maxLines = Math.min(24, rows - 10);

  // Determine if the message is informational (vs a true error)
  const isInfoMessage = error?.includes('Created global override') || error?.includes('Editing global version');
  const messageColor = isInfoMessage ? theme.colors.warning : theme.colors.error;

  return (
    <AppModal visible={true} title={title} footer={footerContent}>
      <Box flexDirection="column" flexGrow={1}>
        {error ? (
          <Box marginBottom={1}>
            <Text color={messageColor}>{error}</Text>
          </Box>
        ) : null}

        <Box marginBottom={1}>
          <Text color={theme.colors.primary} bold>
            {preview.name || 'Custom Agent'}
          </Text>
          <Text color={theme.modal.subtitle}> • Instructions</Text>
        </Box>

        <Focusable autoFocus>
          {({ isFocused }) => (
            <Box flexDirection="column" flexGrow={1}>
              <Text color={isFocused ? theme.colors.accent : theme.modal.help} bold={isFocused} dimColor={!isFocused}>
                Instructions:
              </Text>
              <TextInput
                value={editedInstructions}
                onChange={onInstructionsChange}
                focus={isFocused}
                maxLines={maxLines}
                showScrollbar
              />
            </Box>
          )}
        </Focusable>
      </Box>
    </AppModal>
  );
};

export const AgentInstructionsForm: React.FC<AgentInstructionsFormProps> = (props) => {
  return (
    <FocusProvider>
      <AgentInstructionsFormContent {...props} />
    </FocusProvider>
  );
};
