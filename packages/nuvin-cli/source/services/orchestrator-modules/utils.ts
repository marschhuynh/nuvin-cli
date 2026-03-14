import type { Message, MetricsPort, MetricsSnapshot, UsageData } from '@nuvin/nuvin-core';
import type { sessionMetricsService as SessionMetricsServiceType } from '../SessionMetricsService.js';

export function messageContentToText(content: Message['content']): string {
  if (content === null) return '';
  if (typeof content === 'string') return content;
  return content.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

export function messagesToText(messages: Message[], opts?: { rolesFilter?: string[] }): string {
  const filtered = opts?.rolesFilter
    ? messages.filter((m) => opts.rolesFilter?.includes(m.role))
    : messages;
  return filtered
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'Tool';
      return `${role}: ${messageContentToText(msg.content)}`;
    })
    .join('\n\n');
}

export class SessionBoundMetricsPort implements MetricsPort {
  constructor(
    private sessionId: string,
    private service: typeof SessionMetricsServiceType,
  ) {}

  recordLLMCall(usage: UsageData, cost?: number): void {
    this.service.recordLLMCall(this.sessionId, usage, cost);
  }

  recordToolCall(): void {
    this.service.recordToolCall(this.sessionId);
  }

  recordRequestComplete(responseTimeMs: number): void {
    this.service.recordRequestComplete(this.sessionId, responseTimeMs);
  }

  setContextWindow(limit: number, usage: number): void {
    this.service.setContextWindow(this.sessionId, limit, usage);
  }

  reset(): void {
    this.service.reset(this.sessionId);
  }

  getSnapshot(): MetricsSnapshot {
    return this.service.getSnapshot(this.sessionId);
  }
}
