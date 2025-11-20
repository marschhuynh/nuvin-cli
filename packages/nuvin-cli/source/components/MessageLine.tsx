import React from 'react';
import { Box, Text } from 'ink';
import { Markdown } from './Markdown.js';
import type { ToolCall } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { ToolCallViewer } from './ToolCallViewer/index.js';
import { SubAgentActivity } from './SubAgentActivity.js';
import type { SubAgentState } from '@/utils/eventProcessor.js';
// import { useStreamingMarkdown } from '@/hooks/index.js';

type MessageLineProps = {
  key: string;
  message: MessageLineType;
  isSelected?: boolean;
  isExpanded?: boolean;
  onToggleExpansion?: (id: string) => void;
  backgroundColor?: string;
};

const MessageLineComponent: React.FC<MessageLineProps> = ({ message, backgroundColor }) => {
  const { theme } = useTheme();
  const isStreaming = message.metadata?.isStreaming === true;
  // const streamingContent = useStreamingMarkdown(message.content, isStreaming);
  const streamingContent = message.content;

  const renderMessage = () => {
    switch (message.type) {
      case 'user':
        return (
          <Box flexDirection="row" marginY={1}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.colors.accent} bold>
                ❯
              </Text>
            </Box>
            <Box flexDirection="column" flexGrow={1}>
              <Markdown enableCache={!isStreaming}>{streamingContent}</Markdown>
            </Box>
          </Box>
        );

      case 'assistant':
        return (
          <Box flexDirection="column" marginY={1}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.assistant} bold>
                ● [assistant]
              </Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} marginLeft={2} marginRight={2}>
              <Markdown enableCache={!isStreaming}>{streamingContent}</Markdown>
            </Box>
          </Box>
        );

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
          <Box flexDirection="row">
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
          <Box flexDirection="row">
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
          <Box flexDirection="row">
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
          <Box flexDirection="row">
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.system} bold>
                ●
              </Text>
            </Box>
            <Text>{message.content}</Text>
          </Box>
        );

      case 'thinking':
        return (
          <Box flexDirection="row">
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.thinking} bold>
                ●
              </Text>
            </Box>
            <Text color={theme.colors.textDim} dimColor>
              {message.content}
            </Text>
          </Box>
        );

      default:
        return <Text color={message.color}>{message.content}</Text>;
    }
  };

  return <Box backgroundColor={backgroundColor}>{renderMessage()}</Box>;
};

export const MessageLine = React.memo(MessageLineComponent);
