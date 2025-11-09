import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { MCPServerInfo } from '@/services/MCPServerManager.js';

interface MCPServerItemProps {
  item: MCPServerInfo;
  isSelected: boolean;
  allowedCount: number;
  totalCount: number;
}

export const MCPServerItem: React.FC<MCPServerItemProps> = ({ item, isSelected, allowedCount, totalCount }) => {
  const { theme } = useTheme();
  const isFailed = item.status === 'failed';
  const statusColor = isFailed ? 'red' : item.status === 'connected' ? 'green' : 'yellow';
  const statusIcon = isFailed ? '✗' : item.status === 'connected' ? '●' : '○';

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={statusColor} bold>
          {statusIcon}
        </Text>
        <Text> </Text>
        <Text
          color={isSelected ? theme.tokens.cyan : theme.history.unselected}
          bold={isSelected}
          dimColor={!isSelected}
        >
          {item.id}
        </Text>
        <Text color={theme.history.badge} dimColor={!isSelected}>
          {' '}
          [{allowedCount}/{totalCount}]
        </Text>
      </Box>
    </Box>
  );
};
