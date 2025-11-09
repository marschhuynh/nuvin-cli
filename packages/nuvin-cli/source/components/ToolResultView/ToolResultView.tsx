import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolExecutionResult, ToolCall } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';
import { TodoWriteRenderer } from './renderers/TodoWriteRenderer.js';
import { FileEditRenderer } from './renderers/FileEditRenderer.js';
import { BashToolRenderer } from './renderers/BashToolRenderer.js';
import { DefaultRenderer } from './renderers/DefaultRenderer.js';
import { Markdown } from '@/components/Markdown.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

type ToolResultViewProps = {
  toolResult: ToolExecutionResult;
  toolCall?: ToolCall;
  messageId?: string;
  messageContent?: string;
  messageColor?: string;
};

export const ToolResultView: React.FC<ToolResultViewProps> = ({
  toolResult,
  toolCall,
  messageId,
  messageContent,
  messageColor,
}) => {
  const { theme } = useTheme();
  const [cols] = useStdoutDimensions();
  const statusColor = toolResult.status === 'success' ? theme.status.success : theme.status.error;
  const durationText =
    typeof toolResult.durationMs === 'number' && Number.isFinite(toolResult.durationMs)
      ? `${toolResult.durationMs}ms`
      : null;

  // Extract key parameter from tool call
  const getKeyParam = (): string | null => {
    if (!toolCall) return null;

    try {
      const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};

      if (args.file_path) return args.file_path;
      if (args.path) return args.path;
      if (args.url) return args.url;
      if (args.query) return args.query.substring(0, 50) + (args.query.length > 50 ? '...' : '');
      if (args.command) return args.command.substring(0, 50) + (args.command.length > 50 ? '...' : '');
      if (args.cmd) return args.cmd.substring(0, 50) + (args.cmd.length > 50 ? '...' : '');

      return null;
    } catch {
      return null;
    }
  };

  const getStatusMessage = () => {
    const isSuccess = toolResult.status === 'success';
    const isAborted =
      toolResult.status === 'error' &&
      typeof toolResult.result === 'string' &&
      toolResult.result.toLowerCase().includes('aborted by user');

    const keyParam = getKeyParam();
    const paramText = keyParam ?? '';

    if (isAborted) {
      return {
        text: 'Aborted',
        color: theme.colors.warning || 'yellow',
        paramText,
      };
    }

    switch (toolResult.name) {
      case 'assign_task': {
        return {
          text: isSuccess ? 'Success' : 'Error',
          color: statusColor,
          paramText,
        };
      }
      case 'file_edit':
        return { text: isSuccess ? 'Edited' : 'Edit failed', color: statusColor, paramText };
      case 'file_read':
        return { text: isSuccess ? 'Read' : 'Read failed', color: statusColor, paramText };
      case 'file_new':
        return { text: isSuccess ? 'Created' : 'Creation failed', color: statusColor, paramText };
      case 'bash_tool':
        return { text: isSuccess ? 'Executed' : 'Execution failed', color: statusColor, paramText };
      case 'web_fetch':
        return { text: isSuccess ? 'Fetched' : 'Fetch failed', color: statusColor, paramText };
      case 'web_search':
        return {
          text: isSuccess ? `Searched` : `Search failed`,
          color: statusColor,
          paramText,
        };
      case 'todo_write':
        return { text: isSuccess ? 'Updated ' : 'Update failed', color: statusColor, paramText };
      case 'dir_ls':
        return { text: isSuccess ? `Listed` : `Listing failed`, color: statusColor, paramText };
      default:
        return { text: toolResult.status, color: statusColor, paramText };
    }
  };
  const renderContent = () => {
    switch (toolResult.name) {
      case 'assign_task': {
        let resultStr =
          typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result, null, 2);

        // Replace escaped newlines with actual newlines
        resultStr = resultStr.replace(/\\n/g, '\n');

        return <Markdown>{resultStr}</Markdown>;
      }
      case 'todo_write':
        return <TodoWriteRenderer toolResult={toolResult} messageId={messageId} />;
      case 'file_edit':
        return <FileEditRenderer toolResult={toolResult} toolCall={toolCall} messageId={messageId} />;
      case 'bash_tool':
        return (
          <BashToolRenderer
            toolResult={toolResult}
            messageId={messageId}
            messageContent={messageContent}
            messageColor={messageColor}
          />
        );
      default:
        return (
          <DefaultRenderer
            toolResult={toolResult}
            messageId={messageId}
            messageContent={messageContent}
            messageColor={messageColor}
          />
        );
    }
  };

  const { text, color } = getStatusMessage();
  const content = renderContent();

  const shouldShowResult =
    (toolResult.result !== null && toolResult.result !== undefined && toolResult.result !== '') ||
    toolResult.name === 'todo_write';

  return (
    <Box marginLeft={2} flexDirection="column">
      {shouldShowResult ? (
        <>
          <Box flexDirection="row">
            <Text dimColor color={statusColor}>
              ├─{' '}
            </Text>
            <Text color={color}>{text}</Text>
          </Box>
          <Box
            borderStyle="single"
            borderColor={statusColor}
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
        </>
      ) : null}
      <Box flexDirection="row">
        {durationText && toolResult.durationMs > 1000 ? (
          <Text dimColor={!!toolResult.result} color={statusColor}>{`└─ Done in ${durationText}`}</Text>
        ) : (
          <Text dimColor={!!toolResult.result} color={statusColor}>{`└─ Done`}</Text>
        )}
      </Box>
    </Box>
  );
};
