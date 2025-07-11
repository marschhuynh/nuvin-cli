import { ProviderConfig, AgentSettings, Message } from '@/types';
import { createProvider, ChatMessage } from '../providers';
import { generateUUID } from '../utils';
import { BaseAgent } from './base-agent';
import type { SendMessageOptions, MessageResponse } from '../agent-manager';

export class LocalAgent extends BaseAgent {
  constructor(settings: AgentSettings, private providerConfig: ProviderConfig, history: Map<string, Message[]>) {
    super(settings, history);
  }

  async sendMessage(content: string, options: SendMessageOptions = {}): Promise<MessageResponse> {
    const startTime = Date.now();
    const messageId = generateUUID();
    const provider = createProvider(this.providerConfig);
    const convoId = options.conversationId || 'default';
    const messages: ChatMessage[] = this.buildContext(convoId, content);

    if (options.stream && provider.generateCompletionStream) {
      let accumulated = '';
      const stream = provider.generateCompletionStream({
        messages,
        model: this.settings.modelConfig.model,
        temperature: this.settings.modelConfig.temperature,
        maxTokens: this.settings.modelConfig.maxTokens,
        topP: this.settings.modelConfig.topP
      });

      for await (const chunk of stream) {
        accumulated += chunk;
        options.onChunk?.(chunk);
      }

      const timestamp = new Date().toISOString();
      const response: MessageResponse = {
        id: messageId,
        content: accumulated,
        role: 'assistant',
        timestamp,
        metadata: {
          agentType: 'local',
          agentId: this.settings.id,
          provider: this.providerConfig.type,
          model: this.settings.modelConfig.model,
          responseTime: Date.now() - startTime
        }
      };

      this.addToHistory(convoId, [
        { id: generateUUID(), role: 'user', content, timestamp },
        { id: generateUUID(), role: 'assistant', content: accumulated, timestamp }
      ]);

      options.onComplete?.(accumulated);
      return response;
    }

    const result = await provider.generateCompletion({
      messages,
      model: this.settings.modelConfig.model,
      temperature: this.settings.modelConfig.temperature,
      maxTokens: this.settings.modelConfig.maxTokens,
      topP: this.settings.modelConfig.topP
    });

    const timestamp = new Date().toISOString();
    const response: MessageResponse = {
      id: messageId,
      content: result.content,
      role: 'assistant',
      timestamp,
      metadata: {
        agentType: 'local',
        agentId: this.settings.id,
        provider: this.providerConfig.type,
        model: this.settings.modelConfig.model,
        responseTime: Date.now() - startTime
      }
    };

    this.addToHistory(convoId, [
      { id: generateUUID(), role: 'user', content, timestamp },
      { id: generateUUID(), role: 'assistant', content: result.content, timestamp }
    ]);

    options.onComplete?.(result.content);
    return response;
  }
}
