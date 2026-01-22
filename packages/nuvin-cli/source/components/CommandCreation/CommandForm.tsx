import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { Button } from '@/components/Button.js';
import { FormTextInput } from '@/components/FormTextInput.js';
import { FocusProvider, useFocus } from '@/contexts/InputContext/FocusContext.js';
import { useInput } from '@/contexts/InputContext/index.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import TextInput from '@/components/TextInput/index.js';
import { Focusable } from '@/components/Focusable/index.js';
import type { CommandSource, CustomCommandTemplate } from '@nuvin/nuvin-core';

const MODAL_HEIGHT = 30;

interface CommandFormProps {
  mode: 'create' | 'edit';
  command: Partial<CustomCommandTemplate>;
  availableScopes: CommandSource[];
  activeProfile?: string;
  editedName: string;
  editedDescription: string;
  editedScope: CommandSource;
  editedPrompt: string;
  error?: string;
  onFieldChange: (field: string, value: string) => void;
  onScopeChange: (direction: 'left' | 'right') => void;
  onDelete?: () => void;
}

const SCOPE_LABELS: Record<CommandSource, string> = {
  global: 'Global',
  profile: 'Profile',
  local: 'Local',
};

const ScopeSelector: React.FC<{
  availableScopes: CommandSource[];
  editedScope: CommandSource;
  activeProfile?: string;
  onScopeChange: (direction: 'left' | 'right') => void;
  tabIndex?: number;
}> = ({ availableScopes, editedScope, activeProfile, onScopeChange, tabIndex }) => {
  const { theme } = useTheme();
  const { isFocused } = useFocus({ active: true, tabIndex });

  useInput(
    (_input, key) => {
      if (key.leftArrow) {
        onScopeChange('left');
      } else if (key.rightArrow) {
        onScopeChange('right');
      }
    },
    { isActive: isFocused },
  );

  const getScopeLabel = (scope: CommandSource): string => {
    if (scope === 'profile' && activeProfile) {
      return `Profile (${activeProfile})`;
    }
    return SCOPE_LABELS[scope];
  };

  return (
    <Box flexDirection="column">
      <Text color={isFocused ? theme.colors.accent : theme.modal.help} bold={isFocused} dimColor={!isFocused}>
        Scope:{isFocused ? ' (←/→ to change)' : ''}
      </Text>
      <Box flexDirection="row" gap={2}>
        {availableScopes.map((scope) => (
          <Box key={scope}>
            <Text
              color={editedScope === scope ? theme.tokens.cyan : theme.history.unselected}
              bold={editedScope === scope}
            >
              {editedScope === scope ? '(●)' : '( )'} {getScopeLabel(scope)}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const CommandFormContent: React.FC<CommandFormProps> = ({
  mode,
  availableScopes,
  activeProfile,
  editedName,
  editedDescription,
  editedScope,
  editedPrompt,
  error,
  onFieldChange,
  onScopeChange,
  onDelete,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const title = mode === 'edit' ? 'Edit Command' : 'Create Command';

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1}>
      <HelpText
        segments={[
          { text: 'Tab', highlight: true },
          { text: ' cycle fields • ' },
          { text: 'Ctrl+S', highlight: true },
          { text: ' save • ' },
          { text: 'ESC', highlight: true },
          { text: ' cancel' },
        ]}
      />
    </Box>
  );

  const promptMaxLines = Math.max(3, rows - 22);

  return (
    <AppModal visible={true} title={title} footer={footerContent} height={Math.min(MODAL_HEIGHT, rows - 4)}>
      <Box flexDirection="column">
        {error && (
          <Box marginBottom={1}>
            <Text color={theme.colors.error}>{error}</Text>
          </Box>
        )}

        <Box marginBottom={1}>
          <Text color={theme.colors.primary} bold>
            /{editedName || 'command-name'}
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <FormTextInput
            label="Command Name (without /):"
            value={editedName}
            onChange={(value) => onFieldChange('name', value)}
            autoFocus
            tabIndex={1}
          />
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <FormTextInput
            label="Description:"
            value={editedDescription}
            onChange={(value) => onFieldChange('description', value)}
            tabIndex={2}
          />
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <ScopeSelector
            availableScopes={availableScopes}
            editedScope={editedScope}
            activeProfile={activeProfile}
            onScopeChange={onScopeChange}
            tabIndex={3}
          />
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Focusable tabIndex={4}>
            {({ isFocused }) => (
              <Box flexDirection="column">
                <Text color={isFocused ? theme.colors.accent : theme.modal.help} bold={isFocused} dimColor={!isFocused}>
                  Prompt Template:
                </Text>
                <TextInput
                  value={editedPrompt}
                  onChange={(value) => onFieldChange('prompt', value)}
                  focus={isFocused}
                  maxLines={promptMaxLines}
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

        {mode === 'edit' && onDelete && (
          <Box marginY={1}>
            <Button label="Delete Command" onSubmit={onDelete} variant="danger" tabIndex={5} />
          </Box>
        )}
      </Box>
    </AppModal>
  );
};

export const CommandForm: React.FC<CommandFormProps> = (props) => {
  return (
    <FocusProvider>
      <CommandFormContent {...props} />
    </FocusProvider>
  );
};
