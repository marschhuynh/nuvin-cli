import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestratorManager } from '../source/services/OrchestratorManager.js';
import type { ConfigManager } from '../source/config/manager.js';
import type { UIHandlers } from '../source/services/OrchestratorManager.js';
import type { LLMPort } from '@nuvin/nuvin-core';

vi.mock('../source/services/LLMFactory.js', () => {
  const mockLLM: LLMPort = {
    generateCompletion: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Test Topic' }],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5, cacheWriteTokens: 0, cacheReadTokens: 0 },
    }),
  };

  return {
    LLMFactory: vi.fn().mockImplementation(() => ({
      createLLM: vi.fn().mockReturnValue(mockLLM),
      getModels: vi.fn().mockResolvedValue([]),
    })),
  };
});

describe.skip('OrchestratorManager - Topic Analysis', () => {
  let manager: OrchestratorManager;
  let mockHandlers: UIHandlers;
  let mockConfigManager: ConfigManager;

  beforeEach(async () => {
    mockHandlers = {
      appendLine: vi.fn(),
      updateLine: vi.fn(),
      updateLineMetadata: vi.fn(),
      setLastMetadata: vi.fn(),
      handleError: vi.fn(),
    };

    mockConfigManager = {
      getConfig: vi.fn().mockReturnValue({
        activeProvider: 'openrouter',
        model: 'openai/gpt-4',
        requireToolApproval: false,
        thinking: 'OFF',
        streamingChunks: false,
        mcp: undefined,
        providers: {
          openrouter: {
            auth: [{ type: 'api-key', 'api-key': 'test-api-key' }],
          },
        },
      }),
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any;

    manager = new OrchestratorManager(mockConfigManager);

    await manager.init(
      {
        memPersist: false,
        streamingChunks: false,
        mcpConfigPath: '/non/existent/path/mcp-config.json',
      },
      mockHandlers,
    );
  });

  describe('analyzeTopic', () => {
    it('should analyze and extract topic from user message', async () => {
      const topic = await manager.analyzeTopic('How do I fix this authentication bug?');

      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
      expect(topic.trim()).toBe(topic);
    });

    it('should handle short messages', async () => {
      const topic = await manager.analyzeTopic('Help');

      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should handle long messages', async () => {
      const longMessage = `
        I'm working on a complex web application that uses React and TypeScript.
        I need help understanding how to properly implement authentication using JWT tokens.
        Specifically, I want to know how to handle token refresh and store tokens securely.
        Can you help me with best practices for this?
      `;

      const topic = await manager.analyzeTopic(longMessage);

      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should handle technical messages', async () => {
      const topic = await manager.analyzeTopic('Implement OAuth2 flow with PKCE extension');

      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });
  });

  describe('updateConversationTopic', () => {
    it('should update conversation topic in metadata', async () => {
      const conversationId = 'cli';

      await manager.send('Test message', { conversationId });

      await manager.updateConversationTopic(conversationId, 'Test Topic');

      const metadata = await manager.getConversationMetadata(conversationId);
      expect(metadata.topic).toBe('Test Topic');
    });

    it('should preserve existing metadata when updating topic', async () => {
      const conversationId = 'cli';

      await manager.send('First message', { conversationId });
      await manager.updateConversationTopic(conversationId, 'Initial Topic');

      const _metadataBefore = await manager.getConversationMetadata(conversationId);

      await manager.updateConversationTopic(conversationId, 'Updated Topic');

      const metadataAfter = await manager.getConversationMetadata(conversationId);
      expect(metadataAfter.topic).toBe('Updated Topic');
      expect(metadataAfter.updatedAt).toBeDefined();
    });

    it('should throw error if conversation store not initialized', async () => {
      const uninitializedManager = new OrchestratorManager(mockConfigManager);

      await expect(uninitializedManager.updateConversationTopic('test', 'Topic')).rejects.toThrow(
        'ConversationStore not initialized',
      );
    });
  });

  describe('analyzeAndUpdateTopic', () => {
    it('should analyze topic and update conversation in one call', async () => {
      const conversationId = 'test-conv';
      const userMessage = 'How do I implement user authentication?';

      await manager.send(userMessage, { conversationId });

      const topic = await manager.analyzeAndUpdateTopic(userMessage, conversationId);

      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);

      const metadata = await manager.getConversationMetadata(conversationId);
      expect(metadata.topic).toBe(topic);
    });

    it('should use default conversation id "cli"', async () => {
      const userMessage = 'Test message';

      await manager.send(userMessage, { conversationId: 'cli' });

      const topic = await manager.analyzeAndUpdateTopic(userMessage);

      const metadata = await manager.getConversationMetadata('cli');
      expect(metadata.topic).toBe(topic);
    });

    it('should return the analyzed topic', async () => {
      const conversationId = 'test-conv';
      const userMessage = 'Debug memory leak in Node.js';

      await manager.send(userMessage, { conversationId });

      const topic = await manager.analyzeAndUpdateTopic(userMessage, conversationId);

      expect(typeof topic).toBe('string');
      expect(topic.trim()).toBe(topic);
    });
  });

  describe('getConversationMetadata', () => {
    it('should return metadata for existing conversation', async () => {
      const conversationId = 'cli';

      await manager.send('Test message', { conversationId });
      await manager.updateConversationTopic(conversationId, 'Test Topic');

      const metadata = await manager.getConversationMetadata(conversationId);

      expect(metadata).toBeDefined();
      expect(metadata.topic).toBe('Test Topic');
      expect(metadata.updatedAt).toBeDefined();
    });

    it('should return default metadata for conversation without explicit metadata', async () => {
      const conversationId = 'cli';

      await manager.send('Test message', { conversationId });

      const metadata = await manager.getConversationMetadata(conversationId);

      expect(metadata).toBeDefined();
    });

    it('should return empty metadata for non-existent conversation', async () => {
      const metadata = await manager.getConversationMetadata('non-existent');

      expect(metadata).toBeDefined();
    });

    it('should throw error if conversation store not initialized', async () => {
      const uninitializedManager = new OrchestratorManager(mockConfigManager);

      await expect(uninitializedManager.getConversationMetadata('test')).rejects.toThrow(
        'ConversationStore not initialized',
      );
    });
  });

  describe('listConversations', () => {
    it('should list all conversations with metadata', async () => {
      await manager.send('First message', { conversationId: 'conv-1' });
      await manager.updateConversationTopic('conv-1', 'Topic 1');

      await manager.send('Second message', { conversationId: 'conv-2' });
      await manager.updateConversationTopic('conv-2', 'Topic 2');

      const conversations = await manager.listConversations();

      expect(conversations.length).toBeGreaterThanOrEqual(2);

      const conv1 = conversations.find((c) => c.id === 'conv-1');
      expect(conv1).toBeDefined();
      expect(conv1?.metadata.topic).toBe('Topic 1');

      const conv2 = conversations.find((c) => c.id === 'conv-2');
      expect(conv2).toBeDefined();
      expect(conv2?.metadata.topic).toBe('Topic 2');
    });

    it('should return empty array when no conversations exist', async () => {
      const freshManager = new OrchestratorManager(mockConfigManager);
      await freshManager.init({ memPersist: false, mcpConfigPath: '/non/existent/path/mcp-config.json' }, mockHandlers);

      const conversations = await freshManager.listConversations();

      expect(Array.isArray(conversations)).toBe(true);
    });

    it('should include conversations without topics', async () => {
      await manager.send('Message without topic', { conversationId: 'conv-no-topic' });

      const conversations = await manager.listConversations();

      const convNoTopic = conversations.find((c) => c.id === 'conv-no-topic');
      expect(convNoTopic).toBeDefined();
    });

    it('should throw error if conversation store not initialized', async () => {
      const uninitializedManager = new OrchestratorManager(mockConfigManager);

      await expect(uninitializedManager.listConversations()).rejects.toThrow('ConversationStore not initialized');
    });
  });

  describe('getConversationStore', () => {
    it('should return conversation store instance', () => {
      const store = manager.getConversationStore();

      expect(store).toBeDefined();
      expect(typeof store?.getConversation).toBe('function');
      expect(typeof store?.updateTopic).toBe('function');
    });

    it('should return null if not initialized', () => {
      const uninitializedManager = new OrchestratorManager(mockConfigManager);
      const store = uninitializedManager.getConversationStore();

      expect(store).toBeNull();
    });
  });

  describe('integration with conversation flow', () => {
    it('should track metadata across multiple messages', async () => {
      const conversationId = 'cli';

      await manager.send('First message', { conversationId });
      await manager.updateConversationTopic(conversationId, 'Test Topic');

      const metadataAfterFirst = await manager.getConversationMetadata(conversationId);
      expect(metadataAfterFirst.topic).toBe('Test Topic');

      await manager.send('Second message', { conversationId });

      const metadataAfterSecond = await manager.getConversationMetadata(conversationId);
      expect(metadataAfterSecond.topic).toBe('Test Topic');
    });

    it('should maintain topic across new messages', async () => {
      const conversationId = 'cli';

      await manager.send('Initial message', { conversationId });
      await manager.updateConversationTopic(conversationId, 'Persistent Topic');

      await manager.send('Follow-up message', { conversationId });

      const metadata = await manager.getConversationMetadata(conversationId);
      expect(metadata.topic).toBe('Persistent Topic');
    });

    it('should handle topic analysis workflow', async () => {
      const conversationId = 'cli';
      const userMessage = 'How to optimize React performance?';

      await manager.send(userMessage, { conversationId });

      const topic = await manager.analyzeAndUpdateTopic(userMessage, conversationId);

      expect(topic).toBeTruthy();

      const conversations = await manager.listConversations();
      const conversation = conversations.find((c) => c.id === conversationId);

      expect(conversation).toBeDefined();
      expect(conversation?.metadata.topic).toBe(topic);
    });
  });
});
