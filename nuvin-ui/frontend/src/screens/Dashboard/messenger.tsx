import { useCallback, useRef, useState, useEffect } from 'react';
import { useAgentManager } from '@/hooks';
import { generateUUID, formatErrorMessage } from '@/lib/utils';
import { useConversationStore } from '@/store';
import type { Message } from '@/types';
import { Button } from '@/components/ui/button';
import { Plus, MessageCircle } from 'lucide-react';
import { SUMMARY_TRIGGER_COUNT } from '@/const';
import { MessageListPaginated } from '@/modules/messenger/MessageListPaginated';

import { ChatInput } from '../../modules/messenger';

export default function Messenger() {
  const {
    activeAgent,
    activeProvider,
    isReady,
    agentType,
    sendMessage,
    cancelRequest,
  } = useAgentManager();

  // Use conversation store
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

  // State for loading status
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // State for streaming message per conversation
  const [streamingStates, setStreamingStates] = useState<
    Record<string, { messageId: string; content: string }>
  >({});

  // Get current conversation messages
  const storeMessages = getActiveMessages();

  // Get current conversation's streaming state
  const currentStreamingState = activeConversationId
    ? streamingStates[activeConversationId]
    : undefined;
  const streamingMessageId = currentStreamingState?.messageId || null;
  const streamingContent = currentStreamingState?.content || '';

  useEffect(() => {
    if (!streamingMessageId) {
      setIsLoading(false);
    }
    // console.log('currentStreamingState:', currentStreamingState);
  }, [streamingMessageId]);

  // Helper to summarize conversation using the active agent
  const summarizeConversation = useCallback(
    async (conversationId: string) => {
      const messages = getConversationMessages(conversationId);
      if (
        messages.length < SUMMARY_TRIGGER_COUNT ||
        messages.length % SUMMARY_TRIGGER_COUNT !== 0
      )
        return;

      const conversation = getActiveConversation();
      if (!conversation) return;

      const convoText = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

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
    [
      getConversationMessages,
      getActiveConversation,
      sendMessage,
      updateConversation,
    ],
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

      // Capture current conversation ID at the beginning
      const conversationId = activeConversationId?.toString() || 'default';

      const newMessage: Message = {
        id: generateUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };

      // Add message to the active conversation
      if (activeConversationId) {
        addMessage(activeConversationId, newMessage);
      }
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

        if (conversationId) {
          const errorMessage: Message = {
            id: streamingId,
            role: 'assistant',
            content: `❌ ${formatErrorMessage(error instanceof Error ? error : String(error))}`,
            timestamp: new Date().toISOString(),
          };

          // Use addMessage to ensure the error message is added to the store
          addMessage(conversationId, errorMessage);
        }

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
            if (conversationId) {
              const newMessage: Message = {
                id: message.id,
                role: message.role,
                content: message.content,
                timestamp: message.timestamp,
                metadata: message.metadata,
                toolCall: message.toolCall,
              };
              addMessage(conversationId, newMessage);
            }
          },
          onComplete: (finalContent: string) => {
            // Streaming is complete - add the final message to store and clear streaming state
            if (conversationId) {
              // Get the accumulated content for this conversation
              const accumulatedContent =
                streamingStates[conversationId]?.content || '';
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
            } else {
              // No active conversation, clear streaming state for this conversation
              setStreamingStates((prev) => {
                const newState = { ...prev };
                delete newState[conversationId];
                return newState;
              });
            }
          },
          onError: (error) => {
            console.error('Message sending failed (onError callback):', error);
            addErrorMessage(error);
          },
        });

        // Log metadata for debugging and update agent metrics
        if (response.metadata) {
          // Update the message with metadata after streaming is complete
          if (conversationId && streamingId) {
            // Get the current message to preserve content
            const currentMessages = getConversationMessages(conversationId);
            const currentMessage = currentMessages.find(
              (m) => m.id === streamingId,
            );

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
          }

          // Update agent metrics if we have an active agent
          if (activeAgent) {
            import('@/lib/agents/agent-manager').then(({ AgentManager }) => {
              const agentManager = AgentManager.getInstance();
              agentManager.updateAgentMetrics(
                activeAgent.id,
                response.metadata,
              );
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
      agentType,
      activeProvider,
      sendMessage,
      activeAgent,
      getConversationMessages,
      isReady,
      streamingStates,
      updateMessage,
      summarizeConversation,
    ],
  );;;;

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
  }, [
    addMessage,
    activeConversationId,
    cancelRequest,
    isLoading,
    streamingMessageId,
    updateMessage,
  ]);

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

  // Check if there are no conversations
  const hasNoConversations = conversations.length === 0;

  // Instructional view component
  const NoConversationsView = () => (
    <div
      className="flex-1 flex flex-col items-center p-8 text-center"
      style={{ justifyContent: 'center', transform: 'translateY(-20%)' }}
    >
      <div
        className="max-w-lg mx-auto flex flex-col items-center"
        style={{ gap: '1.618rem' }}
      >
        <div
          className="bg-gray-100 rounded-full flex items-center justify-center"
          style={{
            width: '4.5rem',
            height: '4.5rem',
          }}
        >
          <MessageCircle
            className="text-gray-400"
            style={{
              width: '2.5rem',
              height: '2.5rem',
            }}
          />
        </div>
        <div style={{ gap: '1rem' }} className="flex flex-col">
          <h3
            className="font-semibold text-gray-900"
            style={{
              fontSize: '1.618rem',
              lineHeight: '2rem',
            }}
          >
            Welcome to Nuvin Space
          </h3>
          <p
            className="text-gray-600 max-w-sm"
            style={{
              fontSize: '1rem',
              lineHeight: '1.5rem',
              marginBottom: '0.5rem',
            }}
          >
            Start your first conversation with an AI agent. Click the button
            below to begin chatting.
          </p>
        </div>
        <div className="flex flex-col items-center" style={{ gap: '0.75rem' }}>
          <Button
            onClick={handleNewConversation}
            className="flex items-center gap-2 px-6 py-3"
            disabled={!isReady}
            style={{
              fontSize: '1rem',
              minWidth: '12.944rem',
            }}
          >
            <Plus className="w-4 h-4" />
            Start New Conversation
          </Button>
          {!isReady && (
            <p
              className="text-gray-500"
              style={{
                fontSize: '0.875rem',
                lineHeight: '1.25rem',
              }}
            >
              Configure an agent and provider in the sidebar to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-gray-100 min-w-[300px]">
      {hasNoConversations ? (
        <NoConversationsView />
      ) : (
        <>
          <MessageListPaginated
            messages={messages}
            isLoading={isLoading}
            streamingMessageId={streamingMessageId}
            initialLoadCount={15}
            loadMoreCount={15}
            conversationId={activeConversationId ?? undefined}
          />

          {/* <AgentStatusBar activeConversationId={activeConversationId} /> */}

          <ChatInput
            onSendMessage={handleSendMessage}
            onStop={handleStopGeneration}
            disabled={isLoading || !isReady}
            placeholder={
              !isReady
                ? 'Configure an agent and provider to start chatting...'
                : 'Type your message here...'
            }
          />
        </>
      )}
    </div>
  );
}
