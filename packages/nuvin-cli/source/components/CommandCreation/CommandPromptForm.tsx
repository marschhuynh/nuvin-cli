import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import TextInput from '@/components/TextInput/index.js';
import { FocusProvider } from '@/contexts/InputContext/FocusContext.js';
import { Focusable } from '@/components/Focusable/index.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

interface CommandPromptFormProps {
  mode: 'create' | 'edit';
  commandName: string;
  editedPrompt: string;
  error?: string;
  onPromptChange: (value: string) => void;
}

const CommandPromptFormContent: React.FC<CommandPromptFormProps> = ({
  mode,
  commandName,
  editedPrompt,
  error,
  onPromptChange,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const title = mode === 'edit' ? 'Edit Prompt Template' : 'Create Prompt Template';

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1}>
      <HelpText
        segments={[
          { text: 'Ctrl+P', highlight: true },
          { text: ' command details • ' },
          { text: 'Ctrl+S', highlight: true },
          { text: ' save • ' },
          { text: 'ESC', highlight: true },
          { text: ' back' },
        ]}
      />
    </Box>
  );

  const maxLines = Math.max(5, rows - 10);

  return (
    <AppModal visible={true} title={title} footer={footerContent}>
      <Box flexDirection="column" flexGrow={1}>
        {error && (
          <Box marginBottom={1}>
            <Text color={theme.colors.error}>{error}</Text>
          </Box>
        )}

        <Box marginBottom={1}>
          <Text color={theme.colors.primary} bold>
            /{commandName || 'command-name'}
          </Text>
          <Text color={theme.modal.subtitle}> • Prompt Template</Text>
        </Box>

        <Focusable autoFocus>
          {({ isFocused }) => (
            <Box flexDirection="column" flexGrow={1}>
              <Text color={isFocused ? theme.colors.accent : theme.modal.help} bold={isFocused} dimColor={!isFocused}>
                Prompt Template:
              </Text>
              <TextInput
                value={editedPrompt}
                onChange={onPromptChange}
                focus={isFocused}
                maxLines={maxLines}
                showScrollbar
              />
              <Box marginTop={1}>
                <Text color={theme.history.help} dimColor>
                  Use {'{{user_prompt}}'} where user input should appear
                </Text>
              </Box>
            </Box>
          )}
        </Focusable>
      </Box>
    </AppModal>
  );
};

export const CommandPromptForm: React.FC<CommandPromptFormProps> = (props) => {
  return (
    <FocusProvider>
      <CommandPromptFormContent {...props} />
    </FocusProvider>
  );
};
