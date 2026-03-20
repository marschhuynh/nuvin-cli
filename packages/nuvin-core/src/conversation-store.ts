import type { Message, MemoryPort, MetadataPort } from './ports.js';
import { MemoryPortMetadataAdapter } from './persistent/metadata-memory.js';

export type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ConversationMetadata = {
  topic?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  contextWindow?: TokenUsage;
  requestCount?: number;
  toolCallCount?: number;
  totalTimeMs?: number;
  totalPrice?: number;
  summarizedFrom?: string;
};

export type Conversation = {
  messages: Message[];
  metadata: ConversationMetadata;
};

export type ConversationSnapshot = Record<string, Conversation>;

export class ConversationStore {
  private metadataMemory: MetadataPort<ConversationMetadata>;

  constructor(
    private memory: MemoryPort<Message>,
    metadataMemory?: MetadataPort<ConversationMetadata>,
  ) {
    this.metadataMemory = metadataMemory ?? new MemoryPortMetadataAdapter<ConversationMetadata>(memory);
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    const messages = await this.memory.get(conversationId);
    const metadata = await this.metadataMemory.get(conversationId);

    return {
      messages,
      metadata: metadata ?? {
        createdAt: messages[0]?.timestamp,
        updatedAt: messages[messages.length - 1]?.timestamp,
        messageCount: messages.length,
      },
    };
  }

  async setConversation(conversationId: string, conversation: Conversation): Promise<void> {
    await this.memory.set(conversationId, conversation.messages);
    await this.metadataMemory.set(conversationId, conversation.metadata);
  }

  async appendMessages(conversationId: string, messages: Message[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }

    await this.memory.append(conversationId, messages);

    const allMessages = await this.memory.get(conversationId);
    const metadata = await this.metadataMemory.get(conversationId);
    const updatedMetadata: ConversationMetadata = {
      ...metadata,
      updatedAt: messages[messages.length - 1]?.timestamp ?? new Date().toISOString(),
      messageCount: allMessages.length,
    };

    await this.metadataMemory.set(conversationId, updatedMetadata);
  }

  async deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;

    const conversation = await this.getConversation(conversationId);
    const idSet = new Set(messageIds);
    const filteredMessages = conversation.messages.filter((msg) => !idSet.has(msg.id));

    await this.memory.set(conversationId, filteredMessages);

    const updatedMetadata: ConversationMetadata = {
      ...conversation.metadata,
      messageCount: filteredMessages.length,
      updatedAt: new Date().toISOString(),
    };
    await this.metadataMemory.set(conversationId, updatedMetadata);
  }

  async updateMetadata(conversationId: string, updates: Partial<ConversationMetadata>): Promise<void> {
    const metadata = await this.metadataMemory.get(conversationId);
    const updatedMetadata: ConversationMetadata = {
      ...metadata,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.metadataMemory.set(conversationId, updatedMetadata);
  }

  async incrementTokens(conversationId: string, tokenUsage: TokenUsage): Promise<void> {
    const metadata = await this.metadataMemory.get(conversationId);
    const updatedMetadata: ConversationMetadata = {
      ...metadata,
      promptTokens: (metadata?.promptTokens ?? 0) + (tokenUsage.promptTokens ?? 0),
      completionTokens: (metadata?.completionTokens ?? 0) + (tokenUsage.completionTokens ?? 0),
      totalTokens: (metadata?.totalTokens ?? 0) + (tokenUsage.totalTokens ?? 0),
      contextWindow: tokenUsage,
      updatedAt: new Date().toISOString(),
    };
    await this.metadataMemory.set(conversationId, updatedMetadata);
  }

  async recordRequestMetrics(
    conversationId: string,
    metrics: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      toolCalls?: number;
      responseTimeMs?: number;
      cost?: number;
    },
  ): Promise<ConversationMetadata> {
    const metadata = await this.metadataMemory.get(conversationId);

    const updatedMetadata: ConversationMetadata = {
      ...metadata,
      promptTokens: (metadata?.promptTokens ?? 0) + (metrics.promptTokens ?? 0),
      completionTokens: (metadata?.completionTokens ?? 0) + (metrics.completionTokens ?? 0),
      totalTokens: (metadata?.totalTokens ?? 0) + (metrics.totalTokens ?? 0),
      requestCount: (metadata?.requestCount ?? 0) + 1,
      toolCallCount: (metadata?.toolCallCount ?? 0) + (metrics.toolCalls ?? 0),
      totalTimeMs: (metadata?.totalTimeMs ?? 0) + (metrics.responseTimeMs ?? 0),
      totalPrice: (metadata?.totalPrice ?? 0) + (metrics.cost ?? 0),
      contextWindow: {
        promptTokens: metrics.promptTokens,
        completionTokens: metrics.completionTokens,
        totalTokens: metrics.totalTokens,
      },
      updatedAt: new Date().toISOString(),
    };

    await this.metadataMemory.set(conversationId, updatedMetadata);
    return updatedMetadata;
  }

  async updateTopic(conversationId: string, topic: string): Promise<void> {
    const metadata = await this.metadataMemory.get(conversationId);
    const updatedMetadata: ConversationMetadata = {
      ...metadata,
      topic,
      updatedAt: new Date().toISOString(),
    };

    await this.metadataMemory.set(conversationId, updatedMetadata);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.memory.delete(conversationId);
    await this.metadataMemory.delete(conversationId);
  }

  async listConversations(): Promise<{ id: string; metadata: ConversationMetadata }[]> {
    const messageKeys = await this.memory.keys();

    const conversationIds = messageKeys.filter((key) => !key.startsWith('__metadata__'));

    const conversations = await Promise.all(
      conversationIds.map(async (id) => {
        const metadata = await this.metadataMemory.get(id);
        return { id, metadata: metadata ?? {} };
      }),
    );

    return conversations;
  }

  async exportSnapshot(): Promise<ConversationSnapshot> {
    const snapshot: ConversationSnapshot = {};
    const conversations = await this.listConversations();

    for (const { id } of conversations) {
      const conversation = await this.getConversation(id);
      snapshot[id] = conversation;
    }

    return snapshot;
  }

  async importSnapshot(snapshot: ConversationSnapshot): Promise<void> {
    for (const [id, conversation] of Object.entries(snapshot)) {
      await this.setConversation(id, conversation);
    }
  }
}
