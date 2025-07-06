import { useState, useRef } from 'react';
import {
  Navbar,
  ConversationHistory,
  MessageList,
  ChatInput,
} from '@/components';
import { Message, Conversation, AgentConfig } from '@/types';
import { useAgentStore } from '@/store/useAgentStore';

import './App.css';
import { AgentConfiguration } from './modules/agent/AgentConfiguration';


function App() {
  const { agents, activeAgentId, reset } = useAgentStore();

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

  // State for loading status
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // User info
  const [user] = useState({ name: "Marsch Huynh" });

  // Handlers
  const handleSendMessage = async (content: string) => {
    const newMessage: Message = {
      id: messages.length + 1,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);

    // Get current agent for context
    const currentAgent = agents.find(agent => agent.id === activeAgentId);
    const agentName = currentAgent?.name || 'AI Assistant';

    // Simulate API call delay with timeout reference for cancellation
    timeoutRef.current = setTimeout(() => {
      const assistantMessage: Message = {
        id: messages.length + 2,
        role: 'assistant',
        content: `Hello! I'm ${agentName}. You asked: "${content}". This is a simulated response. In the actual implementation, this would be connected to your AI agent service using my specialized tools and capabilities.`,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
      timeoutRef.current = null;
    }, 2000); // Increased delay to better demo the stop functionality
  };

  const handleStopGeneration = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsLoading(false);

      // Add a system message indicating the generation was stopped
      const stopMessage: Message = {
        id: messages.length + 1,
        role: 'assistant',
        content: '⏹️ Generation stopped by user.',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, stopMessage]);
      console.log('Generation stopped by user');
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
      id: conversations.length + 1,
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

          <ChatInput
            onSendMessage={handleSendMessage}
            onStop={handleStopGeneration}
            disabled={isLoading}
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