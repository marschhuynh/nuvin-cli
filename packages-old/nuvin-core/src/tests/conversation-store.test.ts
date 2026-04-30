import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationStore } from '../conversation-store.js';
import { InMemoryMemory } from '../persistent/memory.js';
import type { Message } from '../ports.js';
import { MessageRoles } from '../ports.js';

describe('ConversationStore', () => {
  let memory: InMemoryMemory<Message>;
  let store: ConversationStore;

  beforeEach(() => {
    memory = new InMemoryMemory<Message>();
    store = new ConversationStore(memory);
  });

  describe('getConversation', () => {
    it('should return conversation with messages and metadata', async () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'Hello',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
        {
          id: 'msg-2',
          role: MessageRoles.Assistant,
          content: 'Hi there!',
          timestamp: '2025-10-30T10:00:05.000Z',
        },
      ];

      await memory.set('test-conv', messages);

      const conversation = await store.getConversation('test-conv');

      expect(conversation.messages).toEqual(messages);
      expect(conversation.metadata).toBeDefined();
      expect(conversation.metadata.messageCount).toBe(2);
      expect(conversation.metadata.createdAt).toBe('2025-10-30T10:00:00.000Z');
      expect(conversation.metadata.updatedAt).toBe('2025-10-30T10:00:05.000Z');
    });

    it('should return empty conversation for non-existent conversation', async () => {
      const conversation = await store.getConversation('non-existent');

      expect(conversation.messages).toEqual([]);
      expect(conversation.metadata).toBeDefined();
      expect(conversation.metadata.messageCount).toBe(0);
    });

    it('should retrieve stored metadata if available', async () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'Test',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ];

      await memory.set('test-conv', messages);
      await memory.set('__metadata__test-conv', [
        {
          topic: 'Testing',
          createdAt: '2025-10-30T09:00:00.000Z',
          updatedAt: '2025-10-30T11:00:00.000Z',
          messageCount: 5,
        } as unknown as Message,
      ]);

      const conversation = await store.getConversation('test-conv');

      expect(conversation.metadata.topic).toBe('Testing');
      expect(conversation.metadata.messageCount).toBe(5);
      expect(conversation.metadata.createdAt).toBe('2025-10-30T09:00:00.000Z');
    });
  });

  describe('setConversation', () => {
    it('should store messages and metadata', async () => {
      const conversation = {
        messages: [
          {
            id: 'msg-1',
            role: MessageRoles.User,
            content: 'Hello',
            timestamp: '2025-10-30T10:00:00.000Z',
          },
        ],
        metadata: {
          topic: 'Greeting',
          createdAt: '2025-10-30T10:00:00.000Z',
          updatedAt: '2025-10-30T10:00:00.000Z',
          messageCount: 1,
        },
      };

      await store.setConversation('test-conv', conversation);

      const retrieved = await store.getConversation('test-conv');
      expect(retrieved.messages).toEqual(conversation.messages);
      expect(retrieved.metadata).toEqual(conversation.metadata);
    });

    it('should overwrite existing conversation', async () => {
      await store.setConversation('test-conv', {
        messages: [
          {
            id: 'msg-1',
            role: MessageRoles.User,
            content: 'First',
            timestamp: '2025-10-30T10:00:00.000Z',
          },
        ],
        metadata: { topic: 'First Topic', messageCount: 1 },
      });

      await store.setConversation('test-conv', {
        messages: [
          {
            id: 'msg-2',
            role: MessageRoles.User,
            content: 'Second',
            timestamp: '2025-10-30T11:00:00.000Z',
          },
        ],
        metadata: { topic: 'Second Topic', messageCount: 1 },
      });

      const retrieved = await store.getConversation('test-conv');
      expect(retrieved.messages).toHaveLength(1);
      expect(retrieved.messages[0]?.content).toBe('Second');
      expect(retrieved.metadata.topic).toBe('Second Topic');
    });
  });

  describe('appendMessages', () => {
    it('should append messages to existing conversation', async () => {
      const initialMessages: Message[] = [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'First',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ];

      await memory.set('test-conv', initialMessages);

      const newMessages: Message[] = [
        {
          id: 'msg-2',
          role: MessageRoles.Assistant,
          content: 'Second',
          timestamp: '2025-10-30T10:00:05.000Z',
        },
      ];

      await store.appendMessages('test-conv', newMessages);

      const conversation = await store.getConversation('test-conv');
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0]?.content).toBe('First');
      expect(conversation.messages[1]?.content).toBe('Second');
    });

    it('should update metadata after appending messages', async () => {
      await memory.set('test-conv', [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'First',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ]);

      await store.appendMessages('test-conv', [
        {
          id: 'msg-2',
          role: MessageRoles.Assistant,
          content: 'Second',
          timestamp: '2025-10-30T10:00:05.000Z',
        },
      ]);

      const conversation = await store.getConversation('test-conv');
      expect(conversation.metadata.messageCount).toBe(2);
      expect(conversation.metadata.updatedAt).toBe('2025-10-30T10:00:05.000Z');
    });

    it('should preserve existing metadata when appending', async () => {
      await memory.set('test-conv', [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'First',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ]);
      await memory.set('__metadata__test-conv', [
        {
          topic: 'Original Topic',
          createdAt: '2025-10-30T09:00:00.000Z',
          messageCount: 1,
        } as unknown as Message,
      ]);

      await store.appendMessages('test-conv', [
        {
          id: 'msg-2',
          role: MessageRoles.Assistant,
          content: 'Second',
          timestamp: '2025-10-30T10:00:05.000Z',
        },
      ]);

      const conversation = await store.getConversation('test-conv');
      expect(conversation.metadata.topic).toBe('Original Topic');
      expect(conversation.metadata.createdAt).toBe('2025-10-30T09:00:00.000Z');
      expect(conversation.metadata.messageCount).toBe(2);
    });
  });

  describe('updateTopic', () => {
    it('should update topic in metadata', async () => {
      await memory.set('test-conv', [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'Hello',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ]);

      await store.updateTopic('test-conv', 'New Topic');

      const conversation = await store.getConversation('test-conv');
      expect(conversation.metadata.topic).toBe('New Topic');
    });

    it('should preserve other metadata fields when updating topic', async () => {
      await memory.set('test-conv', [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'Hello',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ]);
      await memory.set('__metadata__test-conv', [
        {
          topic: 'Old Topic',
          createdAt: '2025-10-30T09:00:00.000Z',
          messageCount: 5,
        } as unknown as Message,
      ]);

      await store.updateTopic('test-conv', 'Updated Topic');

      const conversation = await store.getConversation('test-conv');
      expect(conversation.metadata.topic).toBe('Updated Topic');
      expect(conversation.metadata.createdAt).toBe('2025-10-30T09:00:00.000Z');
      expect(conversation.metadata.messageCount).toBe(5);
    });

    it('should update updatedAt timestamp', async () => {
      await memory.set('test-conv', [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'Hello',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ]);

      const beforeUpdate = Date.now();
      await store.updateTopic('test-conv', 'New Topic');
      const afterUpdate = Date.now();

      const conversation = await store.getConversation('test-conv');
      const updatedAt = new Date(conversation.metadata.updatedAt!).getTime();

      expect(updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
      expect(updatedAt).toBeLessThanOrEqual(afterUpdate);
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation and metadata', async () => {
      await memory.set('test-conv', [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'Hello',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ]);
      await store.updateTopic('test-conv', 'Test Topic');

      await store.deleteConversation('test-conv');

      const conversation = await store.getConversation('test-conv');
      expect(conversation.messages).toEqual([]);
      expect(conversation.metadata.topic).toBeUndefined();
    });

    it('should not throw error when deleting non-existent conversation', async () => {
      await expect(store.deleteConversation('non-existent')).resolves.not.toThrow();
    });
  });

  describe('listConversations', () => {
    it('should list all conversations with metadata', async () => {
      await memory.set('conv-1', [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'First',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ]);
      await store.updateTopic('conv-1', 'Topic 1');

      await memory.set('conv-2', [
        {
          id: 'msg-2',
          role: MessageRoles.User,
          content: 'Second',
          timestamp: '2025-10-30T11:00:00.000Z',
        },
      ]);
      await store.updateTopic('conv-2', 'Topic 2');

      const conversations = await store.listConversations();

      expect(conversations).toHaveLength(2);
      expect(conversations.find((c) => c.id === 'conv-1')?.metadata.topic).toBe('Topic 1');
      expect(conversations.find((c) => c.id === 'conv-2')?.metadata.topic).toBe('Topic 2');
    });

    it('should not include metadata keys in conversation list', async () => {
      await memory.set('conv-1', [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'Test',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ]);
      await store.updateTopic('conv-1', 'Topic');

      const conversations = await store.listConversations();

      expect(conversations.every((c) => !c.id.startsWith('__metadata__'))).toBe(true);
    });

    it('should return empty array when no conversations exist', async () => {
      const conversations = await store.listConversations();
      expect(conversations).toEqual([]);
    });

    it('should handle conversations without metadata', async () => {
      await memory.set('conv-1', [
        {
          id: 'msg-1',
          role: MessageRoles.User,
          content: 'Test',
          timestamp: '2025-10-30T10:00:00.000Z',
        },
      ]);

      const conversations = await store.listConversations();

      expect(conversations).toHaveLength(1);
      expect(conversations[0]?.id).toBe('conv-1');
      expect(conversations[0]?.metadata).toBeDefined();
    });
  });

  describe('exportSnapshot', () => {
    it('should export all conversations with messages and metadata', async () => {
      await store.setConversation('conv-1', {
        messages: [
          {
            id: 'msg-1',
            role: MessageRoles.User,
            content: 'First',
            timestamp: '2025-10-30T10:00:00.000Z',
          },
        ],
        metadata: { topic: 'Topic 1', messageCount: 1 },
      });

      await store.setConversation('conv-2', {
        messages: [
          {
            id: 'msg-2',
            role: MessageRoles.User,
            content: 'Second',
            timestamp: '2025-10-30T11:00:00.000Z',
          },
        ],
        metadata: { topic: 'Topic 2', messageCount: 1 },
      });

      const snapshot = await store.exportSnapshot();

      expect(snapshot['conv-1']).toBeDefined();
      expect(snapshot['conv-1']?.messages).toHaveLength(1);
      expect(snapshot['conv-1']?.metadata.topic).toBe('Topic 1');

      expect(snapshot['conv-2']).toBeDefined();
      expect(snapshot['conv-2']?.messages).toHaveLength(1);
      expect(snapshot['conv-2']?.metadata.topic).toBe('Topic 2');
    });

    it('should return empty object when no conversations exist', async () => {
      const snapshot = await store.exportSnapshot();
      expect(snapshot).toEqual({});
    });
  });

  describe('importSnapshot', () => {
    it('should import conversations with messages and metadata', async () => {
      const snapshot = {
        'conv-1': {
          messages: [
            {
              id: 'msg-1',
              role: MessageRoles.User,
              content: 'First',
              timestamp: '2025-10-30T10:00:00.000Z',
            },
          ],
          metadata: { topic: 'Topic 1', messageCount: 1 },
        },
        'conv-2': {
          messages: [
            {
              id: 'msg-2',
              role: MessageRoles.User,
              content: 'Second',
              timestamp: '2025-10-30T11:00:00.000Z',
            },
          ],
          metadata: { topic: 'Topic 2', messageCount: 1 },
        },
      };

      await store.importSnapshot(snapshot);

      const conv1 = await store.getConversation('conv-1');
      expect(conv1.messages).toHaveLength(1);
      expect(conv1.metadata.topic).toBe('Topic 1');

      const conv2 = await store.getConversation('conv-2');
      expect(conv2.messages).toHaveLength(1);
      expect(conv2.metadata.topic).toBe('Topic 2');
    });

    it('should overwrite existing conversations on import', async () => {
      await store.setConversation('conv-1', {
        messages: [
          {
            id: 'msg-old',
            role: MessageRoles.User,
            content: 'Old',
            timestamp: '2025-10-30T09:00:00.000Z',
          },
        ],
        metadata: { topic: 'Old Topic', messageCount: 1 },
      });

      const snapshot = {
        'conv-1': {
          messages: [
            {
              id: 'msg-new',
              role: MessageRoles.User,
              content: 'New',
              timestamp: '2025-10-30T10:00:00.000Z',
            },
          ],
          metadata: { topic: 'New Topic', messageCount: 1 },
        },
      };

      await store.importSnapshot(snapshot);

      const conv = await store.getConversation('conv-1');
      expect(conv.messages[0]?.content).toBe('New');
      expect(conv.metadata.topic).toBe('New Topic');
    });
  });

  describe('metadata persistence', () => {
    it('should persist metadata across store instances', async () => {
      const store1 = new ConversationStore(memory);
      await store1.setConversation('test-conv', {
        messages: [
          {
            id: 'msg-1',
            role: MessageRoles.User,
            content: 'Test',
            timestamp: '2025-10-30T10:00:00.000Z',
          },
        ],
        metadata: { topic: 'Persistent Topic', messageCount: 1 },
      });

      const store2 = new ConversationStore(memory);
      const conversation = await store2.getConversation('test-conv');

      expect(conversation.metadata.topic).toBe('Persistent Topic');
      expect(conversation.metadata.messageCount).toBe(1);
    });
  });

  describe('token tracking', () => {
    it('should track token usage with incrementTokens', async () => {
      await store.setConversation('conv-1', {
        messages: [],
        metadata: {
          createdAt: '2025-10-30T10:00:00.000Z',
          messageCount: 0,
        },
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      const conversation = await store.getConversation('conv-1');
      expect(conversation.metadata.promptTokens).toBe(100);
      expect(conversation.metadata.completionTokens).toBe(50);
      expect(conversation.metadata.totalTokens).toBe(150);
    });

    it('should accumulate token usage across multiple calls', async () => {
      await store.setConversation('conv-1', {
        messages: [],
        metadata: {
          createdAt: '2025-10-30T10:00:00.000Z',
          messageCount: 0,
        },
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 200,
        completionTokens: 75,
        totalTokens: 275,
      });

      const conversation = await store.getConversation('conv-1');
      expect(conversation.metadata.promptTokens).toBe(300);
      expect(conversation.metadata.completionTokens).toBe(125);
      expect(conversation.metadata.totalTokens).toBe(425);
    });

    it('should handle partial token data', async () => {
      await store.setConversation('conv-1', {
        messages: [],
        metadata: {
          createdAt: '2025-10-30T10:00:00.000Z',
          messageCount: 0,
        },
      });

      await store.incrementTokens('conv-1', {
        totalTokens: 100,
      });

      const conversation = await store.getConversation('conv-1');
      expect(conversation.metadata.totalTokens).toBe(100);
      expect(conversation.metadata.promptTokens).toBe(0);
      expect(conversation.metadata.completionTokens).toBe(0);
    });

    it('should initialize tokens from zero if not set', async () => {
      await store.setConversation('conv-1', {
        messages: [],
        metadata: {
          createdAt: '2025-10-30T10:00:00.000Z',
          messageCount: 0,
        },
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
      });

      const conversation = await store.getConversation('conv-1');
      expect(conversation.metadata.promptTokens).toBe(50);
      expect(conversation.metadata.completionTokens).toBe(25);
      expect(conversation.metadata.totalTokens).toBe(75);
    });

    it('should store last message tokens in contextWindow', async () => {
      await store.setConversation('conv-1', {
        messages: [],
        metadata: {
          createdAt: '2025-10-30T10:00:00.000Z',
          messageCount: 0,
        },
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      const conversation = await store.getConversation('conv-1');
      expect(conversation.metadata.contextWindow).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('should update contextWindow with latest message tokens', async () => {
      await store.setConversation('conv-1', {
        messages: [],
        metadata: {
          createdAt: '2025-10-30T10:00:00.000Z',
          messageCount: 0,
        },
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 200,
        completionTokens: 75,
        totalTokens: 275,
      });

      const conversation = await store.getConversation('conv-1');
      expect(conversation.metadata.contextWindow).toEqual({
        promptTokens: 200,
        completionTokens: 75,
        totalTokens: 275,
      });
      expect(conversation.metadata.totalTokens).toBe(425);
    });

    it('should keep contextWindow independent from cumulative totals', async () => {
      await store.setConversation('conv-1', {
        messages: [],
        metadata: {
          createdAt: '2025-10-30T10:00:00.000Z',
          messageCount: 0,
        },
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 200,
        completionTokens: 75,
        totalTokens: 275,
      });

      await store.incrementTokens('conv-1', {
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
      });

      const conversation = await store.getConversation('conv-1');
      expect(conversation.metadata.contextWindow).toEqual({
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
      });
      expect(conversation.metadata.totalTokens).toBe(500);
      expect(conversation.metadata.promptTokens).toBe(350);
      expect(conversation.metadata.completionTokens).toBe(150);
    });
  });
});
