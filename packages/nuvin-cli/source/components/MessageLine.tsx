import type React from 'react';
import { useCallback } from 'react';
import { Box, Text } from 'ink';
import type { ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { SubAgentState } from '@/utils/eventProcessor.js';
import { useAltMode } from '@/contexts/AltModeContext';
import { useToolApproval } from '@/contexts/ToolApprovalContext';
import { ToolCallViewer } from './ToolCallViewer';
import { AutoScrollBox } from './AutoScrollBox.js';
import { SubAgentActivity } from './ToolCallViewer/ToolResultView';
import { computeToolState } from './ToolCallViewer/computeToolState.js';
import { Markdown } from './Markdown';
import { MessageActionBar, type MessageAction } from './MessageActionBar.js';
import { extractMessageContent } from '../utils/extractMessageContent.js';
import { copyTextToClipboard } from '../utils/copyText.js';
import { eventBus } from '../services/EventBus.js';

type MessageLineProps = {
  key: string;
  message: MessageLineType;
  isSelected?: boolean;
  isExpanded?: boolean;
  onToggleExpansion?: (id: string) => void;
  backgroundColor?: string;
  liveMessage?: boolean;
  noBottomMargin?: boolean;
};

const BlockMessage = ({ content, backgroundColor, textColor }: { content: string; backgroundColor: string; textColor: string }) => {
  return (
    <Box
      flexDirection="row"
      marginTop={1}
      flexShrink={0}
      backgroundColor={backgroundColor}
      width={'100%'}
    >
      <Box width={1} marginRight={2}><Text color={textColor}>▍</Text></Box>
      <Text color={textColor}>{content}</Text>
    </Box>
  )
}

const MessageLineComponent: React.FC<MessageLineProps> = ({ message, backgroundColor, liveMessage = false, isSelected = false }) => {
  const { altMode } = useAltMode();
  const { theme } = useTheme();
  const isStreaming = message.metadata?.isStreaming === true;
  const streamingContent = message.content;
  const { pendingApprovalTools } = useToolApproval();

  const handleAction = useCallback(async (action: MessageAction): Promise<boolean> => {
    if (action === 'copy') {
      const content = extractMessageContent(message);
      return await copyTextToClipboard(content);
    } else if (action === 'edit') {
      eventBus.emit('ui:input:edit', { content: message.content });
    } else if (action === 'retry') {
      eventBus.emit('ui:input:retry', { content: '' });
    }
    return true;
  }, [message]);

  const renderMessage = () => {
    switch (message.type) {
      case 'user':
        return (
          <Box flexDirection="column" flexShrink={0}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.user} bold>
                ❯ [you]
              </Text>
            </Box>
            <Box marginX={2}>
              <Text>{streamingContent}</Text>
            </Box>
          </Box>
        );

      case 'assistant': {
        if (isStreaming && !altMode) {
          return (
            <Box flexDirection="column" maxHeight={'100%'} width={'100%'} flexShrink={0}>
              <Box flexShrink={0} marginRight={1} position="sticky" top={0}>
                <Text color={theme.messageTypes.assistant} bold>
                  ● [assistant]
                </Text>
              </Box>
              <AutoScrollBox maxHeight={'100%'} marginX={2} width={'100%'}>
                <Markdown reflowText enableCache>
                  {streamingContent}
                </Markdown>
              </AutoScrollBox>
            </Box>
          );
        }

        return (
          <Box flexDirection="column" flexShrink={0}>
            <Box flexShrink={0} marginRight={1}>
              <Text color={theme.messageTypes.assistant} bold>
                ● [assistant]
              </Text>
            </Box>
            <Box marginX={2}>
              <Markdown reflowText enableCache>
                {streamingContent}
              </Markdown>
            </Box>
          </Box>
        );
      }

      case 'tool': {
        const toolCalls = (message.metadata?.toolCalls ?? []) as ToolCall[];
        const toolResultsByCallId = message.metadata?.toolResultsByCallId as Map<string, MessageLineType> | undefined;

        // Check if any tool call is still running (no result yet)
        const hasRunningToolCall = toolCalls.some((toolCall) => !toolResultsByCallId?.has(toolCall.id));

        // Sort: completed tool calls first, running ones last
        const sortedToolCalls = hasRunningToolCall
          ? [
              ...toolCalls.filter((tc) => toolResultsByCallId?.has(tc.id)),
              ...toolCalls.filter((tc) => !toolResultsByCallId?.has(tc.id)),
            ]
          : toolCalls;

        const _render = (
          <Box flexDirection="column" flexShrink={0}>
            {sortedToolCalls.length > 0 ? (
              sortedToolCalls.map((toolCall: ToolCall, callIndex: number) => {
                const isAwaitingApproval = pendingApprovalTools.some((tc) => tc.id === toolCall.id);

                if (isAwaitingApproval) {
                  return null;
                }
                // Get the result for this tool call (if available)
                const toolResultMsg = toolResultsByCallId?.get(toolCall.id);
                const streamingOutputKey = `streamingOutput_${toolCall.id}` as `streamingOutput_${string}`;
                const streamingTotalLinesKey = `streamingTotalLines_${toolCall.id}` as `streamingTotalLines_${string}`;
                const streamingOutput = message.metadata?.[streamingOutputKey] as string | undefined;
                const streamingTotalLines = message.metadata?.[streamingTotalLinesKey] as number | undefined;

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
                  <Box key={toolCall.id || `${message.id}-tool-${callIndex}`}>
                    <ToolCallViewer
                      key={toolCall.id || `${message.id}-tool-${callIndex}`}
                      toolCall={toolCall}
                      toolResult={toolResultMsg}
                      toolState={computeToolState(
                        toolResultMsg?.metadata?.toolResult as ToolExecutionResult | undefined,
                      )}
                      messageId={message.id}
                      streamingOutput={streamingOutput}
                      streamingTotalLines={streamingTotalLines}
                    />
                  </Box>
                );
              })
            ) : (
              <Box flexDirection="row">
                <Box flexShrink={0} marginRight={1}>
                  <Text color={theme.messageTypes.tool} bold>
                    ⚙︎
                  </Text>
                </Box>
                <Text>{message.content}</Text>
              </Box>
            )}
          </Box>
        );

        if (hasRunningToolCall) {
          return (
            <Box flexDirection="column" maxHeight="100%" flexShrink={0} width="100%">
              <AutoScrollBox mousePriority={100} showScrollbar maxHeight="100%">
                {_render}
              </AutoScrollBox>
            </Box>
          );
        }

        return _render;
      }

      case 'tool_result': {
        return undefined; // Tool results are rendered inline with their tool calls
      }

      case 'error':
        return (
          <BlockMessage
            content={message.content}
            backgroundColor={theme.tokens.dim}
            textColor={theme.messageTypes.error}
          />
        );

      case 'warning':
        return (
          <BlockMessage
            content={message.content}
            backgroundColor={theme.tokens.dim}
            textColor={theme.messageTypes.warning}
          />
        );
      case 'info':
        return (
          <BlockMessage
            content={message.content}
            backgroundColor={theme.tokens.dim}
            textColor={theme.messageTypes.info}
          />
        );

      case 'system':
        return (
          <BlockMessage
            content={message.content}
            backgroundColor={theme.tokens.dim}
            textColor={theme.messageTypes.system}
          />
        );

      case 'thinking': {
        if (isStreaming && !altMode) {
          return (
            <Box flexDirection="column" maxHeight="100%" width={'100%'} flexShrink={0}>
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
          <Box flexDirection="column" flexShrink={0} maxHeight="100%">
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

  const content = renderMessage();

  if (content) {
    return (
      <Box
        width="100%"
        flexShrink={0}
        flexDirection="column"
        position="relative"
        backgroundColor={backgroundColor}
        marginBottom={1}
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
        {content}
        {isSelected && !altMode && (
          <Box position="absolute" top={0} right={0}>
            <MessageActionBar messageType={message.type} onAction={handleAction} />
          </Box>
        )}
      </Box>
    );
  }
};

export const MessageLine = MessageLineComponent;
