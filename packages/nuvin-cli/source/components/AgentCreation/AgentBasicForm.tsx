import type React from 'react';
import { Box, type BoxProps, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import { Button } from '@/components/Button.js';
import { FormTextInput } from '@/components/FormTextInput.js';
import type { AgentTemplate } from '@nuvin/nuvin-core';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { HelpText } from '@/components/HelpText.js';
import { ToolSelectInput } from './ToolSelectInput.js';
import { FocusProvider } from '@/contexts/InputContext/FocusContext.js';

const MODAL_HEIGHT = 30;

interface AgentBasicFormProps {
  mode: 'create' | 'edit';
  preview: Partial<AgentTemplate> & { systemPrompt: string };
  availableTools: string[];
  editedName: string;
  editedId: string;
  editedDescription: string;
  editedTools: string[];
  editedTemperature: string;
  editedModel: string;
  error?: string;
  isDefault?: boolean;
  onFieldChange: (field: string, value: string) => void;
  onToolsChange: (tools: string[]) => void;
  onNavigateToSystemPrompt: () => void;
  onDelete?: () => void;
}

const ResponsiveBox: React.FC<BoxProps & { children: React.ReactNode }> = ({ children, ...rest }) => {
  const { cols } = useStdoutDimensions();

  return (
    <Box flexDirection={cols < 80 ? 'column' : 'row'} gap={2} {...rest}>
      {children}
    </Box>
  );
};

const AgentBasicFormContent: React.FC<AgentBasicFormProps> = ({
  mode,
  preview,
  availableTools,
  editedName,
  editedId,
  editedDescription,
  editedTools,
  editedTemperature,
  editedModel,
  error,
  isDefault,
  onFieldChange,
  onToolsChange,
  onNavigateToSystemPrompt: _onNavigateToSystemPrompt,
  onDelete,
}) => {
  const { theme } = useTheme();
  const { cols, rows } = useStdoutDimensions();

  const editingTitle = mode === 'edit' ? 'Edit Agent' : 'Edit Generated Agent';

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
      <HelpText
        segments={[
          { text: 'Tab', highlight: true },
          { text: ' cycle fields • ' },
          { text: 'Ctrl+P', highlight: true },
          { text: ' edit system prompt • ' },
          { text: 'Ctrl+S', highlight: true },
          { text: ' save • ' },
          { text: 'ESC', highlight: true },
          { text: mode === 'edit' ? ' cancel' : ' back to preview' },
        ]}
      />
    </Box>
  );

  const modalHeight = Math.min(MODAL_HEIGHT, rows - 4);

  return (
    <AppModal visible={true} title={editingTitle} footer={footerContent} height={modalHeight}>
      <Box flexDirection="column" flexShrink={1} height={"100%"}>
        <Box flexGrow={1} flexDirection="column" flexShrink={1}>
          {error ? (
            <Box marginBottom={1}>
              <Text color={theme.colors.error}>{error}</Text>
            </Box>
          ) : null}

          <Box marginBottom={1}>
            <Text color={theme.colors.primary} bold>
              {preview.name || 'Custom Agent'}
            </Text>
          </Box>

          <ResponsiveBox marginBottom={1} gap={2}>
            <Box flexGrow={1} width={cols / 4}>
              <FormTextInput
                label="Name:"
                value={editedName}
                onChange={(value) => onFieldChange('name', value)}
                autoFocus
                tabIndex="0"
              />
            </Box>

            <Box flexGrow={1} width={cols / 4}>
              <FormTextInput
                label={`ID${mode === 'edit' ? '' : ' (auto-gen)'}:`}
                value={editedId}
                onChange={(value) => onFieldChange('id', value)}
                tabIndex="0"
              />
            </Box>

            <Box flexGrow={1} width={cols / 4}>
              <FormTextInput label="Model:" value={editedModel} onChange={(value) => onFieldChange('model', value)} tabIndex="0" />
            </Box>

            <Box flexGrow={1} width={cols / 4}>
              <FormTextInput
                label="Temp (0-2):"
                value={editedTemperature}
                onChange={(value) => onFieldChange('temperature', value)}
                tabIndex="0"
              />
            </Box>
          </ResponsiveBox>

          <Box flexDirection="column" marginBottom={1}>
            <ToolSelectInput availableTools={availableTools} selectedTools={editedTools} onChange={onToolsChange} tabIndex="0" />
          </Box>

          <Box marginBottom={1}>
            <FormTextInput
              label="Description:"
              value={editedDescription}
              onChange={(value) => onFieldChange('description', value)}
              tabIndex="0"
            />
          </Box>
        </Box>

        {mode === 'edit' && !isDefault && onDelete && (
          <Box marginY={1} alignItems="flex-end">
            <Button label="Delete Agent" onSubmit={onDelete} variant="danger" tabIndex="0" />
          </Box>
        )}
      </Box>
    </AppModal>
  );
};

export const AgentBasicForm: React.FC<AgentBasicFormProps> = (props) => {
  return (
    <FocusProvider>
      <AgentBasicFormContent {...props} />
    </FocusProvider>
  );
};
