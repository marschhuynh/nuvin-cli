import type React from 'react';
import { Box, type BoxProps, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import TextInput from '@/components/TextInput/index.js';
import { ToolSelectInput } from './ToolSelectInput.js';
import type { AgentTemplate } from '@nuvin/nuvin-core';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

type EditingField = 'name' | 'id' | 'description' | 'systemPrompt' | 'tools' | 'model' | 'temperature';

interface AgentFormProps {
  mode: 'create' | 'edit';
  preview: Partial<AgentTemplate> & { systemPrompt: string };
  availableTools: string[];
  activeField: string;
  editedName: string;
  editedId: string;
  editedDescription: string;
  editedTools: string[];
  editedTemperature: string;
  editedSystemPrompt: string;
  editedModel: string;
  error?: string;
  onFieldChange: (field: string, value: string) => void;
  onFieldSubmit: (field: EditingField) => void;
  onToolsChange: (tools: string[]) => void;
}

const ResponsiveBox: React.FC<BoxProps & { children: React.ReactNode }> = ({ children, ...rest }) => {
  const [cols] = useStdoutDimensions();

  return (
    <Box flexDirection={cols < 80 ? 'column' : 'row'} gap={2} {...rest}>
      {children}
    </Box>
  );
};

export const AgentForm: React.FC<AgentFormProps> = ({
  mode,
  preview,
  availableTools,
  activeField,
  editedName,
  editedId,
  editedDescription,
  editedTools,
  editedTemperature,
  editedModel,
  error,
  onFieldChange,
  onFieldSubmit,
  onToolsChange,
}) => {
  const [cols] = useStdoutDimensions();
  const { theme } = useTheme();

  const editingTitle = mode === 'edit' ? 'Edit Agent' : 'Edit Generated Agent';

  return (
    <AppModal visible={true} title={editingTitle} titleColor={theme.colors.primary} type="default">
      <Box flexDirection="column" marginTop={1}>
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
          <Box flexDirection="column" flexGrow={1} width={cols / 4}>
            <Text color={theme.modal.help} dimColor>
              Name:
            </Text>
            <TextInput
              value={editedName}
              onChange={(value) => onFieldChange('name', value)}
              focus={activeField === 'name'}
              onSubmit={() => onFieldSubmit('name')}
            />
          </Box>

          <Box flexDirection="column" flexGrow={1} width={cols / 4}>
            <Text color={theme.modal.help} dimColor>
              ID{mode === 'edit' ? '' : ' (auto-gen)'}:
            </Text>
            <TextInput
              value={editedId}
              onChange={(value) => onFieldChange('id', value)}
              focus={activeField === 'id'}
              onSubmit={() => onFieldSubmit('id')}
            />
          </Box>

          <Box flexDirection="column" flexGrow={1} width={cols / 4}>
            <Text color={theme.modal.help} dimColor>
              Model:
            </Text>
            <TextInput
              value={editedModel}
              onChange={(value) => onFieldChange('model', value)}
              focus={activeField === 'model'}
              onSubmit={() => onFieldSubmit('model')}
            />
          </Box>

          <Box flexDirection="column" flexGrow={1} width={cols / 4}>
            <Text color={theme.modal.help} dimColor>
              Temp (0-2):
            </Text>
            <TextInput
              value={editedTemperature}
              onChange={(value) => onFieldChange('temperature', value)}
              focus={activeField === 'temperature'}
              onSubmit={() => onFieldSubmit('temperature')}
            />
          </Box>
        </ResponsiveBox>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            Tools:
          </Text>
          <ToolSelectInput
            focus={activeField === 'tools'}
            availableTools={availableTools}
            selectedTools={editedTools}
            onChange={onToolsChange}
            onSubmit={() => onFieldSubmit('tools')}
          />
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            Description:
          </Text>
          <TextInput
            value={editedDescription}
            onChange={(value) => onFieldChange('description', value)}
            focus={activeField === 'description'}
            onSubmit={() => onFieldSubmit('description')}
          />
        </Box>

        <Box marginTop={1}>
          <Text color="green">
            {mode === 'edit'
              ? 'Press Enter on each field to continue, or Ctrl+S to save immediately. ESC cancels editing.'
              : 'Press Enter on each field to continue, or Ctrl+S to save immediately. ESC returns to the preview.'}
          </Text>
        </Box>
      </Box>
    </AppModal>
  );
};
