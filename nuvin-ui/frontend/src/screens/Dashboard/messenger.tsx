import { useCallback, useRef, useState, useEffect } from 'react';
import { useAgentManager } from '@/hooks';
import { generateUUID, formatErrorMessage } from '@/lib/utils';
import { useConversationStore } from '@/store';
import type { Message } from '@/types';
import { SUMMARY_TRIGGER_COUNT } from '@/const';
import { MessageListPaginated } from '@/modules/messenger/MessageListPaginated';
import { NoConversationsView } from '@/modules/messenger/NoConversationsView';

import { ChatInput } from '../../modules/messenger';

export default function Messenger() {
  const { activeAgent, isReady, sendMessage, cancelRequest } = useAgentManager();

  const {
    conversations,
    activeConversationId,
    addMessage,
    updateMessage,
    getActiveMessages,
    updateConversation,
    getConversationMessages,
    getActiveConversation,
    addConversation,
  } = useConversationStore();

  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [streamingStates, setStreamingStates] = useState<Record<string, { messageId: string; content: string }>>({});

  const storeMessages = getActiveMessages();

  const currentStreamingState = activeConversationId ? streamingStates[activeConversationId] : undefined;
  const streamingMessageId = currentStreamingState?.messageId || null;
  const streamingContent = currentStreamingState?.content || '';

  useEffect(() => {
    if (!streamingMessageId) {
      setIsLoading(false);
    }
  }, [streamingMessageId]);

  const summarizeConversation = useCallback(
    async (conversationId: string) => {
      const messages = getConversationMessages(conversationId);
      if (messages.length < SUMMARY_TRIGGER_COUNT || messages.length % SUMMARY_TRIGGER_COUNT !== 0) return;

      const conversation = getActiveConversation();
      if (!conversation) return;

      const convoText = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

      try {
        // Use a separate conversation ID to prevent summary from being added to main conversation
        const summaryConversationId = `summary-${conversationId}`;
        const resp = await sendMessage(
          `Provide a very brief 7-10 word summary of this conversation for user:\n${convoText}`,
          { conversationId: summaryConversationId },
        );
        console.log('Summary response:', resp.content.trim());

        // Only update the conversation summary, don't add the summary as a message
        updateConversation({ ...conversation, summary: resp.content.trim() });

        // Clean up the summary conversation messages after use
        // This ensures summary messages never appear in any conversation view
      } catch (err) {
        console.error('Failed to summarize conversation:', err);
      }
    },
    [getConversationMessages, getActiveConversation, sendMessage, updateConversation],
  );

  // Create combined messages with streaming content
  const messages = streamingMessageId
    ? [
        ...storeMessages.filter((msg) => msg.id !== streamingMessageId), // Remove any stored message with same ID
        {
          id: streamingMessageId,
          role: 'assistant' as const,
          content: streamingContent,
          timestamp: new Date().toISOString(),
          isStreaming: true,
        },
      ]
    : storeMessages;

  // Handlers
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!isReady) {
        console.warn('Agent not ready. Please select an agent and provider.');
        return;
      }

      // Create a new conversation if there isn't an active one
      let conversationId = activeConversationId;
      if (!conversationId) {
        const newConversation = {
          id: generateUUID(),
          title: content.length > 50 ? `${content.substring(0, 50)}...` : content,
          timestamp: new Date().toISOString(),
          summary: content,
          active: true,
        };
        addConversation(newConversation);
        conversationId = newConversation.id;
      }

      const newMessage: Message = {
        id: generateUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };

      // Add message to the conversation
      addMessage(conversationId, newMessage);
      setIsLoading(true);

      // Create streaming assistant message ID but don't add it yet
      const streamingId = generateUUID();
      setStreamingStates((prev) => ({
        ...prev,
        [conversationId]: { messageId: streamingId, content: '' },
      }));

      // Track if error message was already added to prevent duplicates
      let errorMessageAdded = false;

      const addErrorMessage = (error: any) => {
        if (errorMessageAdded) {
          console.log('Error message already added, skipping duplicate');
          return;
        }

        errorMessageAdded = true;

        const errorMessage: Message = {
          id: streamingId,
          role: 'assistant',
          content: `❌ ${formatErrorMessage(error instanceof Error ? error : String(error))}`,
          timestamp: new Date().toISOString(),
        };

        // Use addMessage to ensure the error message is added to the store
        addMessage(conversationId, errorMessage);

        // Clear streaming state for this conversation
        setStreamingStates((prev) => {
          const newState = { ...prev };
          delete newState[conversationId];
          return newState;
        });

        setIsLoading(false);
      };

      try {
        // Send message using AgentManager with streaming
        const response = await sendMessage(content, {
          conversationId: conversationId,
          stream: true,
          onChunk: (chunk: string) => {
            // Update streaming content for this specific conversation
            setStreamingStates((prev) => ({
              ...prev,
              [conversationId]: {
                messageId: streamingId,
                content: (prev[conversationId]?.content || '') + chunk,
              },
            }));
          },
          onAdditionalMessage: (message) => {
            // Handle additional messages from tool execution flow
            const newMessage: Message = {
              id: message.id,
              role: message.role,
              content: message.content,
              timestamp: message.timestamp,
              metadata: message.metadata,
              toolCall: message.toolCall,
            };
            // If a message with this id already exists, update it; otherwise add it
            const existing = getConversationMessages(conversationId).some((m) => m.id === newMessage.id);
            if (existing) {
              updateMessage(conversationId, newMessage);
            } else {
              addMessage(conversationId, newMessage);
            }
          },
          onComplete: (finalContent: string) => {
            // Streaming is complete - add the final message to store and clear streaming state
            // Get the accumulated content for this conversation
            const accumulatedContent = streamingStates[conversationId]?.content || '';
            const contentToUse = finalContent || accumulatedContent;

            // Add the final assistant message to the store
            if (contentToUse) {
              const finalAssistantMessage: Message = {
                id: streamingId,
                role: 'assistant',
                content: contentToUse,
                timestamp: new Date().toISOString(),
                // Metadata will be updated when sendMessage Promise resolves
              };
              addMessage(conversationId, finalAssistantMessage);
            }

            // Clear streaming state after adding the final message
            setTimeout(() => {
              setStreamingStates((prev) => {
                const newState = { ...prev };
                delete newState[conversationId];
                return newState;
              });
            }, 50);

            // Trigger background summarization
            summarizeConversation(conversationId);
          },
          onError: (error) => {
            console.error('Message sending failed (onError callback):', error);
            addErrorMessage(error);
          },
        });

        // Log metadata for debugging and update agent metrics
        if (response.metadata) {
          // Update the message with metadata after streaming is complete
          // Get the current message to preserve content
          const currentMessages = getConversationMessages(conversationId);
          const currentMessage = currentMessages.find((m) => m.id === streamingId);

          if (currentMessage) {
            const messageWithMetadata: Message = {
              ...currentMessage,
              metadata: {
                model: response.metadata.model,
                provider: response.metadata.provider,
                agentType: response.metadata.agentType,
                agentId: response.metadata.agentId,
                tokensUsed: response.metadata.totalTokens,
                promptTokens: response.metadata.promptTokens,
                completionTokens: response.metadata.completionTokens,
                totalTokens: response.metadata.totalTokens,
                estimatedCost: response.metadata.estimatedCost,
                responseTime: response.metadata.responseTime,
                taskId: response.metadata.taskId,
                toolCalls: response.metadata.toolCalls,
                providerMetadata: response.metadata,
              },
            };
            updateMessage(conversationId, messageWithMetadata);
          }

          // Update agent metrics if we have an active agent
          if (activeAgent) {
            import('@/lib/agents/agent-manager').then(({ AgentManager }) => {
              const agentManager = AgentManager.getInstance();
              agentManager.updateAgentMetrics(activeAgent.id, response.metadata);
            });
          }
        }
      } catch (error) {
        console.error('Failed to send message (catch block):', error);
        addErrorMessage(error);
      } finally {
        // Ensure loading is always reset if no error message was added
        if (!errorMessageAdded) {
          setIsLoading(false);
        }
        timeoutRef.current = null;
      }
    },
    [
      addMessage,
      activeConversationId,
      sendMessage,
      activeAgent,
      getConversationMessages,
      isReady,
      streamingStates,
      updateMessage,
      summarizeConversation,
      addConversation,
    ],
  );

  const handleStopGeneration = useCallback(async () => {
    if (isLoading) {
      // Clear any timeout references
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      try {
        // Attempt to cancel the underlying request
        const cancelled = await cancelRequest();
        console.log(
          cancelled
            ? 'Request cancelled successfully'
            : 'Could not cancel request (may not be supported for this agent type)',
        );
      } catch (error) {
        console.error('Error cancelling request:', error);
      }

      setIsLoading(false);

      // If there's a streaming message, replace it with stop message
      if (streamingMessageId && activeConversationId) {
        const stopMessage: Message = {
          id: streamingMessageId,
          role: 'assistant',
          content: '⏹️ Generation stopped by user.',
          timestamp: new Date().toISOString(),
        };
        updateMessage(activeConversationId, stopMessage);
      } else if (activeConversationId) {
        // Otherwise add a new stop message
        const stopMessage: Message = {
          id: generateUUID(),
          role: 'assistant',
          content: '⏹️ Generation stopped by user.',
          timestamp: new Date().toISOString(),
        };
        addMessage(activeConversationId, stopMessage);
      }

      // Clear streaming state for the current conversation
      if (activeConversationId) {
        setStreamingStates((prev) => {
          const newState = { ...prev };
          delete newState[activeConversationId];
          return newState;
        });
      }

      console.log('Generation stopped by user');
    }
  }, [addMessage, activeConversationId, cancelRequest, isLoading, streamingMessageId, updateMessage]);

  // Handler to create a new conversation
  const handleNewConversation = useCallback(() => {
    const newConversation = {
      id: generateUUID(),
      title: 'New Conversation',
      timestamp: new Date().toISOString(),
      summary: '',
      active: true,
    };
    addConversation(newConversation);
  }, [addConversation]);

  return (
    <div className="flex-1 flex flex-col bg-message-list-background min-w-[300px]">
      {!isReady ? (
        // Show setup guide when not ready
        <NoConversationsView newConversation={handleNewConversation} />
      ) : activeConversationId ? (
        // Show conversation when there's an active one
        <>
          <MessageListPaginated
            messages={messages}
            isLoading={isLoading}
            streamingMessageId={streamingMessageId}
            initialLoadCount={15}
            loadMoreCount={15}
            conversationId={activeConversationId ?? undefined}
          />
          <ChatInput
            onSendMessage={handleSendMessage}
            onStop={handleStopGeneration}
            disabled={isLoading || !isReady}
            placeholder="Type your message here..."
          />
        </>
      ) : (
        // Show centered chat input when ready but no active conversation
        <ChatInput
          onSendMessage={handleSendMessage}
          onStop={handleStopGeneration}
          disabled={isLoading || !isReady}
          placeholder="Type your message to start a new conversation..."
          showWithoutConversation={true}
          centered={true}
        />
      )}
    </div>
  );
}
