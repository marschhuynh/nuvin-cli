import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import type { AgentTemplate } from '@nuvin/nuvin-core';

interface AgentPreviewProps {
  preview: Partial<AgentTemplate> & { systemPrompt: string };
}

export const AgentPreview: React.FC<AgentPreviewProps> = ({ preview }) => {
  const { theme } = useTheme();

  return (
    <AppModal visible={true} title="Preview Generated Agent" titleColor={theme.colors.primary} type="default">
      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text color={theme.colors.primary} bold>
            {preview.name || 'Custom Agent'}
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            ID:
          </Text>
          <Text>{preview.id || '(auto-generated)'}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            Description:
          </Text>
          <Text>{preview.description || 'Custom specialist agent'}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            Tools:
          </Text>
          <Text>{preview.tools?.join(', ') || 'file_read, web_search'}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.modal.help} dimColor>
            Temperature:
          </Text>
          <Text>{preview.temperature ?? 0.7}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="green">Press Y to save this agent, N to edit fields, ESC to cancel</Text>
        </Box>
      </Box>
    </AppModal>
  );
};
