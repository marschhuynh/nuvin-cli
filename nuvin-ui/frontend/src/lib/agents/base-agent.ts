import type { AgentSettings, Message } from '@/types';
import type { ChatMessage } from '../providers';
import type { SendMessageOptions, MessageResponse } from './agent-manager';

export abstract class BaseAgent {
  constructor(
    protected agentSettings: AgentSettings,
    protected conversationHistory: Map<string, Message[]>,
  ) {}

  setSettings(agentSettings: AgentSettings) {
    this.agentSettings = agentSettings;
  }

  abstract sendMessage(
    content: string[],
    options?: SendMessageOptions,
  ): Promise<MessageResponse>;

  abstract cancel(): void;

  async streamMessage(
    content: string[],
    options?: SendMessageOptions,
  ): Promise<MessageResponse> {
    return this.sendMessage(content, options);
  }

  retrieveMemory(conversationId: string): Message[] {
    return this.conversationHistory.get(conversationId) || [];
  }

  protected addToHistory(conversationId: string, messages: Message[]): void {
    const existing = this.conversationHistory.get(conversationId) || [];
    console.log('Adding to history:', conversationId, messages);
    this.conversationHistory.set(conversationId, [...existing, ...messages]);
  }

  buildContext(conversationId: string, content: string[]): ChatMessage[] {
    const history = this.retrieveMemory(conversationId);
    const transformedHistory: ChatMessage[] = [];

    // Transform history messages, handling tool call messages
    for (const message of history) {
      if (message.role === 'tool' && message.toolCall) {
        // Handle tool call messages - convert to OpenAI format
        // First add the assistant message with tool call
        transformedHistory.push({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: message.toolCall.id,
              type: 'function' as const,
              function: {
                name: message.toolCall.name,
                arguments:
                  typeof message.toolCall.arguments === 'string'
                    ? message.toolCall.arguments
                    : JSON.stringify(message.toolCall.arguments),
              },
            },
          ],
        });

        // Then add the tool result if available
        if (message.toolCall.result) {
          transformedHistory.push({
            role: 'tool',
            content: JSON.stringify(message.toolCall.result),
            tool_call_id: message.toolCall.id,
          });
        }
      } else {
        // Regular user or assistant message
        transformedHistory.push({
          role: message.role === 'tool' ? 'assistant' : message.role, // Convert tool role to assistant if no toolCall
          content: message.content,
        });
      }
    }

    const userMessage: ChatMessage[] = Array.isArray(content)
      ? content.map((msg) => ({
          role: 'user',
          content: msg,
        }))
      : [
          {
            role: 'user',
            content,
          },
        ];

    return [
      { role: 'system', content: this.agentSettings.systemPrompt },
      ...transformedHistory,
      ...userMessage,
    ];
  }
}
