import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentManager } from '../agents/agent-manager';
import type { AgentSettings, Message } from '@/types';

// Mock dependencies
vi.mock('../a2a');
vi.mock('../agents');
vi.mock('../utils', () => ({
  generateUUID: () => 'mock-uuid-123',
}));

describe('AgentManager', () => {
  let agentManager: AgentManager;

  const mockAgent: AgentSettings = {
    id: 'test-agent-1',
    name: 'Test Agent',
    agentType: 'local',
    persona: 'helpful',
    responseLength: 'medium',
    systemPrompt: 'Test prompt',
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 1000,
  };

  beforeEach(() => {
    // Reset singleton instance
    (AgentManager as any).instance = undefined;
    agentManager = AgentManager.getInstance();
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('returns singleton instance', () => {
      const instance1 = AgentManager.getInstance();
      const instance2 = AgentManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('setActiveAgent', () => {
    it('sets active agent correctly', () => {
      agentManager.setActiveAgent(mockAgent);

      const status = agentManager.getAgentStatus(mockAgent);
      expect(status.name).toBe('Test Agent');
      expect(status.type).toBe('local');
    });
  });

  describe('getAgentStatus', () => {
    beforeEach(() => {
      agentManager.setActiveAgent(mockAgent);
    });

    it('returns correct agent status with initial values', () => {
      const status = agentManager.getAgentStatus(mockAgent);

      expect(status).toEqual({
        id: 'test-agent-1',
        name: 'Test Agent',
        type: 'local',
        status: 'available',
        totalTokensUsed: 0,
        totalCost: 0,
        messagesProcessed: 0,
        averageResponseTime: 0,
      });
    });
  });

  describe('conversation metrics tracking', () => {
    const conversationId = 'test-conversation';

    const mockMessages: Message[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date().toISOString(),
        metadata: {
          model: 'gpt-4',
          provider: 'openai',
          agentType: 'local',
          agentId: 'test-agent-1',
          totalTokens: 150,
          promptTokens: 50,
          completionTokens: 100,
          estimatedCost: 0.003,
          responseTime: 1500,
        },
      },
      {
        id: 'msg-3',
        role: 'assistant',
        content: 'Another response',
        timestamp: new Date().toISOString(),
        metadata: {
          model: 'gpt-4',
          provider: 'openai',
          agentType: 'local',
          agentId: 'test-agent-1',
          totalTokens: 200,
          promptTokens: 80,
          completionTokens: 120,
          estimatedCost: 0.004,
          responseTime: 2000,
        },
      },
    ];

    beforeEach(() => {
      // Add messages to conversation history
      mockMessages.forEach((message) => {
        (agentManager as any).addToConversationHistory(conversationId, [
          message,
        ]);
      });
    });

    it('calculates conversation metrics correctly', () => {
      const metrics = agentManager.getConversationMetrics(conversationId);

      expect(metrics).toEqual({
        totalTokens: 350, // 150 + 200
        totalCost: 0.007, // 0.003 + 0.004
        messageCount: 2, // Only assistant messages with metadata
      });
    });

    it('returns zero metrics for non-existent conversation', () => {
      const metrics = agentManager.getConversationMetrics('non-existent');

      expect(metrics).toEqual({
        totalTokens: 0,
        totalCost: 0,
        messageCount: 0,
      });
    });

    it('handles conversation with no assistant messages', () => {
      const userOnlyMessages: Message[] = [
        {
          id: 'msg-user-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        },
      ];

      const userConversationId = 'user-only-conversation';
      (agentManager as any).addToConversationHistory(
        userConversationId,
        userOnlyMessages,
      );

      const metrics = agentManager.getConversationMetrics(userConversationId);

      expect(metrics).toEqual({
        totalTokens: 0,
        totalCost: 0,
        messageCount: 0,
      });
    });

    it('handles assistant messages without metadata', () => {
      const messagesWithoutMetadata: Message[] = [
        {
          id: 'msg-no-meta',
          role: 'assistant',
          content: 'Response without metadata',
          timestamp: new Date().toISOString(),
        },
      ];

      const noMetaConversationId = 'no-metadata-conversation';
      (agentManager as any).addToConversationHistory(
        noMetaConversationId,
        messagesWithoutMetadata,
      );

      const metrics = agentManager.getConversationMetrics(noMetaConversationId);

      expect(metrics).toEqual({
        totalTokens: 0,
        totalCost: 0,
        messageCount: 0, // Assistant messages without metadata don't count
      });
    });
  });

  describe('conversation history management', () => {
    const conversationId = 'test-conversation';
    const mockMessage: Message = {
      id: 'msg-1',
      role: 'user',
      content: 'Test message',
      timestamp: new Date().toISOString(),
    };

    it('retrieves conversation history correctly', () => {
      (agentManager as any).addToConversationHistory(conversationId, [
        mockMessage,
      ]);

      const history = agentManager.getConversationHistory(conversationId);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(mockMessage);
    });

    it('returns empty array for non-existent conversation', () => {
      const history = agentManager.getConversationHistory('non-existent');
      expect(history).toEqual([]);
    });

    it('clears specific conversation history', () => {
      (agentManager as any).addToConversationHistory(conversationId, [
        mockMessage,
      ]);
      (agentManager as any).addToConversationHistory('other-conversation', [
        mockMessage,
      ]);

      agentManager.clearConversationHistory(conversationId);

      expect(agentManager.getConversationHistory(conversationId)).toEqual([]);
      expect(
        agentManager.getConversationHistory('other-conversation'),
      ).toHaveLength(1);
    });

    it('clears all conversation history when no ID provided', () => {
      (agentManager as any).addToConversationHistory(conversationId, [
        mockMessage,
      ]);
      (agentManager as any).addToConversationHistory('other-conversation', [
        mockMessage,
      ]);

      agentManager.clearConversationHistory();

      expect(agentManager.getConversationHistory(conversationId)).toEqual([]);
      expect(agentManager.getConversationHistory('other-conversation')).toEqual(
        [],
      );
    });
  });

  describe('agent metrics tracking', () => {
    beforeEach(() => {
      agentManager.setActiveAgent(mockAgent);
    });

    it('tracks agent metrics through message processing', () => {
      // Simulate adding metrics when processing messages
      const agentMetrics = (agentManager as any).agentMetrics;
      agentMetrics.set(mockAgent.id, {
        totalTokensUsed: 500,
        totalCost: 0.015,
        messagesProcessed: 3,
        totalResponseTime: 4500,
      });

      const status = agentManager.getAgentStatus(mockAgent);

      expect(status.totalTokensUsed).toBe(500);
      expect(status.totalCost).toBe(0.015);
      expect(status.messagesProcessed).toBe(3);
      expect(status.averageResponseTime).toBe(1500); // 4500 / 3
    });

    it('handles division by zero for average response time', () => {
      const agentMetrics = (agentManager as any).agentMetrics;
      agentMetrics.set(mockAgent.id, {
        totalTokensUsed: 100,
        totalCost: 0.005,
        messagesProcessed: 0,
        totalResponseTime: 1000,
      });

      const status = agentManager.getAgentStatus(mockAgent);
      expect(status.averageResponseTime).toBe(0);
    });
  });

  describe('remote agent status', () => {
    const remoteAgent: AgentSettings = {
      ...mockAgent,
      id: 'remote-agent-1',
      name: 'Remote Agent',
      agentType: 'remote',
      url: 'https://example.com/agent',
    };

    it('returns correct status for remote agent', () => {
      agentManager.setActiveAgent(remoteAgent);

      const status = agentManager.getAgentStatus(remoteAgent);

      expect(status.type).toBe('remote');
      expect(status.url).toBeUndefined(); // URL is not included in basic status
    });
  });

  describe('error handling', () => {
    it('handles agent with missing properties gracefully', () => {
      const incompleteAgent = {
        id: 'incomplete',
        name: 'Incomplete Agent',
      } as AgentSettings;

      agentManager.setActiveAgent(incompleteAgent);
      const status = agentManager.getAgentStatus(incompleteAgent);

      expect(status.id).toBe('incomplete');
      expect(status.name).toBe('Incomplete Agent');
      expect(status.totalTokensUsed).toBe(0);
      expect(status.totalCost).toBe(0);
    });
  });
});
