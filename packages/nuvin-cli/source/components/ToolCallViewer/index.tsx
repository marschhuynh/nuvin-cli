import type React from 'react';
import { Box, Text } from 'ink';
import { type ToolCall, type ToolExecutionResult, ErrorReason, parseToolArguments } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { ToolResultView } from './ToolResultView/index.js';
import { FileEditParamRender, FileNewParamRender, DefaultParamRender, AssignTaskParamRender } from './params/index.js';
import { ToolTimer } from '@/components/ToolTimer.js';
import { getToolDisplayName } from '@/components/toolRegistry.js';

type ToolCallProps = {
  toolCall: ToolCall;
  toolResult?: MessageLineType;
  messageId: string;
};

export const ToolCallViewer: React.FC<ToolCallProps> = ({ toolCall, toolResult, messageId }) => {
  const { theme } = useTheme();
  const { pendingApprovalTools } = useToolApproval();

  const isAwaitingApproval = pendingApprovalTools.some((tc) => tc.id === toolCall.id);

  if (isAwaitingApproval) {
    return null;
  }

  const formatValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 0);
    }
    return String(value);
  };

  const args = parseToolArguments(toolCall.function.arguments);
  const finalDuration = toolResult?.metadata?.duration;
  const toolExecutionResult = toolResult?.metadata?.toolResult as ToolExecutionResult | undefined;
  const isDenied =
    toolExecutionResult?.status === 'error' && toolExecutionResult.metadata?.errorReason === ErrorReason.Denied;
  const isEdited =
    toolExecutionResult?.status === 'error' && toolExecutionResult.metadata?.errorReason === ErrorReason.Edited;
  const hasResult = !!toolExecutionResult && !isDenied && !isEdited;

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
    isDenied || isEdited
      ? theme.status.warning
      : toolExecutionResult?.status === 'success'
        ? theme.status.success
        : toolExecutionResult?.status === 'error'
          ? theme.status.error
          : theme.status.idle;

  const ParamRenderer = getParameterRenderer();

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexShrink={0} marginRight={1}>
          <Text color={theme.messageTypes.tool} bold>
            {'⚙︎'}
          </Text>
        </Box>
        <Text bold>{displayName}</Text>
      </Box>

      <ParamRenderer toolCall={toolCall} args={args} statusColor={statusColor} formatValue={formatValue} />

      {!hasResult && !isDenied && !isEdited && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={statusColor}>
            └─{' '}
          </Text>
          <Text>Running ...</Text>
          <Box marginLeft={1}>
            <ToolTimer hasResult={hasResult} finalDuration={finalDuration} />
          </Box>
        </Box>
      )}

      {isDenied && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={theme.colors.warning}>
            └─ Denied
          </Text>
        </Box>
      )}

      {isEdited && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={theme.colors.warning}>
            └─ Edited
          </Text>
        </Box>
      )}

      {hasResult && toolExecutionResult ? (
        <ToolResultView
          toolResult={toolExecutionResult}
          toolCall={toolCall}
          messageId={`${messageId}-result-${toolCall.id}`}
          messageContent={toolResult?.content || ''}
          fullMode={false}
        />
      ) : null}
    </Box>
  );
};
