import type React from 'react';
import { Box, Text } from 'ink';
import { type ToolCall, type ToolExecutionResult, type SubAgentState, parseToolArguments } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters/index';
import { useTheme } from '@/contexts/ThemeContext';
import { ToolResultView } from './ToolResultView';
import { ToolTimer } from '../../ToolTimer';
import { GradientRunText } from '../../Gradient';
import { formatCost, formatTokens } from '@/utils/formatters';
import { getToolDisplayName } from '@/components/toolRegistry';

type SubAgentActivityProps = {
  toolCall: ToolCall;
  subAgentState: SubAgentState;
  toolResult?: MessageLineType;
  messageId: string;
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
  messageId,
}) => {
  const { theme } = useTheme();

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
      <Box flexDirection="column" marginLeft={2} width="100%">
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
        >
          {subAgentState.toolCalls.slice(-3).map((toolCall) => {
            let argsDisplay = '';

            if (toolCall.arguments) {
              try {
                const args = parseToolArguments(toolCall.arguments) as Record<string, unknown>;
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
            if (toolCall.status === 'success') {
              statusIcon = '✓ ';
              statusIconColor = theme.status.success;
            } else if (toolCall.status === 'error') {
              statusIcon = '✗ ';
              statusIconColor = theme.status.error;
            }

            return (
              <Box key={toolCall.id} width={'100%'} overflow="hidden" flexDirection="row" height={1}>
                {statusIcon ? <Text color={statusIconColor}>{statusIcon}</Text> : null}
                <Box flexWrap="nowrap" width="100%" overflow="hidden">
                  <Text wrap="truncate-middle" dimColor>
                    <Text dimColor={false}>{getToolDisplayName(toolCall.name)}</Text>
                    <Text dimColor wrap="truncate-middle">
                      {argsDisplay}
                    </Text>
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

      {/* Tool Result (when available) - handled by ToolResultView with assign_task special case */}
      {isCompleted && toolExecutionResult && toolResult ? (
        <Box marginBottom={1}>
          <ToolResultView
            toolResult={toolExecutionResult}
            toolCall={toolCall}
            messageId={`${messageId}-result-${toolCall.id}`}
            messageContent={toolResult.content || ''}
            fullMode={false}
            subAgentMetrics={subAgentState.metrics}
          />
        </Box>
      ) : null}
    </Box>
  );
};
