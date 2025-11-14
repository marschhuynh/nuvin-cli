import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolParamRendererProps } from './types.js';

/**
 * AssignTaskParamRender - Parameter renderer for assign_task tool calls
 *
 * Filters out description parameter to avoid duplication since it's shown in header.
 * Shows agent and task parameters for assignment delegation.
 */
export const AssignTaskParamRender: React.FC<ToolParamRendererProps> = ({
  args,
  statusColor,
  formatValue,
}: ToolParamRendererProps) => {
  const filteredArgs = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'description'));

  if (Object.keys(filteredArgs).length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      borderStyle="single"
      borderDimColor
      borderColor={statusColor}
      borderBottom={false}
      borderRight={false}
      borderTop={false}
      paddingLeft={2}
    >
      {Object.entries(filteredArgs).map(([key, value]) => (
        <Box key={key} flexDirection="row">
          <Text dimColor>{key}: </Text>
          <Text dimColor>{formatValue(value)}</Text>
        </Box>
      ))}
    </Box>
  );
};
