import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolExecutionResult, ToolCall } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';
import { TodoWriteRenderer } from './renderers/TodoWriteRenderer.js';
import { FileEditRenderer } from './renderers/FileEditRenderer.js';
import { FileReadRenderer } from './renderers/FileReadRenderer.js';
import { FileNewRenderer } from './renderers/FileNewRenderer.js';
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
  fullMode?: boolean;
};

export const ToolResultView: React.FC<ToolResultViewProps> = ({
  toolResult,
  toolCall,
  messageId,
  messageContent,
  messageColor,
  fullMode = false,
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
    const isAborted = toolResult.result.toLowerCase().includes('aborted by user');
    const isDenied = toolResult.result.toLowerCase().includes('denied by user');

    const keyParam = getKeyParam();
    const paramText = keyParam ?? '';

    if (isAborted) {
      return {
        text: 'Aborted',
        color: theme.colors.warning || 'yellow',
        paramText,
      };
    }

    if (isDenied) {
      return {
        text: 'Denied',
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
      case 'file_read': {
        if (isSuccess) {
          const fileContent = typeof toolResult.result === 'string' ? toolResult.result : '';
          const lineCount = fileContent.split(/\r?\n/).length;
          return { text: `Read ${lineCount} lines`, color: statusColor, paramText };
        }
        return { text: 'Read failed', color: statusColor, paramText };
      }
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
          />
        );
    }
  };

  const { text, color } = getStatusMessage();
  const content = renderContent();

  const hasResult = toolResult.result !== null && toolResult.result !== undefined && toolResult.result !== '';
  const shouldShowContent =
    (hasResult || toolResult.name === 'todo_write') &&
    ((toolResult.name !== 'file_read' && toolResult.name !== 'file_new') || fullMode);

  const shouldShowDone = (toolResult.name !== 'file_read' && toolResult.name !== 'file_new') || fullMode;
  const shouldShowStatus = hasResult || toolResult.name === 'todo_write';

  return (
    <Box marginLeft={2} flexDirection="column">
      {shouldShowStatus && (
        <Box flexDirection="row">
          <Text dimColor color={color}>
            {`${shouldShowContent || shouldShowDone ? '├─' : '└─'} ${text}`}
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
      {shouldShowDone && (
        <Box flexDirection="row">
          {durationText && toolResult.durationMs > 1000 ? (
            <Text dimColor={!!toolResult.result} color={color}>{`└─ Done in ${durationText}`}</Text>
          ) : (
            <Text dimColor={!!toolResult.result} color={color}>{`└─ Done`}</Text>
          )}
        </Box>
      )}
    </Box>
  );
};
