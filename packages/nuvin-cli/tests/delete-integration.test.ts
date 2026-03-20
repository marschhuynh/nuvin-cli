import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationStore, InMemoryMemory } from '@nuvin/nuvin-core';
import { randomUUID } from 'node:crypto';

describe('ConversationStore.deleteMessages', () => {
  let store: ConversationStore;
  let conversationId: string;

  beforeEach(() => {
    store = new ConversationStore(new InMemoryMemory());
    conversationId = randomUUID();
  });

  it('deletes specified messages by ID', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await store.appendMessages(conversationId, [
      { id: ids[0], role: 'user', content: 'msg1', timestamp: new Date().toISOString() },
      { id: ids[1], role: 'assistant', content: 'msg2', timestamp: new Date().toISOString() },
      { id: ids[2], role: 'user', content: 'msg3', timestamp: new Date().toISOString() },
    ]);

    await store.deleteMessages(conversationId, [ids[1]]);

    const convo = await store.getConversation(conversationId);
    expect(convo.messages).toHaveLength(2);
    expect(convo.messages.map((m) => m.id)).toEqual([ids[0], ids[2]]);
  });

  it('deletes multiple messages at once', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await store.appendMessages(conversationId, [
      { id: ids[0], role: 'user', content: 'msg1', timestamp: new Date().toISOString() },
      { id: ids[1], role: 'assistant', content: 'msg2', timestamp: new Date().toISOString() },
      { id: ids[2], role: 'tool', content: 'msg3', timestamp: new Date().toISOString(), tool_call_id: 'tc-1', name: 'test' },
    ]);

    await store.deleteMessages(conversationId, [ids[0], ids[2]]);

    const convo = await store.getConversation(conversationId);
    expect(convo.messages).toHaveLength(1);
    expect(convo.messages[0].id).toBe(ids[1]);
  });

  it('ignores non-existent message IDs', async () => {
    const id = randomUUID();
    await store.appendMessages(conversationId, [
      { id, role: 'user', content: 'msg', timestamp: new Date().toISOString() },
    ]);

    await store.deleteMessages(conversationId, [randomUUID()]);

    const convo = await store.getConversation(conversationId);
    expect(convo.messages).toHaveLength(1);
  });

  it('no-ops on empty ID array', async () => {
    await store.appendMessages(conversationId, [
      { id: randomUUID(), role: 'user', content: 'msg', timestamp: new Date().toISOString() },
    ]);

    await store.deleteMessages(conversationId, []);

    const convo = await store.getConversation(conversationId);
    expect(convo.messages).toHaveLength(1);
  });
});
