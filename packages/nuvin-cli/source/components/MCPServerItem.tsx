import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { MCPServerInfo } from '@/services/MCPServerManager.js';

interface MCPServerItemProps {
  item: MCPServerInfo;
  isSelected: boolean;
  allowedCount: number;
  totalCount: number;
  disabled?: boolean;
  reconnecting?: boolean;
}

export const MCPServerItem: React.FC<MCPServerItemProps> = ({
  item,
  isSelected,
  allowedCount,
  totalCount,
  disabled,
  reconnecting,
}) => {
  const { theme } = useTheme();
  const isFailed = item.status === 'failed';
  const isPending = item.status === 'pending';

  let statusColor: string;
  let statusIcon: string;

  if (reconnecting) {
    statusColor = theme.tokens.cyan;
    statusIcon = '↻';
  } else if (disabled) {
    statusColor = theme.history.unselected;
    statusIcon = '◌';
  } else if (isFailed) {
    statusColor = theme.tokens.red;
    statusIcon = '✗';
  } else if (isPending) {
    statusColor = theme.tokens.yellow;
    statusIcon = '○';
  } else {
    statusColor = theme.tokens.green;
    statusIcon = '●';
  }

  const getAuthBadge = () => {
    if (!item.authStatus || item.authStatus.type === 'none') {
      return null;
    }

    if (item.authStatus.type === 'bearer') {
      return (
        <Text color={theme.tokens.green} dimColor={!isSelected}>
          {' '}
          🔑
        </Text>
      );
    }

    if (item.authStatus.type === 'oauth') {
      if (item.authStatus.authenticated) {
        const isExpiringSoon =
          item.authStatus.expiresAt && item.authStatus.expiresAt - Date.now() < 5 * 60 * 1000;
        return (
          <Text color={isExpiringSoon ? theme.tokens.yellow : theme.tokens.green} dimColor={!isSelected}>
            {' '}
            {isExpiringSoon ? '🔐⚠' : '🔐'}
          </Text>
        );
      }
      return (
        <Text color={theme.tokens.red} dimColor={!isSelected}>
          {' '}
          🔒
        </Text>
      );
    }

    return null;
  };

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
          dimColor={!isSelected || disabled}
          strikethrough={disabled}
        >
          {item.id}
        </Text>
        {getAuthBadge()}
        {reconnecting && (
          <Text color={theme.tokens.cyan} dimColor>
            {' '}
            (connecting...)
          </Text>
        )}
        {!disabled && !reconnecting && (
          <Text color={theme.history.badge} dimColor={!isSelected}>
            {' '}
            [{allowedCount}/{totalCount}]
          </Text>
        )}
        {disabled && !reconnecting && (
          <Text color={theme.history.unselected} dimColor>
            {' '}
            (disabled)
          </Text>
        )}
      </Box>
    </Box>
  );
};
