import { useCallback, useRef, useState, useEffect } from 'react';
import { useAgentManager } from '@/hooks';
import { generateUUID } from '@/lib/utils';
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

  // State for streaming message
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [streamingContent, setStreamingContent] = useState<string>('');

  // Add agent manager instance for metrics with input/output breakdown
  const [conversationMetrics, setConversationMetrics] = useState<{
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
    messageCount: number;
  } | null>(null);

  // Update conversation metrics when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      const messages = getConversationMessages(activeConversationId);
      let totalTokens = 0;
      let promptTokens = 0;
      let completionTokens = 0;
      let totalCost = 0;
      let messageCount = 0;

      messages.forEach((message) => {
        if (message.role === 'assistant' && message.metadata) {
          const metadata = message.metadata;
          totalTokens += metadata.totalTokens || 0;
          promptTokens += metadata.promptTokens || 0;
          completionTokens += metadata.completionTokens || 0;
          totalCost += metadata.estimatedCost || 0;
          messageCount++;
        }
      });

      setConversationMetrics({
        totalTokens,
        promptTokens,
        completionTokens,
        totalCost,
        messageCount,
      });
    } else {
      setConversationMetrics(null);
    }
  }, [activeConversationId, getConversationMessages]);

  // Format numbers for display
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return '<$0.01';
    return '$' + cost.toFixed(2);
  };

  const formatTokens = (prompt: number, completion: number) => {
    const total = prompt + completion;
    return {
      prompt: formatNumber(prompt),
      completion: formatNumber(completion),
      total: formatNumber(total)
    };
  };

  // Get current conversation messages
  const storeMessages = getActiveMessages();

  // Helper to summarize conversation using the active agent
  const summarizeConversation = useCallback(
    async (conversationId: string) => {
      const messages = getConversationMessages(conversationId);
      if (
        messages.length < SUMMARY_TRIGGER_COUNT ||
        messages.length % SUMMARY_TRIGGER_COUNT !== 0
      )
        return;

      console.log('Summarizing conversation:', conversationId);

      const conversation = getActiveConversation();
      if (!conversation) return;

      const convoText = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      try {
        const resp = await sendMessage(
          `Provide a very brief 7-10 word summary of this conversation:\n${convoText}`,
          { conversationId: `summary-${conversationId}` },
        );
        console.log('Summary response:', resp.content.trim());
        updateConversation({ ...conversation, summary: resp.content.trim() });
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
    ? storeMessages.map((msg) =>
        msg.id === streamingMessageId
          ? { ...msg, content: streamingContent }
          : msg,
      )
    : storeMessages;

  // Handlers
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!isReady) {
        console.warn('Agent not ready. Please select an agent and provider.');
        return;
      }

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

      // Create streaming assistant message
      const streamingId = generateUUID();
      setStreamingMessageId(streamingId);
      setStreamingContent('');

      const initialAssistantMessage: Message = {
        id: streamingId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };

      // Capture current conversation ID so callbacks continue updating
      // the correct conversation even if the user switches views
      const conversationId = activeConversationId?.toString() || 'default';

      if (activeConversationId) {
        addMessage(activeConversationId, initialAssistantMessage);
      }

      try {
        // Send message using AgentManager with streaming
        const response = await sendMessage(content, {
          conversationId: conversationId,
          stream: true,
          onChunk: (chunk: string) => {
            // Update local streaming content as chunks arrive
            setStreamingContent((prev) => prev + chunk);
          },
          onComplete: (finalContent: string) => {
            // Final update when streaming is complete - metadata will be added after sendMessage resolves
            if (conversationId) {
              // Use finalContent if it's not empty, otherwise use accumulated streamingContent
              const contentToUse = finalContent || streamingContent;

              // Only update if we have content to show
              if (contentToUse) {
                const finalMessage: Message = {
                  id: streamingId,
                  role: 'assistant',
                  content: contentToUse,
                  timestamp: new Date().toISOString(),
                  // Metadata will be updated when sendMessage Promise resolves
                };
                updateMessage(conversationId, finalMessage);

                // Clear streaming state after updating the message
                setTimeout(() => {
                  setStreamingMessageId(null);
                  setStreamingContent('');
                }, 50);

                // Trigger background summarization
                summarizeConversation(conversationId);
              } else {
                // If no content, keep the streaming state to preserve what was shown
                console.warn('No content to finalize, keeping streaming state');
              }
            } else {
              // No active conversation, clear streaming state
              setStreamingMessageId(null);
              setStreamingContent('');
            }
          },
          onError: (error) => {
            console.error('Message sending failed:', error);
            // Replace streaming message with error message
            if (conversationId) {
              const errorMessage: Message = {
                id: streamingId,
                role: 'assistant',
                content: `❌ Error: ${error.message}. Please check your agent configuration and try again.`,
                timestamp: new Date().toISOString(),
              };
              updateMessage(conversationId, errorMessage);
            }
            setStreamingMessageId(null);
            setStreamingContent('');
            setIsLoading(false);
          },
        });

        // Log metadata for debugging and update agent metrics
        if (response.metadata) {
          console.log('Response metadata:', {
            model: response.metadata.model,
            provider: response.metadata.provider,
            agentType: response.metadata.agentType,
            responseTime: response.metadata.responseTime,
            totalTokens: response.metadata.totalTokens,
            estimatedCost: response.metadata.estimatedCost,
          });

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
            import('@/lib/agent-manager').then(({ AgentManager }) => {
              const agentManager = AgentManager.getInstance();
              agentManager.updateAgentMetrics(
                activeAgent.id,
                response.metadata,
              );
            });
          }
        }
      } catch (error) {
        console.error('Failed to send message:', error);

        // Replace streaming message with error message
        if (conversationId && streamingId) {
          const errorMessage: Message = {
            id: streamingId,
            role: 'assistant',
            content: `${
              error instanceof Error &&
              error.message === 'Request cancelled by user'
                ? '⏹️ Message cancelled. Feel free to try sending another message.'
                : `❌ Something went wrong sending your message. ${
                    !activeAgent
                      ? 'Please select an agent first.'
                      : !activeProvider && agentType === 'local'
                        ? 'Please configure a provider for your local agent.'
                        : activeAgent.agentType === 'remote' && !activeAgent.url
                          ? 'Please add a URL for your remote agent.'
                          : 'Please check your settings and try again.'
                  }`
            }`,
            timestamp: new Date().toISOString(),
          };
          updateMessage(conversationId, errorMessage);
        }
        setStreamingMessageId(null);
        setStreamingContent('');
      } finally {
        setIsLoading(false);
        timeoutRef.current = null;
      }
    },
    [addMessage, activeConversationId, agentType, activeProvider, sendMessage],
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

      // Clear streaming state
      setStreamingMessageId(null);
      setStreamingContent('');

      console.log('Generation stopped by user');
    }
  }, [
    addMessage,
    activeConversationId,
    agentType,
    activeProvider,
    sendMessage,
    cancelRequest,
    isLoading,
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
            initialLoadCount={7}
            loadMoreCount={7}
            conversationId={activeConversationId ?? undefined}
          />

          {/* Agent Status Bar */}
          <div className="border-t border-border bg-card px-6 py-2">
            <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    isReady
                      ? 'bg-green-500 shadow-sm shadow-green-500/30'
                      : 'bg-red-500 shadow-sm shadow-red-500/30'
                  }`}
                />
                <span className="text-xs font-medium text-muted-foreground transition-colors duration-200">
                  Agent: {activeAgent?.name || 'None'}
                </span>
                {isReady && (
                  <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-600 rounded-md transition-all duration-200">
                    Ready
                  </span>
                )}
              </div>
              
              {/* Conversation Metrics */}
              {conversationMetrics && activeConversationId && (
                <div className="flex items-center gap-2 text-xs">
                  {/* Token Breakdown */}
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md">
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 bg-orange-400 rounded-full"></div>
                      <span className="text-orange-600 font-medium">{formatNumber(conversationMetrics.promptTokens)}</span>
                    </div>
                    <span className="text-gray-400">→</span>
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                      <span className="text-blue-600 font-medium">{formatNumber(conversationMetrics.completionTokens)}</span>
                    </div>
                  </div>
                  
                  {/* Cost Display */}
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-md">
                    <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                    <span className="font-medium">{formatCost(conversationMetrics.totalCost)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

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
