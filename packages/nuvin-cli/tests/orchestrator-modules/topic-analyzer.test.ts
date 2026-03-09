import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopicAnalyzer, type TopicAnalyzerDeps } from '../../source/services/orchestrator-modules/TopicAnalyzer.js';
import { InMemoryMemory, ConversationContext } from '@nuvin/nuvin-core';
import type { Message, LLMPort, ConversationStore } from '@nuvin/nuvin-core';
import type { OrchestratorRuntime } from '../../source/services/OrchestratorRuntime.js';

function createMockRuntime(overrides: Partial<OrchestratorRuntime> = {}): OrchestratorRuntime {
  return {
    orchestrator: null as any,
    memory: new InMemoryMemory<Message>(),
    conversationStore: {
      updateTopic: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue({ messages: [], metadata: {} }),
      setConversation: vi.fn().mockResolvedValue(undefined),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
      listConversations: vi.fn().mockResolvedValue([]),
      recordRequestMetrics: vi.fn().mockResolvedValue(undefined),
    } as unknown as ConversationStore,
    toolRegistry: null as any,
    sessionId: null,
    sessionDir: null,
    activeAgentId: 'main',
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<TopicAnalyzerDeps> = {}): TopicAnalyzerDeps {
  const context = new ConversationContext();

  const mockLLM: LLMPort = {
    generateCompletion: vi.fn().mockResolvedValue({
      content: 'Mock Topic',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  };

  const mockRuntime = createMockRuntime();

  return {
    getRuntime: () => mockRuntime,
    getConversationContext: () => context,
    createLLM: () => mockLLM,
    getCurrentConfig: () => ({ smallModel: 'test-model' }),
    ...overrides,
  };
}

describe('TopicAnalyzer', () => {
  let analyzer: TopicAnalyzer;
  let deps: TopicAnalyzerDeps;

  beforeEach(() => {
    deps = createMockDeps();
    analyzer = new TopicAnalyzer(deps);
  });

  describe('analyzeTopic', () => {
    it('should return analyzed topic from LLM response', async () => {
      const topic = await analyzer.analyzeTopic('How do I deploy to production?');
      expect(topic).toBe('Mock Topic');
    });

    it('should call LLM with smallModel from config', async () => {
      const mockLLM: LLMPort = {
        generateCompletion: vi.fn().mockResolvedValue({
          content: 'Deployment Topic',
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };
      deps = createMockDeps({ createLLM: () => mockLLM });
      analyzer = new TopicAnalyzer(deps);

      await analyzer.analyzeTopic('Deploy my app');
      expect(mockLLM.generateCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          temperature: 0.3,
        }),
      );
    });

    it('should include conversation history in the prompt when available', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: '1', role: 'user', content: 'First question about React', timestamp: '2024-01-01' },
        { id: '2', role: 'assistant', content: 'Here is the answer', timestamp: '2024-01-01' },
        { id: '3', role: 'user', content: 'Follow up question', timestamp: '2024-01-01' },
      ]);

      const mockLLM: LLMPort = {
        generateCompletion: vi.fn().mockResolvedValue({
          content: 'React Questions',
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };

      deps = createMockDeps({
        getRuntime: () => createMockRuntime({ memory }),
        createLLM: () => mockLLM,
      });
      analyzer = new TopicAnalyzer(deps);

      await analyzer.analyzeTopic('Another follow up');

      const call = (mockLLM.generateCompletion as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const userPrompt = call.messages[1].content;
      expect(userPrompt).toContain('Previous user messages');
      expect(userPrompt).toContain('First question about React');
      expect(userPrompt).toContain('Follow up question');
    });

    it('should fallback to truncated message when LLM fails', async () => {
      const mockLLM: LLMPort = {
        generateCompletion: vi.fn().mockRejectedValue(new Error('LLM failed')),
      };
      deps = createMockDeps({ createLLM: () => mockLLM });
      analyzer = new TopicAnalyzer(deps);

      const shortMsg = 'Short message';
      const topic = await analyzer.analyzeTopic(shortMsg);
      expect(topic).toBe(shortMsg);
    });

    it('should truncate long messages in fallback', async () => {
      const mockLLM: LLMPort = {
        generateCompletion: vi.fn().mockRejectedValue(new Error('LLM failed')),
      };
      deps = createMockDeps({ createLLM: () => mockLLM });
      analyzer = new TopicAnalyzer(deps);

      const longMsg = 'A'.repeat(100);
      const topic = await analyzer.analyzeTopic(longMsg);
      expect(topic).toHaveLength(50);
    });

    it('should use provided conversationId', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('custom-conv', [
        { id: '1', role: 'user', content: 'Message in custom conv', timestamp: '2024-01-01' },
      ]);

      deps = createMockDeps({ getRuntime: () => createMockRuntime({ memory }) });
      analyzer = new TopicAnalyzer(deps);

      await analyzer.analyzeTopic('New message', 'custom-conv');
      // Should not throw - successfully used custom conversationId
    });
  });

  describe('updateConversationTopic', () => {
    it('should delegate to conversation store', async () => {
      const mockStore = {
        updateTopic: vi.fn().mockResolvedValue(undefined),
        getConversation: vi.fn(),
        setConversation: vi.fn(),
        updateMetadata: vi.fn(),
        listConversations: vi.fn(),
        recordRequestMetrics: vi.fn(),
      };
      deps = createMockDeps({
        getRuntime: () => createMockRuntime({ conversationStore: mockStore as unknown as ConversationStore }),
      });
      analyzer = new TopicAnalyzer(deps);

      await analyzer.updateConversationTopic('conv-1', 'New Topic');
      expect(mockStore.updateTopic).toHaveBeenCalledWith('conv-1', 'New Topic');
    });

    it('should throw if conversation store is not initialized', async () => {
      deps = createMockDeps({ getRuntime: () => null });
      analyzer = new TopicAnalyzer(deps);

      await expect(analyzer.updateConversationTopic('conv-1', 'Topic')).rejects.toThrow(
        'ConversationStore not initialized',
      );
    });
  });

  describe('analyzeAndUpdateTopic', () => {
    it('should analyze and update topic in one call', async () => {
      const mockStore = {
        updateTopic: vi.fn().mockResolvedValue(undefined),
        getConversation: vi.fn(),
        setConversation: vi.fn(),
        updateMetadata: vi.fn(),
        listConversations: vi.fn(),
        recordRequestMetrics: vi.fn(),
      };
      deps = createMockDeps({
        getRuntime: () => createMockRuntime({ conversationStore: mockStore as unknown as ConversationStore }),
      });
      analyzer = new TopicAnalyzer(deps);

      const topic = await analyzer.analyzeAndUpdateTopic('How to test React?', 'conv-1');
      expect(topic).toBe('Mock Topic');
      expect(mockStore.updateTopic).toHaveBeenCalledWith('conv-1', 'Mock Topic');
    });

    it('should use default conversation id when not provided', async () => {
      const topic = await analyzer.analyzeAndUpdateTopic('Test message');
      expect(topic).toBe('Mock Topic');
    });

    it('should wait for waitFor promise before updating topic', async () => {
      let resolveWaitFor: () => void;
      const waitFor = new Promise<void>((resolve) => {
        resolveWaitFor = resolve;
      });

      const mockStore = {
        updateTopic: vi.fn().mockResolvedValue(undefined),
        getConversation: vi.fn(),
        setConversation: vi.fn(),
        updateMetadata: vi.fn(),
        listConversations: vi.fn(),
        recordRequestMetrics: vi.fn(),
      };
      deps = createMockDeps({
        getRuntime: () => createMockRuntime({ conversationStore: mockStore as unknown as ConversationStore }),
      });
      analyzer = new TopicAnalyzer(deps);

      const topicPromise = analyzer.analyzeAndUpdateTopic('Test', 'default', { waitFor });

      // updateTopic should not be called yet because waitFor hasn't resolved
      expect(mockStore.updateTopic).not.toHaveBeenCalled();

      resolveWaitFor!();
      const topic = await topicPromise;

      expect(topic).toBe('Mock Topic');
      expect(mockStore.updateTopic).toHaveBeenCalledWith('default', 'Mock Topic');
    });
  });
});
