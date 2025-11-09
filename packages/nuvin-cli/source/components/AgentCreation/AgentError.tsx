import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';

interface AgentErrorProps {
  error: string;
}

export const AgentError: React.FC<AgentErrorProps> = ({ error }) => {
  const { theme } = useTheme();

  return (
    <AppModal visible={true} title="Error Creating Agent" titleColor={theme.colors.error} type="error">
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.colors.error}>{error}</Text>
        <Box marginTop={1}>
          <Text color={theme.modal.help}>Press ESC to try again</Text>
        </Box>
      </Box>
    </AppModal>
  );
};
