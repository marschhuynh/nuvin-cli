import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';

interface MCPToolItemProps {
  item: string;
  isSelected: boolean;
  allowed: boolean;
  index?: number;
}

export const MCPToolItem: React.FC<MCPToolItemProps> = ({ item: toolName, isSelected, allowed, index }) => {
  const { theme } = useTheme();
  const statusColor = allowed ? theme.tokens.green : theme.tokens.red;
  const statusIcon = allowed ? '✓' : '✗';

  return (
    <Box>
      <Text color={statusColor} bold>
        {statusIcon}
      </Text>
      <Text> </Text>
      {index !== undefined && (
        <>
          <Text color={theme.history.help} dimColor>
            [{index}]
          </Text>
          <Text> </Text>
        </>
      )}
      <Text
        color={isSelected ? theme.colors.primary : theme.history.unselected}
        bold={isSelected}
        dimColor={!isSelected}
      >
        {toolName}
      </Text>
    </Box>
  );
};
