import type React from 'react';
import type { ToolCall } from '@nuvin/nuvin-core';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';

type ToolHeaderProps = {
  toolCall: ToolCall;
};

export const ToolHeader: React.FC<ToolHeaderProps> = ({ toolCall }) => {
  const { theme } = useTheme();

  return (
    <Box marginBottom={1} justifyContent="space-between">
      <Text color={theme.toolApproval.toolName} bold>
        {toolCall.function.name}
      </Text>
      <Text color={theme.toolApproval.description} dimColor>
        Tab/←→ Navigate • Enter Select • 1/2/3 Quick Select
      </Text>
    </Box>
  );
};
