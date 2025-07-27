import type { AgentSettings, Message } from '@/types';
import type { ChatMessage } from '../providers';
import type { SendMessageOptions, MessageResponse } from '../agent-manager';
import { parseToolCalls } from '../utils/tool-call-parser';

export abstract class BaseAgent {
  constructor(
    protected agentSettings: AgentSettings,
    protected conversationHistory: Map<string, Message[]>,
  ) {}

  setSettings(agentSettings: AgentSettings) {
    this.agentSettings = agentSettings;
  }

  abstract sendMessage(
    content: string,
    options?: SendMessageOptions,
  ): Promise<MessageResponse>;

  abstract cancel(): void;

  async streamMessage(
    content: string,
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

  buildContext(conversationId: string, content: string): ChatMessage[] {
    const history = this.retrieveMemory(conversationId);
    const transformedHistory: ChatMessage[] = [];
    
    // Transform history messages to split tool calls
    for (const message of history) {
      // Parse tool calls from message content
      const parsed = parseToolCalls(message.content);
      
      if (parsed.hasToolCalls) {
        // Add any text before tool calls as a regular message
        // If textParts.length > 1, textParts[0] is text before tool calls
        // If textParts.length === 1, textParts[0] is text after tool calls
        if (parsed.textParts.length > 1 && parsed.textParts[0]) {
          transformedHistory.push({
            role: message.role,
            content: parsed.textParts[0],
          });
        }
        
        // Transform tool calls into OpenAI-compatible format
        // Add assistant message with tool calls
        const toolCalls = parsed.toolCalls.map(toolCall => ({
          id: toolCall.id,
          type: 'function' as const,
          function: {
            name: toolCall.name,
            arguments: typeof toolCall.arguments === 'string' ? toolCall.arguments : JSON.stringify(toolCall.arguments),
          }
        }));
        
        transformedHistory.push({
          role: 'assistant',
          content: null,
          tool_calls: toolCalls,
        });
        
        // Add tool result messages if results exist
        for (const toolCall of parsed.toolCalls) {
          if (toolCall.result) {
            transformedHistory.push({
              role: 'tool',
              content: typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result),
              tool_call_id: toolCall.id,
              name: toolCall.name,
            });
          }
        }
        
        // Add any text after tool calls
        if (parsed.textParts.length === 1 && parsed.textParts[0]) {
          // Only one text part means it's text after tool calls
          transformedHistory.push({
            role: message.role,
            content: parsed.textParts[0],
          });
        } else if (parsed.textParts.length > 1) {
          // Multiple text parts means we have text before and after
          for (let i = 1; i < parsed.textParts.length; i++) {
            if (parsed.textParts[i]) {
              transformedHistory.push({
                role: message.role,
                content: parsed.textParts[i],
              });
            }
          }
        }
      } else {
        // Regular message without tool calls
        transformedHistory.push({
          role: message.role,
          content: message.content,
        });
      }
    }
    
    return [
      { role: 'system', content: this.agentSettings.systemPrompt },
      ...transformedHistory,
      { role: 'user', content },
    ];
  }
}
