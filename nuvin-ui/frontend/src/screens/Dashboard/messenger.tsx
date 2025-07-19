import { useCallback, useRef, useState } from 'react';
import { useAgentManager } from '@/hooks';
import { generateUUID } from '@/lib/utils';
import { useConversationStore } from '@/store';
import type { Message } from '@/types';

import { ChatInput, MessageList } from '../../modules/messenger';
import { SUMMARY_TRIGGER_COUNT } from '@/const';

export default function Messenger() {
  const { activeAgent, activeProvider, isReady, agentType, sendMessage } =
    useAgentManager();

  // Use conversation store
  const {
    activeConversationId,
    addMessage,
    updateMessage,
    getActiveMessages,
    updateConversation,
    getConversationMessages,
    getActiveConversation,
  } = useConversationStore();

  // State for loading status
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // State for streaming message
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');

  // Get current conversation messages
  const storeMessages = getActiveMessages();

  // Helper to summarize conversation using the active agent
  const summarizeConversation = useCallback(
    async (conversationId: string) => {
      const messages = getConversationMessages(conversationId);
      if (messages.length < SUMMARY_TRIGGER_COUNT || messages.length % SUMMARY_TRIGGER_COUNT !== 0) return;

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
    ? storeMessages.map(msg =>
      msg.id === streamingMessageId
        ? { ...msg, content: streamingContent }
        : msg
    )
    : storeMessages;

  // Handlers
  const handleSendMessage = useCallback(async (content: string) => {
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

    if (activeConversationId) {
      addMessage(activeConversationId, initialAssistantMessage);
    }

    try {
      // Capture current conversation ID so callbacks continue updating
      // the correct conversation even if the user switches views
      const conversationId = activeConversationId?.toString() || 'default';

      // Send message using AgentManager with streaming
      const response = await sendMessage(content, {
        conversationId: conversationId,
        stream: true,
        onChunk: (chunk: string) => {
          // Update local streaming content as chunks arrive
          setStreamingContent(prev => prev + chunk);
        },
        onComplete: (finalContent: string) => {
          // Final update when streaming is complete
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

      // Log metadata for debugging
      if (response.metadata) {
        console.log('Response metadata:', {
          model: response.metadata.model,
          provider: response.metadata.provider,
          agentType: response.metadata.agentType,
          responseTime: response.metadata.responseTime,
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);

      // Replace streaming message with error message
      if (conversationId && streamingId) {
        const errorMessage: Message = {
          id: streamingId,
          role: 'assistant',
          content: `❌ Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'
            }. ${!activeAgent
              ? 'No agent selected.'
              : !activeProvider && agentType === 'local'
                ? 'No provider configured for local agent.'
                : activeAgent.agentType === 'remote' && !activeAgent.url
                  ? 'No URL configured for remote agent.'
                  : 'Please check your configuration and try again.'
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
  }, [addMessage, activeConversationId, agentType, activeProvider, sendMessage]);

  const handleStopGeneration = useCallback(() => {
    if (isLoading) {
      // Clear any timeout references
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
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

      // TODO: Implement request cancellation in AgentManager
      // For now, we can only stop the UI state, but the underlying request may continue
      console.warn(
        'Note: Underlying agent request may still be processing. Request cancellation will be implemented in a future update.',
      );
    }
  }, [addMessage, activeConversationId, agentType, activeProvider, sendMessage]);

  return (
    <div className="flex-1 flex flex-col bg-gray-100 min-w-[300px]">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        streamingMessageId={streamingMessageId}
      />

      {/* Agent Status Bar */}
      <div className="border-t border-border bg-card px-6 py-2">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/10 transition-all duration-200 hover:bg-muted/20">
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 ${isReady
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
          </div>
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
    </div>
  );
}
