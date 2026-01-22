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

interface AgentSystemPromptFormProps {
  mode: 'create' | 'edit';
  preview: Partial<AgentTemplate> & { systemPrompt: string };
  editedSystemPrompt: string;
  error?: string;
  onSystemPromptChange: (value: string) => void;
  onNavigateBack: () => void;
}

const AgentSystemPromptFormContent: React.FC<AgentSystemPromptFormProps> = ({
  mode,
  preview,
  editedSystemPrompt,
  error,
  onSystemPromptChange,
  onNavigateBack: _onNavigateBack,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const title = mode === 'edit' ? 'Edit System Prompt' : 'Edit Generated System Prompt';

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

  return (
    <AppModal visible={true} title={title} footer={footerContent}>
      <Box flexDirection="column" flexGrow={1}>
        {error ? (
          <Box marginBottom={1}>
            <Text color={theme.colors.error}>{error}</Text>
          </Box>
        ) : null}

        <Box marginBottom={1}>
          <Text color={theme.colors.primary} bold>
            {preview.name || 'Custom Agent'}
          </Text>
          <Text color={theme.modal.subtitle}> • System Prompt</Text>
        </Box>

        <Focusable autoFocus>
          {({ isFocused }) => (
            <Box flexDirection="column" flexGrow={1}>
              <Text color={isFocused ? theme.colors.accent : theme.modal.help} bold={isFocused} dimColor={!isFocused}>
                System Prompt:
              </Text>
              <TextInput
                value={editedSystemPrompt}
                onChange={onSystemPromptChange}
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

export const AgentSystemPromptForm: React.FC<AgentSystemPromptFormProps> = (props) => {
  return (
    <FocusProvider>
      <AgentSystemPromptFormContent {...props} />
    </FocusProvider>
  );
};
