import type React from 'react';
import { Box, Text } from 'ink';
import {
  type ToolCall,
  type ToolExecutionResult,
  type SubAgentState,
  type MetricsSnapshot,
  parseToolArguments,
  isAssignSuccess,
} from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters/index';
import { useTheme } from '@/contexts/ThemeContext';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions';
import { ToolTimer } from '../../ToolTimer';
import { GradientRunText } from '../../Gradient';
import { Markdown } from '../../Markdown/index.js';
import { formatCost, formatDuration, formatTokens } from '@/utils/formatters';
import { getToolConfig } from '@/components/ToolCallViewer/registry';
import type { ToolRenderContext, ComputedToolState } from '@/components/ToolCallViewer/types';
import { get } from '@/utils/get.js';

type SubAgentActivityProps = {
  toolCall: ToolCall;
  subAgentState: SubAgentState;
  toolResult?: MessageLineType;
  messageId: string;
};

/**
 * Generate status text for assign_task result
 */
const getAssignTaskStatusText = (result: ToolExecutionResult, subAgentMetrics?: MetricsSnapshot): string => {
  if (isAssignSuccess(result)) {
    const parts: string[] = ['Done'];
    const executionTimeMs = get(result, 'metadata.executionTimeMs') as number | undefined;
    const toolCallsExecuted = get(result, 'metadata.toolCallsExecuted') as number | undefined;
    const tokensUsed = get(result, 'metadata.tokensUsed') as number | undefined;

    if (subAgentMetrics) {
      parts.push(`${subAgentMetrics.llmCallCount} calls`);
      parts.push(`${formatTokens(subAgentMetrics.totalTokens)} tokens`);
      if (subAgentMetrics.totalCost > 0) parts.push(`$${formatCost(subAgentMetrics.totalCost)}`);
      if (executionTimeMs) parts.push(`${formatDuration(executionTimeMs)}`);
    } else {
      if (toolCallsExecuted) parts.push(`${toolCallsExecuted} tools`);
      if (tokensUsed) parts.push(`${formatTokens(tokensUsed)} tokens`);
      if (executionTimeMs) parts.push(`${formatDuration(executionTimeMs)}`);
    }

    return parts.join(' • ');
  }

  // For errors, show the actual error message
  return typeof result.result === 'string' ? result.result : 'Error';
};

const getMainArgument = (toolName: string, args: Record<string, unknown>): string | undefined => {
  switch (toolName) {
    case 'bash_tool':
      return args.cmd as string | undefined;
    case 'file_read':
    case 'ls_tool':
      return args.path as string | undefined;
    case 'file_new':
    case 'file_edit':
      return args.file_path as string | undefined;
    case 'grep_tool':
    case 'glob_tool':
      return args.pattern as string | undefined;
    case 'lsp': {
      const filePath = args.filePath as string | undefined;
      const line = args.line as number | undefined;
      const character = args.character as number | undefined;
      if (!filePath) return args.operation as string | undefined;
      let formatted = filePath;
      if (line !== undefined) {
        formatted += `:${line}`;
        if (character !== undefined) {
          formatted += `:${character}`;
        }
      }
      return formatted;
    }
    case 'web_fetch':
      return args.url as string | undefined;
    default:
      return undefined;
  }
};

/**
 * SubAgentActivity - Displays sub-agent execution activity in real-time
 *
 * Shows:
 * - Agent name with live timer
 * - Task parameters
 * - Progress indicator (Starting... → Running... → success/error)
 * - Tool calls with durations
 * - Final result message
 */
export const SubAgentActivity: React.FC<SubAgentActivityProps> = ({
  toolCall,
  subAgentState,
  toolResult,
  messageId: _messageId,
}) => {
  const { theme } = useTheme();
  const { cols } = useStdoutDimensions();

  // Parse arguments to display
  const args =
    typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

  const agentParam = args.agent || 'unknown';
  const taskDescriptionParam = args.description || '';

  const isCompleted = subAgentState.status === 'completed';
  const toolExecutionResult = toolResult?.metadata?.toolResult as ToolExecutionResult | undefined;

  // Determine status color
  let statusColor = theme.colors.textDim;
  if (isCompleted && subAgentState.finalStatus === 'success') {
    statusColor = theme.status.success;
  } else if (isCompleted && subAgentState.finalStatus === 'error') {
    statusColor = theme.status.error;
  }

  // Format agent name from ID
  const formatAgentName = (agentId: string): string => {
    return agentId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header: [Agent Name] - sticky with background to cover scrolled content */}
      <Box flexDirection="row" flexShrink={0} top={0} position="sticky">
        <Box flexShrink={0} marginRight={1}>
          <Text color={theme.messageTypes.tool} bold>
            »
          </Text>
        </Box>
        <Text>{`${formatAgentName(agentParam)}${taskDescriptionParam ? ` (${taskDescriptionParam})` : ''}`}</Text>
      </Box>

      {/* Parameters: agent and task */}
      <Box flexDirection="column" marginLeft={2}>
        <Box
          flexDirection="column"
          borderStyle="single"
          borderDimColor
          borderColor={statusColor}
          borderBottom={false}
          borderRight={false}
          borderTop={false}
          paddingLeft={2}
          flexShrink={0}
          width={cols - 4}
        >
          {subAgentState.toolCalls.slice(-3).map((toolCall) => {
            let argsDisplay = '';
            let args: Record<string, unknown> = {};

            if (toolCall.arguments) {
              try {
                args = parseToolArguments(toolCall.arguments) as Record<string, unknown>;
                const mainArg = getMainArgument(toolCall.name, args);

                if (mainArg) {
                  argsDisplay = ` ${mainArg}`;
                }
              } catch {
                // Ignore parse errors
              }
            }

            // Determine status icon and color
            let statusIcon = '  ';
            let statusIconColor = theme.colors.textDim;
            let toolState: ComputedToolState = 'running';

            if (toolCall.status === 'success') {
              statusIcon = '✓ ';
              statusIconColor = theme.status.success;
              toolState = 'success';
            } else if (toolCall.status === 'error') {
              statusIcon = '✗ ';
              statusIconColor = theme.status.error;
              toolState = 'error';
            }

            // Get tool config and resolve displayName
            const config = getToolConfig(toolCall.name);
            const ctx: ToolRenderContext = {
              toolCall: {
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.name,
                  arguments: JSON.stringify(args),
                },
              },
              toolState,
              args,
              theme,
              cols,
              config,
            };

            const displayName = typeof config.displayName === 'function' ? config.displayName(ctx) : config.displayName;

            return (
              <Box key={toolCall.id} overflow="hidden" flexDirection="row" height={1}>
                {statusIcon ? <Text color={statusIconColor}>{statusIcon}</Text> : null}
                <Box flexWrap="nowrap" flexGrow={1} overflow="hidden">
                  <Text wrap="truncate-middle">
                    <Text dimColor={false}>{displayName}</Text>
                    <Text dimColor>{argsDisplay}</Text>
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {!isCompleted && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={statusColor}>
            └─{' '}
          </Text>
          <GradientRunText text="Working ..." />
          <Box marginLeft={1}>
            <ToolTimer hasResult={isCompleted} finalDuration={subAgentState.totalDurationMs} />
          </Box>
          {subAgentState.metrics && (
            <Box marginLeft={1}>
              <Text dimColor>
                • {subAgentState.metrics.llmCallCount} calls • {formatTokens(subAgentState.metrics.totalTokens)} tokens
                {subAgentState.metrics.totalCost > 0 && ` • $${formatCost(subAgentState.metrics.totalCost)}`}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Tool Result (when available) - inline rendering for assign_task */}
      {isCompleted && toolExecutionResult ? (
        <Box marginLeft={2} marginBottom={1} flexDirection="column">
          {/* Result content - only show for successful completions */}
          {toolExecutionResult.result && subAgentState.finalStatus === 'success' && (
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
              <Markdown maxWidth={cols - 16}>
                {typeof toolExecutionResult.result === 'string'
                  ? toolExecutionResult.result.replace(/\\n/g, '\n')
                  : JSON.stringify(toolExecutionResult.result, null, 2)}
              </Markdown>
            </Box>
          )}
          {/* Status line */}
          <Box flexDirection="row">
            <Text
              dimColor
              color={statusColor}
            >{`└─ ${getAssignTaskStatusText(toolExecutionResult, subAgentState.metrics)}`}</Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};
