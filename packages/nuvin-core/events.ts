import type { AgentEvent, EventPort, MemoryPort } from './ports.js';
import { AgentEventTypes } from './ports.js';
import { PersistedMemory, JsonFileMemoryPersistence } from './persistent/index.js';

export class NoopEventPort implements EventPort {
  emit(_event: AgentEvent): void {}
}

export class CallbackEventPort implements EventPort {
  constructor(private handler: (event: AgentEvent) => void | Promise<void>) {}
  emit(event: AgentEvent): void | Promise<void> {
    return this.handler(event);
  }
}

export class ConsoleEventPort implements EventPort {
  emit(event: AgentEvent): void {
    try {
      // Keep logs compact but useful
      switch (event.type) {
        case AgentEventTypes.MessageStarted:
          console.log('[agent] start', {
            convo: event.conversationId,
            id: event.messageId,
            tools: event.toolNames,
            content: event.userContent,
          });
          break;
        case AgentEventTypes.ToolCalls:
          console.log('[agent] tool_calls', event.toolCalls);
          break;
        case AgentEventTypes.ToolResult:
          console.log('[agent] tool_result', event.result);
          break;
        case AgentEventTypes.AssistantMessage:
          console.log('[agent] assistant', event.content);
          break;
        case AgentEventTypes.Done:
          console.log('[agent] done', { ms: event.responseTimeMs, usage: event.usage });
          break;
        case AgentEventTypes.Error:
          console.warn('[agent] error', event.error);
          break;
      }
    } catch {
      // ignore logging errors
    }
  }
}

export class PersistingConsoleEventPort implements EventPort {
  private memory: MemoryPort<AgentEvent>;
  private maxPerConversation: number;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(opts?: { memory?: MemoryPort<AgentEvent>; filename?: string; maxPerConversation?: number }) {
    this.memory =
      opts?.memory ??
      new PersistedMemory<AgentEvent>(new JsonFileMemoryPersistence<AgentEvent>(opts?.filename || 'events.json'));
    this.maxPerConversation = opts?.maxPerConversation ?? 500;
  }

  async emit(event: AgentEvent): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const key = event?.conversationId ?? 'default';
        const existing = await this.memory.get(key);
        const next = [...existing, { ...event }];

        const max = this.maxPerConversation;
        const trimmed = max > 0 && next.length > max ? next.slice(next.length - max) : next;
        await this.memory.set(key, trimmed);
      } catch {
        // ignore persistence errors
      }
    });
    return this.writeQueue;
  }
}
