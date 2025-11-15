import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolExecutionResult } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';

type TodoItem = {
  content?: string;
  status?: string;
};

type TodoWriteRendererProps = {
  toolResult: ToolExecutionResult;
  messageId?: string;
  fullMode?: boolean;
};

export const TodoWriteRenderer: React.FC<TodoWriteRendererProps> = ({ toolResult, messageId }) => {
  const { theme } = useTheme();

  if (toolResult.status !== 'success') return null;

  const items: TodoItem[] = [];
  const pushFromArray = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === 'object') {
          items.push(entry as TodoItem);
        }
      }
    }
  };

  const payload = toolResult.result;

  if (Array.isArray(payload)) {
    pushFromArray(payload);
  } else if (payload && typeof payload === 'object') {
    if (Array.isArray((payload as { todos?: unknown[] }).todos)) {
      pushFromArray((payload as { todos?: unknown[] }).todos);
    }
  } else if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      pushFromArray(parsed);
    } catch {
      const match = payload.match(/\[([\s\S]*?)\]/);
      if (match) {
        try {
          const parsed = JSON.parse(`[${match[1]}]`);
          pushFromArray(parsed);
        } catch {}
      }
    }
  }

  if (items.length === 0) return null;

  return (
    <Box flexDirection="column">
      {items.map((item) => {
        const status = String(item.status ?? 'pending');
        const icon = status === 'completed' ? '[✔]' : status === 'in_progress' ? '[~]' : '[ ]';
        const color =
          status === 'completed'
            ? theme.status.idle
            : status === 'in_progress'
              ? theme.status.pending
              : theme.colors.muted;
        return (
          <Text key={`${messageId}-todo-${item.content}`} dimColor color={color}>
            {`${icon} ${item.content ?? ''}`}
          </Text>
        );
      })}
    </Box>
  );
};
