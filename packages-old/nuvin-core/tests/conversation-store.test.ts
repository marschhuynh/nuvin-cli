import { describe, it, expect } from 'vitest';
import { ConversationStore } from '../src/conversation-store.js';
import { InMemoryMemory } from '../src/persistent/memory.js';
import type { Message } from '../src/ports.js';

const makeStore = () => new ConversationStore(new InMemoryMemory<Message>());

describe('ConversationStore.deleteMessages', () => {
  it('removes specified messages and updates metadata', async () => {
    const store = makeStore();
    const id = 'conv-1';

    await store.appendMessages(id, [
      { id: 'msg1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      { id: 'msg2', role: 'assistant', content: 'Hi', timestamp: new Date().toISOString() },
      { id: 'msg3', role: 'user', content: 'Delete me', timestamp: new Date().toISOString() },
    ]);

    await store.deleteMessages(id, ['msg3']);

    const conv = await store.getConversation(id);
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages.find((m) => m.id === 'msg3')).toBeUndefined();
    expect(conv.metadata.messageCount).toBe(2);
  });

  it('is a no-op for empty ids array', async () => {
    const store = makeStore();
    const id = 'conv-2';

    await store.appendMessages(id, [
      { id: 'msg1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
    ]);

    await store.deleteMessages(id, []);

    const conv = await store.getConversation(id);
    expect(conv.messages).toHaveLength(1);
  });

  it('updates updatedAt timestamp', async () => {
    const store = makeStore();
    const id = 'conv-3';
    const before = new Date().toISOString();

    await store.appendMessages(id, [
      { id: 'msg1', role: 'user', content: 'A', timestamp: before },
      { id: 'msg2', role: 'assistant', content: 'B', timestamp: before },
    ]);

    await store.deleteMessages(id, ['msg2']);

    const conv = await store.getConversation(id);
    expect(conv.metadata.updatedAt).toBeDefined();
    expect(conv.metadata.updatedAt! >= before).toBe(true);
  });
});
