import { AgentSettings, Message } from '@/types';
import type { ChatMessage } from '../providers';
import type { SendMessageOptions, MessageResponse } from '../agent-manager';

export abstract class BaseAgent {
  constructor(
    protected settings: AgentSettings,
    protected conversationHistory: Map<string, Message[]>
  ) {}

  setSettings(settings: AgentSettings) {
    this.settings = settings;
  }

  abstract sendMessage(content: string, options?: SendMessageOptions): Promise<MessageResponse>;

  async streamMessage(content: string, options?: SendMessageOptions): Promise<MessageResponse> {
    return this.sendMessage(content, options);
  }

  retrieveMemory(conversationId: string): Message[] {
    return this.conversationHistory.get(conversationId) || [];
  }

  protected addToHistory(conversationId: string, messages: Message[]): void {
    const existing = this.conversationHistory.get(conversationId) || [];
    this.conversationHistory.set(conversationId, [...existing, ...messages]);
  }

  buildContext(conversationId: string, content: string): ChatMessage[] {
    const history = this.retrieveMemory(conversationId);
    return [
      { role: 'system', content: this.settings.modelConfig.systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content }
    ];
  }
}
