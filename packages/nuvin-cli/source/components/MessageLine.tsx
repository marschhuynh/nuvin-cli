import React from 'react';
import { Box, Text } from 'ink';
import { Markdown } from './Markdown';
import type { ToolCall } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { SubAgentState } from '@/utils/eventProcessor.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions';
import { ToolCallViewer } from './ToolCallViewer';
import { SubAgentActivity } from './ToolResultView/SubAgentActivity.js';
import { AutoScrollBox } from './AutoScrollBox';
import { useAltMode } from '@/contexts/AltModeContext';

type MessageLineProps = {
  key: string;
  message: MessageLineType;
  isSelected?: boolean;
  isExpanded?: boolean;
  onToggleExpansion?: (id: string) => void;
  backgroundColor?: string;
  liveMessage?: boolean;
};

const MessageLineComponent: React.FC<MessageLineProps> = ({ message, backgroundColor, liveMessage = false }) => {
  const { rows } = useStdoutDimensions();
  const { altMode } = useAltMode();
  const { theme } = useTheme();
  const isStreaming = message.metadata?.isStreaming === true;
  const streamingContent = message.content;

  const renderMessage = () => {
    switch (message.type) {
      case 'user':
        return (
          <Box flexDirection="column" marginY={1}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.user} bold>
                ❯ [you]
              </Text>
            </Box>
            <Box marginX={2}>
              <Markdown reflowText>{streamingContent}</Markdown>
            </Box>
          </Box>
        );

      case 'assistant': {
        if (isStreaming && !altMode) {
          return (
            <Box flexDirection="column" marginY={1} width={'100%'} maxHeight={rows - 10}>
              <Box flexShrink={0} marginRight={1} position="sticky" top={0}>
                <Text color={theme.messageTypes.assistant} bold>
                  ● [assistant]
                </Text>
              </Box>
              <AutoScrollBox maxHeight={'100%'} marginX={2} width={'100%'}>
                <Markdown enableCache>{streamingContent}</Markdown>
              </AutoScrollBox>
            </Box>
          );
        }

        return (
          <Box flexDirection="column" marginY={1}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.assistant} bold>
                ● [assistant]
              </Text>
            </Box>
            <Box marginX={2}>
              <Markdown enableCache>{streamingContent}</Markdown>
            </Box>
          </Box>
        );
      }

      case 'tool': {
        const toolCalls = (message.metadata?.toolCalls ?? []) as ToolCall[];
        const toolResultsByCallId = message.metadata?.toolResultsByCallId as Map<string, MessageLineType> | undefined;

        return (
          <Box flexDirection="column">
            {toolCalls.length > 0 ? (
              toolCalls.map((toolCall: ToolCall, callIndex: number) => {
                // Get the result for this tool call (if available)
                const toolResultMsg = toolResultsByCallId?.get(toolCall.id);

                // Check if this is an assign_task with sub-agent state
                if (toolCall.function.name === 'assign_task') {
                  // Look for sub-agent state using the dynamic key pattern
                  const subAgentState = message.metadata?.[`subAgentState_${toolCall.id}`] as SubAgentState | undefined;

                  if (subAgentState) {
                    return (
                      <SubAgentActivity
                        key={toolCall.id || `${message.id}-tool-${callIndex}`}
                        toolCall={toolCall}
                        subAgentState={subAgentState}
                        toolResult={toolResultMsg}
                        messageId={message.id}
                      />
                    );
                  }
                }

                return (
                  <Box key={toolCall.id || `${message.id}-tool-${callIndex}`} marginY={1}>
                    <ToolCallViewer
                      key={toolCall.id || `${message.id}-tool-${callIndex}`}
                      toolCall={toolCall}
                      toolResult={toolResultMsg}
                      messageId={message.id}
                    />
                  </Box>
                );
              })
            ) : (
              <Box flexDirection="row" marginY={1}>
                <Box flexShrink={0} marginRight={1}>
                  <Text color={theme.messageTypes.tool} bold>
                    »
                  </Text>
                </Box>
                <Text>{message.content}</Text>
              </Box>
            )}
          </Box>
        );
      }

      case 'tool_result': {
        return null; // Tool results are rendered inline with their tool calls
      }

      case 'error':
        return (
          <Box flexDirection="row" marginTop={1}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.error} bold>
                ●
              </Text>
            </Box>
            <Text>{message.content}</Text>
          </Box>
        );

      case 'warning':
        return (
          <Box flexDirection="row" marginTop={1}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.warning} bold>
                ●
              </Text>
            </Box>
            <Text>{message.content}</Text>
          </Box>
        );

      case 'info':
        return (
          <Box flexDirection="row" marginTop={1}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={message.color || theme.messageTypes.info} bold>
                ●
              </Text>
            </Box>
            <Text color={message.color}>{message.content}</Text>
          </Box>
        );

      case 'system':
        return (
          <Box flexDirection="row" marginTop={1}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.system} bold>
                ●
              </Text>
            </Box>
            <Text>{message.content}</Text>
          </Box>
        );

      case 'thinking': {
        if (isStreaming && !altMode) {
          return (
            <Box flexDirection="column" marginY={1} width={'100%'} maxHeight={Math.min(rows - 10, 15)}>
              <Box flexShrink={0} marginRight={1} position="sticky" top={0}>
                <Text color={theme.messageTypes.thinking} bold>
                  ● [thinking]
                </Text>
              </Box>
              <AutoScrollBox maxHeight={'100%'} marginX={2} width={'100%'}>
                <Text color={theme.colors.textDim} dimColor>
                  {streamingContent}
                </Text>
              </AutoScrollBox>
            </Box>
          );
        }

        return (
          <Box flexDirection="column" marginY={1}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.thinking} bold>
                ● [thinking]
              </Text>
            </Box>
            <Box marginX={2}>
              <Text color={theme.colors.textDim} dimColor>
                {streamingContent}
              </Text>
            </Box>
          </Box>
        );
      }

      default:
        return <Text color={message.color}>{message.content}</Text>;
    }
  };

  return (
    <Box
      width="100%"
      backgroundColor={backgroundColor}
      {...(liveMessage
        ? {
            borderStyle: 'single',
            borderColor: theme.colors.accent,
            borderBottom: false,
            borderTop: false,
            borderLeft: false,
          }
        : {})}
    >
      {renderMessage()}
    </Box>
  );
};

export const MessageLine = React.memo(MessageLineComponent, (prevProps, nextProps) => {
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.message.metadata?.isStreaming !== nextProps.message.metadata?.isStreaming) return false;
  if (prevProps.backgroundColor !== nextProps.backgroundColor) return false;
  if (prevProps.liveMessage !== nextProps.liveMessage) return false;
  if (prevProps.message.metadata !== nextProps.message.metadata) return false;
  return true;
});
