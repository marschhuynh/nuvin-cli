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
  CompletionResult,
  ToolInvocation,
} from '../ports.js';

describe('AgentOrchestrator - Abort Memory Persistence', () => {
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
  let savedMessages: Message[];

  beforeEach(() => {
    savedMessages = [];

    mockMemory = {
      get: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockImplementation(async (key: string, messages: Message[]) => {
        savedMessages.push(...messages);
      }),
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
        {
          type: 'function',
          function: {
            name: 'assign_task',
            description: 'Assign a task to a specialist agent',
            parameters: { type: 'object', properties: { agent: { type: 'string' }, task: { type: 'string' }, description: { type: 'string' } }, required: ['agent', 'task', 'description'] },
          },
        },
      ]),
      executeToolCalls: vi.fn(),
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
      emit: vi.fn().mockResolvedValue(undefined),
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
        enabledTools: ['test_tool', 'assign_task'],
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

  describe('No duplicate messages on abort', () => {
    it('should not save duplicate assistant message when aborted after tool execution', async () => {
      const controller = new AbortController();

      const firstResponse: CompletionResult = {
        content: 'Using test tool',
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
      };

      vi.mocked(mockTools.executeToolCalls).mockResolvedValue([
        {
          id: 'call_1',
          name: 'test_tool',
          status: 'success',
          type: 'text',
          result: 'Tool executed successfully',
          durationMs: 100,
        },
      ]);

      let callCount = 0;
      vi.mocked(mockLLM.generateCompletion).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return firstResponse;
        }
        // Abort during second LLM call
        controller.abort();
        throw new Error('Aborted');
      });

      await expect(orchestrator.send('test message', { signal: controller.signal })).rejects.toThrow('Aborted');

      // Verify saved messages
      const assistantMessages = savedMessages.filter((m) => m.role === 'assistant');
      const toolMessages = savedMessages.filter((m) => m.role === 'tool');
      const userMessages = savedMessages.filter((m) => m.role === 'user');

      // Should have: 1 user message, 1 assistant message with tool_calls, 1 tool result
      expect(userMessages).toHaveLength(1);
      expect(assistantMessages).toHaveLength(1);
      expect(toolMessages).toHaveLength(1);

      // Verify assistant message has tool_calls
      expect(assistantMessages[0].tool_calls).toBeDefined();
      expect(assistantMessages[0].tool_calls).toHaveLength(1);
      expect(assistantMessages[0].tool_calls?.[0].id).toBe('call_1');

      // Verify no duplicate assistant messages
      const assistantIds = assistantMessages.map((m) => m.id);
      const uniqueAssistantIds = new Set(assistantIds);
      expect(assistantIds.length).toBe(uniqueAssistantIds.size);
    });

    it('should not save duplicate assistant message when aborted during tool execution', async () => {
      const controller = new AbortController();

      const firstResponse: CompletionResult = {
        content: 'Using test tool',
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
      };

      vi.mocked(mockLLM.generateCompletion).mockResolvedValue(firstResponse);

      vi.mocked(mockTools.executeToolCalls).mockImplementation(async () => {
        controller.abort();
        return [
          {
            id: 'call_1',
            name: 'test_tool',
            status: 'error',
            type: 'text',
            result: 'Tool execution aborted by user',
            durationMs: 0,
          },
        ];
      });

      await expect(orchestrator.send('test message', { signal: controller.signal })).rejects.toThrow();

      // Verify saved messages
      const assistantMessages = savedMessages.filter((m) => m.role === 'assistant');
      const toolMessages = savedMessages.filter((m) => m.role === 'tool');

      // Should have: 1 assistant message with tool_calls, 1 tool abort result
      expect(assistantMessages).toHaveLength(1);
      expect(toolMessages).toHaveLength(1);

      // Verify tool result shows abort
      expect(toolMessages[0].content).toBe('Tool execution aborted by user');

      // Verify no duplicate assistant messages
      const assistantIds = assistantMessages.map((m) => m.id);
      const uniqueAssistantIds = new Set(assistantIds);
      expect(assistantIds.length).toBe(uniqueAssistantIds.size);
    });

    it('should handle streaming abort without duplicates', async () => {
      const controller = new AbortController();

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
      };

      vi.mocked(mockTools.executeToolCalls).mockResolvedValue([
        {
          id: 'call_1',
          name: 'test_tool',
          status: 'success',
          type: 'text',
          result: 'Tool executed',
          durationMs: 100,
        },
      ]);

      let callCount = 0;
      vi.mocked(mockLLM.streamCompletion).mockImplementation(async (params, handlers) => {
        callCount++;
        if (callCount === 1) {
          return firstResponse;
        }
        // Simulate streaming then abort
        await handlers?.onChunk?.('Partial');
        await handlers?.onChunk?.(' content');
        controller.abort();
        throw new Error('Aborted');
      });

      await expect(orchestrator.send('test message', { stream: true, signal: controller.signal })).rejects.toThrow(
        'Aborted',
      );

      // Verify no duplicate assistant messages
      const assistantMessages = savedMessages.filter((m) => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);

      // Should only have the assistant message with tool_calls
      expect(assistantMessages[0].tool_calls).toBeDefined();
    });

    it('should save user message immediately even if abort happens early', async () => {
      const controller = new AbortController();

      vi.mocked(mockLLM.generateCompletion).mockImplementation(async () => {
        controller.abort();
        throw new Error('Aborted');
      });

      await expect(orchestrator.send('test message', { signal: controller.signal })).rejects.toThrow('Aborted');

      // User message should be saved
      const userMessages = savedMessages.filter((m) => m.role === 'user');
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].content).toBe('test message');
    });

    it('should save final response without duplicates when no tool calls', async () => {
      const response: CompletionResult = {
        content: 'Simple response without tools',
      };

      vi.mocked(mockLLM.generateCompletion).mockResolvedValue(response);

      await orchestrator.send('test message');

      const assistantMessages = savedMessages.filter((m) => m.role === 'assistant');

      // Should have exactly 1 assistant message
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].content).toBe('Simple response without tools');
      expect(assistantMessages[0].tool_calls).toBeUndefined();
    });

    it('should handle multiple tool call rounds without duplicates', async () => {
      const response1: CompletionResult = {
        content: 'First tool call',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'test_tool', arguments: '{}' },
          },
        ],
      };

      const response2: CompletionResult = {
        content: 'Second tool call',
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: { name: 'test_tool', arguments: '{}' },
          },
        ],
      };

      const finalResponse: CompletionResult = {
        content: 'Final response',
      };

      let callCount = 0;
      vi.mocked(mockLLM.generateCompletion).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return response1;
        if (callCount === 2) return response2;
        return finalResponse;
      });

      vi.mocked(mockTools.executeToolCalls).mockImplementation(async (invocations: ToolInvocation[]) => {
        return invocations.map((inv) => ({
          id: inv.id,
          name: inv.name,
          status: 'success' as const,
          type: 'text' as const,
          result: 'Success',
          durationMs: 100,
        }));
      });

      await orchestrator.send('test message');

      const assistantMessages = savedMessages.filter((m) => m.role === 'assistant');
      const toolMessages = savedMessages.filter((m) => m.role === 'tool');

      // Should have: 2 assistant messages with tool_calls + 1 final assistant message
      expect(assistantMessages).toHaveLength(3);
      expect(toolMessages).toHaveLength(2);

      // First two assistant messages should have tool_calls
      expect(assistantMessages[0].tool_calls).toBeDefined();
      expect(assistantMessages[1].tool_calls).toBeDefined();
      expect(assistantMessages[2].tool_calls).toBeUndefined();

      // Verify no duplicates
      const allIds = savedMessages.map((m) => m.id);
      const uniqueIds = new Set(allIds);
      expect(allIds.length).toBe(uniqueIds.size);
    });
  });

  describe('Regression: Real-world abort scenario', () => {
    it('should not duplicate assistant message when sub-agent (assign_task) is aborted', async () => {
      const controller = new AbortController();

      // Simulate assign_task tool call
      const response: CompletionResult = {
        content: "I'll delegate this to the code-reviewer specialist agent to perform a thorough review of the codebase.",
        tool_calls: [
          {
            id: 'toolu_01UyyabdMhNxb31mMZE8D3jG',
            type: 'function',
            function: {
              name: 'assign_task',
              arguments: '{"agent":"code-reviewer","description":"Delegate comprehensive codebase review","task":"Review"}',
            },
          },
        ],
      };

      vi.mocked(mockLLM.generateCompletion).mockResolvedValue(response);

      // Simulate user aborting the sub-agent execution
      vi.mocked(mockTools.executeToolCalls).mockImplementation(async () => {
        controller.abort();
        return [
          {
            id: 'toolu_01UyyabdMhNxb31mMZE8D3jG',
            name: 'assign_task',
            status: 'error',
            type: 'text',
            result: 'Sub-agent execution aborted by user',
            durationMs: 0,
          },
        ];
      });

      await expect(orchestrator.send('let review this code base', { signal: controller.signal })).rejects.toThrow();

      // Verify the history structure matches expected behavior
      const userMessages = savedMessages.filter((m) => m.role === 'user');
      const assistantMessages = savedMessages.filter((m) => m.role === 'assistant');
      const toolMessages = savedMessages.filter((m) => m.role === 'tool');

      // Should have exactly:
      // - 1 user message
      // - 1 assistant message with tool_calls
      // - 1 tool result message (abort)
      expect(userMessages).toHaveLength(1);
      expect(assistantMessages).toHaveLength(1);
      expect(toolMessages).toHaveLength(1);

      // Verify the assistant message structure
      expect(assistantMessages[0]).toMatchObject({
        role: 'assistant',
        content: expect.stringContaining('delegate this to the code-reviewer'),
      });
      expect(assistantMessages[0].tool_calls).toHaveLength(1);
      expect(assistantMessages[0].tool_calls?.[0]).toMatchObject({
        id: 'toolu_01UyyabdMhNxb31mMZE8D3jG',
        function: { name: 'assign_task' },
      });

      // Verify the tool result
      expect(toolMessages[0]).toMatchObject({
        role: 'tool',
        content: 'Sub-agent execution aborted by user',
        tool_call_id: 'toolu_01UyyabdMhNxb31mMZE8D3jG',
        name: 'assign_task',
      });

      // Ensure NO duplicate assistant message without tool_calls
      const assistantWithoutToolCalls = assistantMessages.filter((m) => !m.tool_calls);
      expect(assistantWithoutToolCalls).toHaveLength(0);
    });
  });

  describe('Streaming save behavior', () => {
    it('should save streamed content immediately after streaming completes', async () => {
      const response: CompletionResult = {
        content: 'Streamed content',
      };

      vi.mocked(mockLLM.streamCompletion).mockImplementation(async (params, handlers) => {
        await handlers?.onChunk?.('Streamed');
        await handlers?.onChunk?.(' content');
        await handlers?.onStreamFinish?.();
        return response;
      });

      await orchestrator.send('test message', { stream: true });

      const assistantMessages = savedMessages.filter((m) => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].content).toBe('Streamed content');
    });

    it('should not save partial content on abort during streaming', async () => {
      const controller = new AbortController();

      vi.mocked(mockLLM.streamCompletion).mockImplementation(async (params, handlers) => {
        await handlers?.onChunk?.('Partial');
        controller.abort();
        throw new Error('Aborted');
      });

      await expect(orchestrator.send('test message', { stream: true, signal: controller.signal })).rejects.toThrow(
        'Aborted',
      );

      // Should only have user message, no partial assistant message
      const assistantMessages = savedMessages.filter((m) => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(0);
    });
  });
});
