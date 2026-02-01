import { Box, Text } from 'ink';
import type { ToolRenderContext, RenderFn } from '../types.js';
import { LAYOUT } from '../types.js';
import { getStateColor } from '../computeToolState.js';

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
    const { toolResult, theme, cols, toolState } = ctx;

    if (toolResult?.status !== 'success' || !toolResult.metadata) {
      return null;
    }

    const metadata = toolResult.metadata as TodoWriteMetadata;
    const items = metadata.items;

    if (!items || items.length === 0) {
      return null;
    }

    const color = getStateColor(toolState, theme);

    return (
      <Box
        flexDirection="column"
        marginLeft={2}
        borderStyle="single"
        borderColor={color}
        borderDimColor
        borderBottom={false}
        borderRight={false}
        borderTop={false}
        paddingLeft={2}
        width={cols - LAYOUT.CONTENT_MARGIN}
      >
        {items.map((item) => {
          const status = item.status;
          const icon = status === 'completed' ? '[✔]' : status === 'in_progress' ? '[~]' : '[ ]';
          const itemColor =
            status === 'completed'
              ? theme.status.idle
              : status === 'in_progress'
                ? theme.status.pending
                : theme.colors.muted;
          return (
            <Text key={`todo-${item.id}`} dimColor color={itemColor}>
              {`${icon} ${item.content}`}
            </Text>
          );
        })}
      </Box>
    );
  }) as RenderFn,
};
