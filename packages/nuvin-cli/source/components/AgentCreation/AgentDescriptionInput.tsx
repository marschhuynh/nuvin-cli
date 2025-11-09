import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import TextInput from '@/components/TextInput/index.js';

interface AgentDescriptionInputProps {
  description: string;
  onChange: (description: string) => void;
  onSubmit: () => void;
}

export const AgentDescriptionInput: React.FC<AgentDescriptionInputProps> = ({ description, onChange, onSubmit }) => {
  const { theme } = useTheme();

  return (
    <AppModal visible={true} title="Create New Agent" titleColor={theme.colors.primary} type="default">
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.modal.help}>
          Describe what you want this agent to do. Be specific about its role, expertise, and approach.
        </Text>

        <Box marginTop={1} marginBottom={1}>
          <Text color={theme.colors.primary}>Description: </Text>
          <TextInput
            value={description}
            onChange={onChange}
            onSubmit={() => {
              if (description.trim()) {
                onSubmit();
              }
            }}
          />
        </Box>

        <Text color={theme.modal.help} dimColor>
          Press Enter to generate, ESC to cancel
        </Text>

        <Box marginTop={1}>
          <Text color="yellow" dimColor>
            Example: "A security specialist that audits code for vulnerabilities and provides remediation steps"
          </Text>
        </Box>
      </Box>
    </AppModal>
  );
};
