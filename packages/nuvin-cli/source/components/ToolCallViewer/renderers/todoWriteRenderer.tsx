import { Box, Text } from 'ink';
import type { ToolRenderContext, RenderFn } from '../types.js';

type TodoItem = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  createdAt?: string;
};

type TodoWriteMetadata = {
  items?: TodoItem[];
};

export const todoWriteRenderer = {
  result: ((ctx: ToolRenderContext) => {
    const { toolResult, theme } = ctx;

    if (toolResult?.status !== 'success' || !toolResult.metadata) {
      return null;
    }

    const metadata = toolResult.metadata as TodoWriteMetadata;
    const items = metadata.items;

    if (!items || items.length === 0) {
      return null;
    }

    return (
      <Box flexDirection="column" marginLeft={2}>
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
            <Text key={`todo-${item.id}`} dimColor color={color}>
              {`${icon} ${item.content}`}
            </Text>
          );
        })}
      </Box>
    );
  }) as RenderFn,
};
