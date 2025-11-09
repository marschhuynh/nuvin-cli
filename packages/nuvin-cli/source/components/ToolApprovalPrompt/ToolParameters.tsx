import type React from 'react';
import type { ToolCall } from '@nuvin/nuvin-core';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { ToolContentRenderer } from '@/components/ToolContentRenderer/index.js';

type ToolParametersProps = {
  toolCall: ToolCall;
};

export const ToolParameters: React.FC<ToolParametersProps> = ({ toolCall }) => {
  const { theme } = useTheme();

  const formatToolArguments = (call: ToolCall) => {
    try {
      const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      const toolName = call.function.name;

      if (toolName === 'bash_tool' || toolName === 'assign_task') {
        const filteredArgs = Object.entries(args).filter(([key]) => key !== 'description');
        return filteredArgs;
      }

      return Object.entries(args);
    } catch {
      return [];
    }
  };

  const formatParameterValue = (value: unknown): string => {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object') {
      const str = JSON.stringify(value, null, 0);
      return str;
    }
    return String(value);
  };

  const toolArgs = formatToolArguments(toolCall);

  return (
    <Box flexDirection="column">
      {toolCall.function.name !== 'file_edit' && toolCall.function.name !== 'file_new' && (
        <>
          <Box>
            <Text color={theme.toolApproval.statusText}>Parameters:</Text>
          </Box>
          {toolArgs.map(([key, value]) => (
            <Box key={key} marginLeft={2} flexDirection="column">
              <Text dimColor>{`${key}: ${formatParameterValue(value)}`}</Text>
            </Box>
          ))}
        </>
      )}
      <ToolContentRenderer call={toolCall} />
    </Box>
  );
};
