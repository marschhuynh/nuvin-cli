import type React from 'react';
import { Box, type BoxProps, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import { Button } from '@/components/Button.js';
import { FormTextInput } from '@/components/FormTextInput.js';
import type { AgentTemplate } from '@nuvin/nuvin-core';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { FocusProvider } from '@/contexts/InputContext/FocusContext.js';
import { HelpText } from '@/components/HelpText.js';
import { ToolSelectInput } from './ToolSelectInput.js';

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
  const { cols } = useStdoutDimensions();
  const { theme } = useTheme();

  const editingTitle = mode === 'edit' ? 'Edit Agent' : 'Edit Generated Agent';

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1}>
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

  return (
    <AppModal visible={true} title={editingTitle} footer={footerContent}>
      <Box flexDirection="column">
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
            />
          </Box>

          <Box flexGrow={1} width={cols / 4}>
            <FormTextInput
              label={`ID${mode === 'edit' ? '' : ' (auto-gen)'}:`}
              value={editedId}
              onChange={(value) => onFieldChange('id', value)}
            />
          </Box>

          <Box flexGrow={1} width={cols / 4}>
            <FormTextInput label="Model:" value={editedModel} onChange={(value) => onFieldChange('model', value)} />
          </Box>

          <Box flexGrow={1} width={cols / 4}>
            <FormTextInput
              label="Temp (0-2):"
              value={editedTemperature}
              onChange={(value) => onFieldChange('temperature', value)}
            />
          </Box>
        </ResponsiveBox>

        <Box flexDirection="column" marginBottom={1}>
          <ToolSelectInput availableTools={availableTools} selectedTools={editedTools} onChange={onToolsChange} />
        </Box>

        <Box marginBottom={1}>
          <FormTextInput
            label="Description:"
            value={editedDescription}
            onChange={(value) => onFieldChange('description', value)}
          />
        </Box>

        {mode === 'edit' && !isDefault && onDelete && (
          <Box marginY={1}>
            <Button label="Delete Agent" onSubmit={onDelete} variant="danger" />
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
