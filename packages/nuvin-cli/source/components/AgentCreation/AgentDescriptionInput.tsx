import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import TextInput from '@/components/TextInput/index.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

const MODAL_HEIGHT = 30;

interface AgentDescriptionInputProps {
  description: string;
  onChange: (description: string) => void;
  onSubmit: () => void;
}

export const AgentDescriptionInput: React.FC<AgentDescriptionInputProps> = ({ description, onChange, onSubmit }) => {
  const { rows } = useStdoutDimensions();
  const { theme } = useTheme();

  return (
    <AppModal visible={true} title="Create New Agent" height={Math.min(MODAL_HEIGHT, rows - 4)}>
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

        <Box marginY={1}>
          <Text color={theme.colors.warning} dimColor>
            Example: "A security specialist that audits code for vulnerabilities and provides remediation steps"
          </Text>
        </Box>
      </Box>
    </AppModal>
  );
};
