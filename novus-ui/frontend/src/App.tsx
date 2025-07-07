import { useState, useRef } from 'react';
import { Navbar, ConversationHistory } from '@/components';
import { useAgentStore } from '@/store/useAgentStore';
import { useAgentManager } from '@/hooks';
import { Message, Conversation, AgentConfig } from '@/types';

import './App.css';
import { MessageList, ChatInput } from './modules/messenger';
import { AgentConfiguration } from './modules/agent/AgentConfiguration';

function App() {
  const { agents, activeAgentId, reset } = useAgentStore();
  const {
    activeAgent,
    activeProvider,
    isReady,
    agentType,
    sendMessage,
  } = useAgentManager();

  // Message ID counter for unique IDs
  const messageIdCounter = useRef(1);
  const generateMessageId = () => messageIdCounter.current++;

  // State for conversations
  const [conversations, setConversations] = useState<Conversation[]>([
    { id: 1, title: "Getting started with AI", timestamp: "2 hours ago", active: true },
    { id: 2, title: "Code review assistance", timestamp: "Yesterday" },
    { id: 3, title: "Project planning", timestamp: "2 days ago" },
    { id: 4, title: "API documentation help", timestamp: "1 week ago" },
  ]);

  // State for current conversation messages
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'user', content: 'Hello! Can you help me with my project?' },
    { id: 2, role: 'assistant', content: 'Of course! I\'d be happy to help you with your project. What specific area would you like assistance with?' },
    { id: 3, role: 'user', content: 'I need help with React component architecture.' },
  ]);

  // Initialize message counter to start after existing messages
  messageIdCounter.current = Math.max(...messages.map(m => m.id)) + 1;

  // State for loading status
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // User info
  const [user] = useState({ name: "Marsch Huynh" });

  // Handlers
  const handleSendMessage = async (content: string) => {
    if (!isReady) {
      console.warn('Agent not ready. Please select an agent and provider.');
      return;
    }

    const newMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);

    try {
      // Get current active conversation ID (for this demo, we'll use the active conversation)
      const activeConversationId = conversations.find(c => c.active)?.id.toString() || 'default';

      // Send message using AgentManager
      const response = await sendMessage(content, {
        conversationId: activeConversationId,
        onError: (error) => {
          console.error('Message sending failed:', error);
          // Add error message to chat
          const errorMessage: Message = {
            id: generateMessageId(),
            role: 'assistant',
            content: `❌ Error: ${error.message}. Please check your agent configuration and try again.`,
            timestamp: new Date().toISOString()
          };
          setMessages(prev => [...prev, errorMessage]);
          setIsLoading(false);
        }
      });

      // Add assistant response to messages
      const assistantMessage: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content: response.content,
        timestamp: response.timestamp
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Log metadata for debugging
      if (response.metadata) {
        console.log('Response metadata:', {
          model: response.metadata.model,
          provider: response.metadata.provider,
          agentType: response.metadata.agentType,
          responseTime: response.metadata.responseTime
        });
      }

    } catch (error) {
      console.error('Failed to send message:', error);

      // Add error message to chat
      const errorMessage: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content: `❌ Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}. ${
          !activeAgent ? 'No agent selected.' :
          !activeProvider && agentType === 'local' ? 'No provider configured for local agent.' :
          activeAgent.agentType === 'remote' && !activeAgent.url ? 'No URL configured for remote agent.' :
          'Please check your configuration and try again.'
        }`,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, errorMessage]);
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
        id: generateMessageId(),
        role: 'assistant',
        content: '⏹️ Generation stopped by user.',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, stopMessage]);
      console.log('Generation stopped by user');

      // TODO: Implement request cancellation in AgentManager
      // For now, we can only stop the UI state, but the underlying request may continue
      console.warn('Note: Underlying agent request may still be processing. Request cancellation will be implemented in a future update.');
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
      id: Math.max(...conversations.map(c => c.id)) + 1,
      title: "New Conversation",
      timestamp: "Just now",
      active: true
    };

    // Mark all conversations as inactive
    const updatedConversations = conversations.map(conv => ({ ...conv, active: false }));
    setConversations([newConversation, ...updatedConversations]);

    // Clear messages for new conversation
    setMessages([]);
  };

  const handleConversationSelect = (conversationId: number) => {
    // Stop any ongoing generation when switching conversations
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsLoading(false);
    }



    const updatedConversations = conversations.map(conv => ({
      ...conv,
      active: conv.id === conversationId
    }));
    setConversations(updatedConversations);

    // In a real app, you would load messages for the selected conversation
    // For demo purposes, we'll keep the current messages
  };

  const handleAgentConfigChange = (config: AgentConfig) => {
    console.log('Agent config updated:', config);
    const selectedAgent = config.agents.find(agent => agent.id === config.selectedAgent);
    console.log('Selected agent:', selectedAgent?.name);
  };

  const handleAgentConfigReset = () => {
    reset();
    console.log('Agent config reset to defaults');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <Navbar userName={user.name} />

      <div className="flex flex-1 overflow-hidden">
        <ConversationHistory
          conversations={conversations}
          onNewConversation={handleNewConversation}
          onConversationSelect={handleConversationSelect}
        />

        <div className="flex-1 flex flex-col bg-gray-100">
          <MessageList
            messages={messages}
            isLoading={isLoading}
          />

          {/* Agent Status Bar */}
          <div className="border-t border-border bg-white px-6 py-2">
            <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-muted-foreground">
                    Agent: {activeAgent?.name || 'None'} ({agentType || 'N/A'})
                  </span>
                </div>
                {agentType === 'local' && (
                  <div className="text-muted-foreground">
                    Provider: {activeProvider?.name || 'None'}
                  </div>
                )}
                {agentType === 'remote' && activeAgent?.url && (
                  <div className="text-muted-foreground">
                    URL: {new URL(activeAgent.url).hostname}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {isReady ? 'Ready' : 'Not Ready - Configure agent and provider'}
              </div>
            </div>
          </div>

          <ChatInput
            onSendMessage={handleSendMessage}
            onStop={handleStopGeneration}
            disabled={isLoading || !isReady}
            placeholder={
              !isReady
                ? "Configure an agent and provider to start chatting..."
                : "Type your message here..."
            }
          />
        </div>

        <AgentConfiguration
          onConfigChange={handleAgentConfigChange}
          onReset={handleAgentConfigReset}
        />
      </div>
    </div>
  );
}

export default App;