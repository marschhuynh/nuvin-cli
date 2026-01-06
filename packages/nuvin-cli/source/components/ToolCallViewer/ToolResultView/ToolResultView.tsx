import type React from 'react';
import { Box, Text } from 'ink';
import { type ToolExecutionResult, type ToolCall, type MetricsSnapshot, isAssignSuccess } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';
import { Markdown } from '@/components/Markdown/index.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { TodoWriteRenderer } from './renderers/TodoWriteRenderer.js';
import { FileEditRenderer } from './renderers/FileEditRenderer.js';
import { FileReadRenderer } from './renderers/FileReadRenderer.js';
import { FileNewRenderer } from './renderers/FileNewRenderer.js';
import { BashToolRenderer } from './renderers/BashToolRenderer.js';
import { DefaultRenderer } from './renderers/DefaultRenderer.js';
import { LAYOUT } from './renderers/constants.js';
import { formatDuration } from '@/utils/formatters.js';
import { getStatusMessage } from './statusStrategies/index.js';
import { isCollapsedTool } from '@/components/toolRegistry.js';

type ToolResultViewProps = {
  toolResult: ToolExecutionResult;
  toolCall?: ToolCall;
  messageId?: string;
  messageContent?: string;
  messageColor?: string;
  fullMode?: boolean;
  subAgentMetrics?: MetricsSnapshot;
};

export const ToolResultView: React.FC<ToolResultViewProps> = ({
  toolResult,
  toolCall,
  messageId,
  messageContent,
  messageColor,
  fullMode = false,
  subAgentMetrics,
}) => {
  const { theme } = useTheme();
  const { cols } = useStdoutDimensions();
  const durationText = formatDuration(toolResult.durationMs);
  const { text, color, statusPosition = 'top' } = getStatusMessage(toolResult, toolCall, theme, subAgentMetrics);

  const renderContent = () => {
    switch (toolResult.name) {
      case 'assign_task': {
        if (isAssignSuccess(toolResult)) {
          const resultStr = (toolResult.result as string).replace(/\\n/g, '\n');
          return <Markdown maxWidth={cols - LAYOUT.MARKDOWN_MARGIN}>{resultStr}</Markdown>;
        }
        const errorStr =
          toolResult.type === 'text' ? (toolResult.result as string) : JSON.stringify(toolResult.result, null, 2);
        return <Markdown maxWidth={cols - LAYOUT.MARKDOWN_MARGIN}>{errorStr}</Markdown>;
      }
      case 'todo_write':
        return <TodoWriteRenderer toolResult={toolResult} messageId={messageId} fullMode={fullMode} />;
      case 'file_edit':
        return (
          <FileEditRenderer toolResult={toolResult} toolCall={toolCall} messageId={messageId} fullMode={fullMode} />
        );
      case 'file_read':
        return (
          <FileReadRenderer
            toolResult={toolResult}
            messageId={messageId}
            messageContent={messageContent}
            messageColor={messageColor}
            fullMode={fullMode}
            cols={cols}
          />
        );
      case 'file_new':
        return (
          <FileNewRenderer
            toolResult={toolResult}
            toolCall={toolCall}
            messageId={messageId}
            messageContent={messageContent}
            messageColor={messageColor}
            fullMode={fullMode}
            cols={cols}
          />
        );
      case 'bash_tool':
        return (
          <BashToolRenderer
            toolResult={toolResult}
            messageId={messageId}
            messageContent={messageContent}
            messageColor={messageColor}
            fullMode={fullMode}
            cols={cols}
          />
        );
      default:
        return (
          <DefaultRenderer
            toolResult={toolResult}
            messageId={messageId}
            messageContent={messageContent}
            messageColor={messageColor}
            fullMode={fullMode}
            cols={cols}
          />
        );
    }
  };

  const content = renderContent();

  const collapsed = isCollapsedTool(toolResult.name);
  const hasResult = toolResult.result != null && toolResult.result !== '';
  const isTodoWrite = toolResult.name === 'todo_write';

  const shouldShowStatus = hasResult || isTodoWrite;
  const shouldShowContent = (hasResult || isTodoWrite) && (!collapsed || fullMode);
  const shouldShowDone = !collapsed || fullMode;

  const showStatusTop = shouldShowStatus && statusPosition === 'top';
  const showStatusBottom = shouldShowStatus && statusPosition === 'bottom';
  const showDone = shouldShowDone && statusPosition === 'top';
  const hasMoreContent = shouldShowContent || showDone;

  return (
    <Box marginLeft={2} flexDirection="column">
      {showStatusTop && (
        <Box flexDirection="row">
          <Text dimColor color={color}>
            {`${hasMoreContent ? '├─' : '└─'} ${text}`}
          </Text>
        </Box>
      )}
      {shouldShowContent && (
        <Box
          borderStyle="single"
          borderColor={color}
          borderDimColor
          borderBottom={false}
          borderRight={false}
          borderTop={false}
          flexDirection="column"
          paddingLeft={2}
          width={cols - 10}
        >
          {content}
        </Box>
      )}
      {showDone && (
        <Box flexDirection="row">
          <Text dimColor color={color}>
            {`└─ Done${durationText && (toolResult.durationMs ?? 0) > 1000 ? ` in ${durationText}` : ''}`}
          </Text>
        </Box>
      )}
      {showStatusBottom && (
        <Box flexDirection="row">
          <Text dimColor color={color}>{`└─ ${text}`}</Text>
        </Box>
      )}
    </Box>
  );
};
