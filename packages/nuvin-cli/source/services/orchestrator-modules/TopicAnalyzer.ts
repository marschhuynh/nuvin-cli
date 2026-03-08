import type { LLMPort, ConversationContext } from '@nuvin/nuvin-core';
import type { OrchestratorRuntime } from '../OrchestratorRuntime.js';
import { messageContentToText } from './utils.js';
export type TopicAnalyzerDeps = {
  getRuntime: () => OrchestratorRuntime | null;
  getConversationContext: () => ConversationContext;
  createLLM: () => LLMPort;
  getCurrentConfig: () => { smallModel: string };
};

export class TopicAnalyzer {
  constructor(private deps: TopicAnalyzerDeps) {}

  async analyzeTopic(userMessage: string, conversationId?: string): Promise<string> {
    const actualConversationId = conversationId ?? this.deps.getConversationContext().getActiveConversationId();

    let conversationHistory = '';
    const memory = this.deps.getRuntime()?.memory ?? null;
    if (memory) {
      try {
        const messages = await memory.get(actualConversationId);
        if (messages && messages.length > 0) {
          const userMessages = messages.filter((msg) => msg.role === 'user');
          if (userMessages.length > 0) {
            conversationHistory = userMessages
              .map((msg) => messageContentToText(msg.content))
              .join('\n\n');
          }
        }
      } catch {
        // If we can't get history, continue with just the current message
      }
    }

    const topicPrompt = conversationHistory
      ? `Analyze the following user messages and extract the main topic or intent in 5-10 words. Be concise and descriptive.\n\nPrevious user messages:\n${conversationHistory}\n\nCurrent user message: ${userMessage}\n\nRespond with only the topic, no explanation.`
      : `Analyze the following user message and extract the main topic or intent in 5-10 words. Be concise and descriptive.\n\nUser message: ${userMessage}\n\nRespond with only the topic, no explanation.`;

    const currentConfig = this.deps.getCurrentConfig();
    const llm = this.deps.createLLM();

    try {
      const response = await llm.generateCompletion({
        model: currentConfig.smallModel,
        messages: [
          { role: 'system', content: 'You are a topic analyzer. Extract the main topic from user messages concisely.' },
          { role: 'user', content: topicPrompt },
        ],
        temperature: 0.3,
        tools: [],
      });

      return response.content?.trim() || userMessage.substring(0, 50);
    } catch {
      return userMessage.length < 50 ? userMessage : userMessage.substring(0, 50);
    }
  }

  async updateConversationTopic(conversationId: string, topic: string): Promise<void> {
    const conversationStore = this.deps.getRuntime()?.conversationStore ?? null;
    if (!conversationStore) {
      throw new Error('ConversationStore not initialized');
    }

    await conversationStore.updateTopic(conversationId, topic);
  }

  async analyzeAndUpdateTopic(
    userMessage: string,
    conversationId?: string,
    options: { waitFor?: Promise<unknown> } = {},
  ): Promise<string> {
    const actualConversationId = conversationId ?? this.deps.getConversationContext().getActiveConversationId();
    const topicPromise = this.analyzeTopic(userMessage, actualConversationId);

    if (options.waitFor) {
      await options.waitFor;
    }

    const topic = await topicPromise;
    await this.updateConversationTopic(actualConversationId, topic);
    return topic;
  }
}
