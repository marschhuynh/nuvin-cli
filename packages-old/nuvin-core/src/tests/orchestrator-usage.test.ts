import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import type {
  LLMPort,
  ToolPort,
  MemoryPort,
  Message,
  ContextBuilder,
  IdGenerator,
  Clock,
  CostCalculator,
  RemindersPort,
  EventPort,
  AgentEvent,
  CompletionParams,
  CompletionResult,
  UsageData,
} from '../ports.js';
import { AgentEventTypes } from '../ports.js';

describe('AgentOrchestrator - Usage Data During Tool Calls', () => {
  let orchestrator: AgentOrchestrator;
  let mockLLM: LLMPort;
  let mockTools: ToolPort;
  let mockMemory: MemoryPort<Message>;
  let mockContext: ContextBuilder;
  let mockIds: IdGenerator;
  let mockClock: Clock;
  let mockCost: CostCalculator;
  let mockReminders: RemindersPort;
  let mockEvents: EventPort;
  let emittedEvents: AgentEvent[];

  beforeEach(() => {
    emittedEvents = [];

    mockMemory = {
      get: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue(undefined),
      exportSnapshot: vi.fn().mockResolvedValue({}),
      importSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    mockTools = {
      getToolDefinitions: vi.fn().mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      ]),
      executeToolCalls: vi.fn().mockResolvedValue([
        {
          id: 'call_1',
          name: 'test_tool',
          status: 'success',
          type: 'text',
          result: 'Tool executed successfully',
          durationMs: 100,
        },
      ]),
    };

    mockContext = {
      toProviderMessages: vi.fn().mockReturnValue([{ role: 'user', content: 'test' }]),
    };

    let idCounter = 0;
    mockIds = {
      uuid: vi.fn(() => `id-${idCounter++}`),
    };

    mockClock = {
      now: vi.fn(() => Date.now()),
      iso: vi.fn(() => new Date().toISOString()),
    };

    mockCost = {
      estimate: vi.fn(() => 0.001),
    };

    mockReminders = {
      enhance: vi.fn((content: string) => [content]),
    };

    mockEvents = {
      emit: vi.fn((event: AgentEvent) => {
        emittedEvents.push(event);
        return Promise.resolve();
      }),
    };

    mockLLM = {
      generateCompletion: vi.fn(),
      streamCompletion: vi.fn(),
    };

    orchestrator = new AgentOrchestrator(
      {
        id: 'test-agent',
        systemPrompt: 'Test system prompt',
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
        enabledTools: ['test_tool'],
        maxToolConcurrency: 3,
        requireToolApproval: false,
      },
      {
        memory: mockMemory,
        llm: mockLLM,
        tools: mockTools,
        context: mockContext,
        ids: mockIds,
        clock: mockClock,
        cost: mockCost,
        reminders: mockReminders,
        events: mockEvents,
      },
    );
  });

  it('should emit usage data in AssistantChunk events during initial streaming', async () => {
    const usageData: UsageData = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };

    const firstResponse: CompletionResult = {
      content: 'Initial response',
      usage: usageData,
    };

    vi.mocked(mockLLM.streamCompletion).mockImplementation(async (params, handlers) => {
      await handlers?.onChunk?.('Initial', usageData);
      await handlers?.onChunk?.(' response', usageData);
      return firstResponse;
    });

    await orchestrator.send('test message', { stream: true });

    const chunkEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.AssistantChunk);
    expect(chunkEvents).toHaveLength(2);
    expect(chunkEvents[0]).toMatchObject({
      type: AgentEventTypes.AssistantChunk,
      delta: 'Initial',
      usage: usageData,
    });
    expect(chunkEvents[1]).toMatchObject({
      type: AgentEventTypes.AssistantChunk,
      delta: ' response',
      usage: usageData,
    });
  });

  it('should emit usage data in AssistantChunk events during tool call streaming', async () => {
    const initialUsage: UsageData = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };

    const toolCallUsage: UsageData = {
      prompt_tokens: 150,
      completion_tokens: 75,
      total_tokens: 225,
    };

    const firstResponse: CompletionResult = {
      content: '',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'test_tool',
            arguments: '{}',
          },
        },
      ],
      usage: initialUsage,
    };

    const secondResponse: CompletionResult = {
      content: 'Response after tool execution',
      usage: toolCallUsage,
    };

    let callCount = 0;
    vi.mocked(mockLLM.streamCompletion).mockImplementation(async (params, handlers) => {
      if (callCount === 0) {
        callCount++;
        return firstResponse;
      }

      await handlers?.onChunk?.('Response', toolCallUsage);
      await handlers?.onChunk?.(' after', toolCallUsage);
      await handlers?.onChunk?.(' tool', toolCallUsage);
      await handlers?.onChunk?.(' execution', toolCallUsage);
      return secondResponse;
    });

    await orchestrator.send('test message', { stream: true });

    const chunkEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.AssistantChunk);

    const toolCallChunks = chunkEvents.slice(-4);
    expect(toolCallChunks).toHaveLength(4);

    toolCallChunks.forEach((event) => {
      expect(event).toHaveProperty('usage');
      expect(event.usage).toEqual(toolCallUsage);
    });

    expect(toolCallChunks[0]).toMatchObject({
      type: AgentEventTypes.AssistantChunk,
      delta: 'Response',
      usage: toolCallUsage,
    });
    expect(toolCallChunks[1]).toMatchObject({
      type: AgentEventTypes.AssistantChunk,
      delta: ' after',
      usage: toolCallUsage,
    });
    expect(toolCallChunks[2]).toMatchObject({
      type: AgentEventTypes.AssistantChunk,
      delta: ' tool',
      usage: toolCallUsage,
    });
    expect(toolCallChunks[3]).toMatchObject({
      type: AgentEventTypes.AssistantChunk,
      delta: ' execution',
      usage: toolCallUsage,
    });
  });

  it('should emit final usage data in Done event', async () => {
    const finalUsage: UsageData = {
      prompt_tokens: 200,
      completion_tokens: 100,
      total_tokens: 300,
    };

    const response: CompletionResult = {
      content: 'Final response',
      usage: finalUsage,
    };

    vi.mocked(mockLLM.streamCompletion).mockImplementation(async (params, handlers) => {
      await handlers?.onChunk?.('Final', finalUsage);
      await handlers?.onChunk?.(' response', finalUsage);
      return response;
    });

    await orchestrator.send('test message', { stream: true });

    const doneEvent = emittedEvents.find((e) => e.type === AgentEventTypes.Done);
    expect(doneEvent).toBeDefined();
    expect(doneEvent).toMatchObject({
      type: AgentEventTypes.Done,
      usage: finalUsage,
    });
  });

  it('should handle multiple tool call rounds with usage data', async () => {
    const round1Usage: UsageData = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    const round2Usage: UsageData = { prompt_tokens: 150, completion_tokens: 75, total_tokens: 225 };
    const round3Usage: UsageData = { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 };

    const response1: CompletionResult = {
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'test_tool', arguments: '{}' } }],
      usage: round1Usage,
    };

    const response2: CompletionResult = {
      content: '',
      tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'test_tool', arguments: '{}' } }],
      usage: round2Usage,
    };

    const response3: CompletionResult = {
      content: 'Final response',
      usage: round3Usage,
    };

    let callCount = 0;
    vi.mocked(mockLLM.streamCompletion).mockImplementation(async (params, handlers) => {
      callCount++;
      if (callCount === 1) {
        return response1;
      } else if (callCount === 2) {
        await handlers?.onChunk?.('After', round2Usage);
        await handlers?.onChunk?.(' first', round2Usage);
        await handlers?.onChunk?.(' tool', round2Usage);
        return response2;
      } else {
        await handlers?.onChunk?.('Final', round3Usage);
        await handlers?.onChunk?.(' response', round3Usage);
        return response3;
      }
    });

    await orchestrator.send('test message', { stream: true });

    const chunkEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.AssistantChunk);

    const round2Chunks = chunkEvents.slice(0, 3);
    round2Chunks.forEach((event) => {
      expect(event.usage).toEqual(round2Usage);
    });

    const round3Chunks = chunkEvents.slice(-2);
    round3Chunks.forEach((event) => {
      expect(event.usage).toEqual(round3Usage);
    });

    const doneEvent = emittedEvents.find((e) => e.type === AgentEventTypes.Done);
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.usage).toEqual(round3Usage);
  });

  it('should handle streaming without usage data gracefully', async () => {
    const response: CompletionResult = {
      content: 'Response without usage',
    };

    vi.mocked(mockLLM.streamCompletion).mockImplementation(async (params, handlers) => {
      await handlers?.onChunk?.('Response', undefined);
      await handlers?.onChunk?.(' without', undefined);
      await handlers?.onChunk?.(' usage', undefined);
      return response;
    });

    await orchestrator.send('test message', { stream: true });

    const chunkEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.AssistantChunk);
    expect(chunkEvents).toHaveLength(3);

    chunkEvents.forEach((event) => {
      expect(event).not.toHaveProperty('usage');
    });

    const doneEvent = emittedEvents.find((e) => e.type === AgentEventTypes.Done);
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.usage).toBeUndefined();
  });

  it('should emit usage in AssistantMessage events when not streaming', async () => {
    const usageData: UsageData = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };

    const response: CompletionResult = {
      content: 'Non-streaming response',
      usage: usageData,
    };

    vi.mocked(mockLLM.generateCompletion).mockResolvedValue(response);

    await orchestrator.send('test message', { stream: false });

    const messageEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.AssistantMessage);
    expect(messageEvents.length).toBeGreaterThan(0);

    const finalMessageEvent = messageEvents[messageEvents.length - 1];
    expect(finalMessageEvent).toMatchObject({
      type: AgentEventTypes.AssistantMessage,
      content: 'Non-streaming response',
      usage: usageData,
    });

    const doneEvent = emittedEvents.find((e) => e.type === AgentEventTypes.Done);
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.usage).toEqual(usageData);
  });
});
