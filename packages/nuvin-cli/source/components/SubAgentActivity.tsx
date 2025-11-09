import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { ToolResultView } from './ToolResultView/ToolResultView.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { ToolTimer } from './ToolTimer.js';

export type SubAgentState = {
  agentId: string;
  agentName: string;
  status: 'starting' | 'running' | 'completed';
  toolCalls: Array<{
    id: string;
    name: string;
    arguments?: string;
    durationMs?: number;
    status?: 'success' | 'error';
  }>;
  resultMessage?: string;
  totalDurationMs?: number;
  finalStatus?: 'success' | 'error' | 'timeout';
};

type SubAgentActivityProps = {
  toolCall: ToolCall;
  subAgentState: SubAgentState;
  toolResult?: MessageLineType;
  messageId: string;
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
  const [cols] = useStdoutDimensions();
  const { theme } = useTheme();

  // Parse arguments to display
  const args =
    typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

  const agentParam = args.agent || 'unknown';
  const taskParam = args.task || '';

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
      {/* Header: [Agent Name] with timer */}
      <Box flexDirection="row">
        <Box flexShrink={0} marginRight={1}>
          <Text color={theme.messageTypes.tool} bold>
            »
          </Text>
        </Box>
        <Text>{formatAgentName(agentParam)}</Text>
        {/* <Box marginLeft={1}>
          <ToolTimer hasResult={isCompleted} finalDuration={subAgentState.totalDurationMs} />
        </Box> */}
      </Box>

      {/* Parameters: agent and task */}
      <Box flexDirection="column" marginLeft={2}>
        <Box
          borderStyle="single"
          borderDimColor
          borderColor={statusColor}
          borderBottom={false}
          borderRight={false}
          borderTop={false}
          paddingLeft={2}
        >
          {taskParam ? (
            <Text dimColor>task: "{taskParam.length > 60 ? `${taskParam.slice(0, cols - 15)}...` : taskParam}"</Text>
          ) : null}
        </Box>
        {/* Tool calls list */}
        <Box flexDirection="row">
          <Text dimColor color={statusColor}>
            ├─{' '}
          </Text>
          <Text>Activities</Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="single"
          borderDimColor
          borderColor={statusColor}
          borderBottom={false}
          borderRight={false}
          borderTop={false}
          paddingLeft={2}
        >
          {subAgentState.toolCalls.map((toolCall) => {
            // Parse arguments if available
            let argsDisplay = '';
            if (toolCall.arguments) {
              try {
                const args =
                  typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments;

                // Prefer description if available
                let relevantValue: string | undefined;

                if (args.description) {
                  relevantValue = args.description;
                }
                // For bash/shell tools, show the command
                else if (args.command) {
                  relevantValue = args.command;
                }
                // For file operations, show the path
                else if (args.path || args.file_path) {
                  relevantValue = args.path || args.file_path;
                }
                // For search/grep, show the pattern
                else if (args.pattern) {
                  relevantValue = `pattern: ${args.pattern}`;
                }
                // For other tools, show the first meaningful string parameter
                else {
                  const keys = Object.keys(args);
                  for (const key of keys) {
                    if (typeof args[key] === 'string' && args[key].length > 0 && key !== 'type') {
                      relevantValue = args[key];
                      break;
                    }
                  }
                }

                if (relevantValue) {
                  const maxLen = Math.max(40, cols - 25);
                  const truncated =
                    relevantValue.length > maxLen ? `${relevantValue.slice(0, maxLen)}...` : relevantValue;
                  argsDisplay = ` "${truncated}"`;
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
              <Box key={toolCall.id} flexDirection="row">
                {statusIcon ? <Text color={statusIconColor}>{statusIcon}</Text> : null}
                <Text dimColor>
                  {toolCall.name}
                  {argsDisplay}
                  {toolCall.durationMs !== undefined ? ` (${toolCall.durationMs}ms)` : ''}
                </Text>
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
          <Text>Working ...</Text>
          <Box marginLeft={1}>
            <ToolTimer hasResult={isCompleted} finalDuration={subAgentState.totalDurationMs} />
          </Box>
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
          />
        </Box>
      ) : null}
    </Box>
  );
};
