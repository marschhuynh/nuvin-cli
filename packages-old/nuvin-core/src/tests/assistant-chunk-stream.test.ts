import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestrator';
import {
  AgentEventTypes,
  type AgentEvent,
  type LLMPort,
  type ToolPort,
  type MemoryPort,
  type ContextBuilder,
  type IdGenerator,
  type Clock,
  type CostCalculator,
  type RemindersPort,
  type EventPort,
  type AgentConfig,
} from '../ports';

describe('AgentOrchestrator streaming AssistantChunk handling', () => {
  it('strips leading newlines from streamed assistant chunks before emitting', async () => {
    const events: AgentEvent[] = [];

    const deps: {
      memory: MemoryPort;
      llm: LLMPort;
      tools: ToolPort;
      context: ContextBuilder;
      ids: IdGenerator;
      clock: Clock;
      cost: CostCalculator;
      reminders: RemindersPort;
      events: EventPort;
    } = {
      memory: {
        async get() {
          return [];
        },
        async append() {},
        async set() {},
        async keys() {
          return [];
        },
        async delete() {},
        async clear() {},
        async exportSnapshot() {
          return {};
        },
        async importSnapshot() {},
      },
      llm: {
        async streamCompletion(_params, handlers?: { onChunk?: (d: string) => Promise<void> }) {
          if (handlers?.onChunk) {
            await handlers.onChunk('\n\n##');
            await handlers.onChunk(' Codebase Review');
            await handlers.onChunk(' - done');
          }
          return { content: '\n\n## Codebase Review - done' };
        },
        async generateCompletion() {
          return { content: '' };
        },
      },
      tools: {
        getToolDefinitions() {
          return [];
        },
        async executeToolCalls() {
          return [];
        },
      },
      context: {
        toProviderMessages() {
          return [];
        },
      },
      ids: {
        uuid() {
          return 'fixed-uuid';
        },
      },
      clock: {
        now() {
          return Date.now();
        },
        iso() {
          return new Date().toISOString();
        },
      },
      cost: {
        estimate() {
          return 0;
        },
      },
      reminders: {
        enhance(s: string) {
          return [s];
        },
      },
      events: {
        emit(e: AgentEvent) {
          events.push(e);
        },
      },
    };

    const cfg: AgentConfig = { id: 'agent', systemPrompt: '', topP: 1, model: 'echo', temperature: 0.0 };
    const orch = new AgentOrchestrator(cfg, deps);

    await orch.send('hello', { conversationId: 'cli', stream: true });

    const chunkEvents = events.filter((e) => e.type === AgentEventTypes.AssistantChunk).map((e) => e.delta);
    expect(chunkEvents[0]).toBe('##');
    expect(chunkEvents[1]).toBe(' Codebase Review');
    expect(chunkEvents[2]).toBe(' - done');
  });
});
