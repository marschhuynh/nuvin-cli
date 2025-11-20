import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useExplainMode } from '@/contexts/ExplainModeContext.js';
import { ToolResultView } from '@/components/ToolResultView/ToolResultView.js';
import { FileEditParamRender, FileNewParamRender, DefaultParamRender, AssignTaskParamRender } from './params/index.js';
import { ToolTimer } from '@/components/ToolTimer.js';

type ToolCallProps = {
  toolCall: ToolCall;
  toolResult?: MessageLineType; // The merged result message
  messageId: string;
};

/**
 * ToolCallViewer - Combines tool call and tool result into a single component
 *
 * Displays:
 * - Tool call name
 * - All parameters (each on its own line)
 * - Live timer (updates every 100ms until result arrives)
 * - Tool result (when available)
 */
export const ToolCallViewer: React.FC<ToolCallProps> = ({ toolCall, toolResult, messageId }) => {
  const { theme } = useTheme();
  const { explainMode } = useExplainMode();

  const parseArguments = (tc: ToolCall): Record<string, unknown> => {
    try {
      return typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments || {};
    } catch {
      return {};
    }
  };

  const formatValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 0);
    }
    return String(value);
  };

  const args = parseArguments(toolCall);
  const finalDuration = toolResult?.metadata?.duration;
  const toolExecutionResult = toolResult?.metadata?.toolResult as ToolExecutionResult | undefined;
  const hasResult = !!toolExecutionResult;

  const getToolDisplayName = (name: string): string => {
    const toolNameMap: Record<string, string> = {
      file_read: 'Read file',
      file_edit: 'Edit file',
      file_new: 'Create file',
      bash_tool: 'Run command',
      web_search: 'Search web',
      web_fetch: 'Fetch page',
      dir_ls: 'List directory',
      todo_write: 'Update todo',
      assign_task: 'Delegate task',
    };
    return toolNameMap[name] || name;
  };

  const toolName = toolCall.function.name;
  const displayName =
    args.description && typeof args.description === 'string' && args.description.trim()
      ? args.description
      : getToolDisplayName(toolName);
  const getParameterRenderer = () => {
    switch (toolName) {
      case 'file_edit':
        return FileEditParamRender;
      case 'file_new':
        return FileNewParamRender;
      case 'assign_task':
        return AssignTaskParamRender;
      case 'todo_write':
        return () => null;
      default:
        return DefaultParamRender;
    }
  };

  const statusColor =
    toolExecutionResult?.status === 'success'
      ? theme.status.success
      : toolExecutionResult?.status === 'error'
        ? theme.status.error
        : theme.status.idle;

  return (
    <Box flexDirection="column">
      {/* Tool Call Header */}
      <Box flexDirection="row">
        <Box flexShrink={0} marginRight={1}>
          <Text color={theme.messageTypes.tool} bold>
            »
          </Text>
        </Box>
        <Text bold>{displayName}</Text>
      </Box>

      {/* Tool Call Parameters */}
      {(() => {
        const ParamRenderer = getParameterRenderer();
        return <ParamRenderer toolCall={toolCall} args={args} statusColor={statusColor} formatValue={formatValue} />;
      })()}

      {!hasResult && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={statusColor}>
            └─{' '}
          </Text>
          <Text>Running ...</Text>
          {toolCall?.function?.name === 'bash_tool' && (
            <Box marginLeft={1}>
              <ToolTimer hasResult={hasResult} finalDuration={finalDuration} />
            </Box>
          )}
        </Box>
      )}

      {/* Tool Result (when available) */}
      {hasResult && toolExecutionResult ? (
        <ToolResultView
          toolResult={toolExecutionResult}
          toolCall={toolCall}
          messageId={`${messageId}-result-${toolCall.id}`}
          messageContent={toolResult?.content || ''}
          fullMode={explainMode}
        />
      ) : null}
    </Box>
  );
};
