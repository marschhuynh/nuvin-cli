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
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

type ToolCallProps = {
  toolCall: ToolCall;
  toolResult?: MessageLineType;
  messageId: string;
};

const getMainArgument = (toolName: string, args: Record<string, unknown>): { value: string | undefined; key: string | undefined } => {
  switch (toolName) {
    case 'file_read':
    case 'ls_tool': {
      const path = args.path as string | undefined;
      if (!path) return { value: undefined, key: 'path' };
      const lineStart = args.lineStart as number | undefined;
      const lineEnd = args.lineEnd as number | undefined;
      let formatted = path;
      if (lineStart !== undefined && lineEnd !== undefined) {
        formatted = `${path}:${lineStart}-${lineEnd}`;
      } else if (lineStart !== undefined) {
        formatted = `${path}:${lineStart}`;
      }
      return { value: formatted, key: 'path' };
    }
    case 'file_new': {
      const path = args.file_path as string | undefined;
      if (!path) return { value: undefined, key: 'file_path' };
      return { value: path, key: 'file_path' };
    }
    case 'grep_tool':
      return { value: args.pattern as string | undefined, key: 'pattern' };
    case 'web_fetch':
      return { value: args.url as string | undefined, key: 'url' };
    default:
      return { value: undefined, key: undefined };
  }
};

export const ToolCallViewer: React.FC<ToolCallProps> = ({ toolCall, toolResult, messageId }) => {
  const { theme } = useTheme();
  const { pendingApprovalTools } = useToolApproval();
  const { cols } = useStdoutDimensions();

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

  const mainArgInfo = getMainArgument(toolName, args);
  const mainArg = mainArgInfo.value;
  const mainArgKey = mainArgInfo.key;

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
    <Box flexDirection="column" width={cols - 2} overflow='hidden'>
      <Box flexDirection="row">
        <Box flexShrink={0} marginRight={1}>
          <Text color={theme.messageTypes.tool} bold>
            {'⚙︎'}
          </Text>
        </Box>
        <Text wrap="truncate-middle" >
          <Text bold>{displayName}</Text>
          {mainArg && (
            <Text dimColor> {mainArg}</Text>
          )}
        </Text>
      </Box>

      <ParamRenderer toolCall={toolCall} args={args} statusColor={statusColor} formatValue={formatValue} mainArgKey={mainArgKey} />

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
