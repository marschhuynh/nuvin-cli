import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolExecutionResult } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';

type TodoItem = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
};

type TodoWriteRendererProps = {
  toolResult: ToolExecutionResult;
  messageId?: string;
  fullMode?: boolean;
};

export const TodoWriteRenderer: React.FC<TodoWriteRendererProps> = ({ toolResult, messageId }) => {
  const { theme } = useTheme();

  if (toolResult.status !== 'success' || !toolResult.metadata) return null;

  const metadata = toolResult.metadata as { items?: TodoItem[] };
  const items = metadata.items;

  if (!items || items.length === 0) return null;

  return (
    <Box flexDirection="column">
      {items.map((item) => {
        const status = item.status;
        const icon = status === 'completed' ? '[✔]' : status === 'in_progress' ? '[~]' : '[ ]';
        const color =
          status === 'completed'
            ? theme.status.idle
            : status === 'in_progress'
              ? theme.status.pending
              : theme.colors.muted;
        return (
          <Text key={`${messageId}-todo-${item.id}`} dimColor color={color}>
            {`${icon} ${item.content}`}
          </Text>
        );
      })}
    </Box>
  );
};
