import { useCallback, useRef, useState } from 'react';
import { ConversationHistory } from '@/components';
import { useAgentManager } from '@/hooks';
import { generateUUID } from '@/lib/utils';
import { createTimestamp } from '@/lib/timestamp';
import { useConversationStore } from '@/store';
import type { AgentConfig, Conversation, Message } from '@/types';

import { AgentConfiguration } from '../modules/agent/AgentConfiguration';
import { ChatInput, MessageList } from '../modules/messenger';

export default function Dashboard() {
  const { activeAgent, activeProvider, isReady, agentType, sendMessage } =
    useAgentManager();

  // Use conversation store
  const {
    conversations,
    activeConversationId,
    addConversation,
    setActiveConversation,
    addMessage,
    getActiveMessages,
    deleteConversation,
  } = useConversationStore();

  // Get current conversation messages
  const messages = getActiveMessages();

  // State for loading status
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handlers
  const handleSendMessage = async (content: string) => {
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

    try {
      // Get current active conversation ID
      const conversationId = activeConversationId?.toString() || 'default';

      // Send message using AgentManager
      const response = await sendMessage(content, {
        conversationId: conversationId,
        onError: (error) => {
          console.error('Message sending failed:', error);
          // Add error message to chat
          const errorMessage: Message = {
            id: generateUUID(),
            role: 'assistant',
            content: `❌ Error: ${error.message}. Please check your agent configuration and try again.`,
            timestamp: new Date().toISOString(),
          };
          if (activeConversationId) {
            addMessage(activeConversationId, errorMessage);
          }
          setIsLoading(false);
        },
      });

      // Add assistant response to messages
      const assistantMessage: Message = {
        id: generateUUID(),
        role: 'assistant',
        content: response.content,
        timestamp: response.timestamp,
      };

      if (activeConversationId) {
        addMessage(activeConversationId, assistantMessage);
      }

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

      // Add error message to chat
      const errorMessage: Message = {
        id: generateUUID(),
        role: 'assistant',
        content: `❌ Failed to send message: ${
          error instanceof Error ? error.message : 'Unknown error'
        }. ${
          !activeAgent
            ? 'No agent selected.'
            : !activeProvider && agentType === 'local'
              ? 'No provider configured for local agent.'
              : activeAgent.agentType === 'remote' && !activeAgent.url
                ? 'No URL configured for remote agent.'
                : 'Please check your configuration and try again.'
        }`,
        timestamp: new Date().toISOString(),
      };

      if (activeConversationId) {
        addMessage(activeConversationId, errorMessage);
      }
    } finally {
      setIsLoading(false);
      timeoutRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (isLoading) {
      // Clear any timeout references
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setIsLoading(false);

      // Add a system message indicating the generation was stopped
      const stopMessage: Message = {
        id: generateUUID(),
        role: 'assistant',
        content: '⏹️ Generation stopped by user.',
        timestamp: new Date().toISOString(),
      };

      if (activeConversationId) {
        addMessage(activeConversationId, stopMessage);
      }
      console.log('Generation stopped by user');

      // TODO: Implement request cancellation in AgentManager
      // For now, we can only stop the UI state, but the underlying request may continue
      console.warn(
        'Note: Underlying agent request may still be processing. Request cancellation will be implemented in a future update.',
      );
    }
  };

  const handleNewConversation = () => {
    // Stop any ongoing generation
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsLoading(false);
    }

    const newConversation: Conversation = {
      id: generateUUID(),
      title: 'New Conversation',
      timestamp: createTimestamp(),
      active: true,
    };

    // Add new conversation (automatically becomes active)
    addConversation(newConversation);
  };

  const handleConversationSelect = (conversationId: string) => {
    // Stop any ongoing generation when switching conversations
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsLoading(false);
    }

    // Set the selected conversation as active
    setActiveConversation(conversationId);
  };

  const handleConversationDelete = (conversationId: string) => {
    // If deleting the active conversation, clear loading state
    if (conversationId === activeConversationId) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsLoading(false);
    }
    deleteConversation(conversationId);
  };

  const handleAgentConfigChange = useCallback((config: AgentConfig) => {
    console.log('Agent config updated:', config);
    const selectedAgent = config.agents.find(
      (agent) => agent.id === config.selectedAgent,
    );
    console.log('Selected agent:', selectedAgent?.name);
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-80 border-r border-border bg-card">
        <ConversationHistory
          conversations={conversations}
          onNewConversation={handleNewConversation}
          onConversationSelect={handleConversationSelect}
          onConversationDelete={handleConversationDelete}
        />
      </div>

      <div className="flex-1 flex flex-col bg-gray-100 min-w-[300px]">
        <MessageList messages={messages} isLoading={isLoading} />

        {/* Agent Status Bar */}
        <div className="border-t border-border bg-card px-6 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/10 transition-all duration-200 hover:bg-muted/20">
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

      <div className="flex flex-0 min-w-[280px] border-l border-border bg-card">
        <AgentConfiguration onConfigChange={handleAgentConfigChange} />
      </div>
    </div>
  );
}
