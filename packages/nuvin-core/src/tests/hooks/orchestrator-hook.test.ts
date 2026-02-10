import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../../orchestrator.js';
import { NoopEventPort } from '../../events.js';
import { HookPort, HookContext, HookResult, HookEventTypes } from '../../hooks/types.js';
import type {
  MemoryPort,
  Message,
  ToolPort,
  LLMPort,
  ToolExecutionResult,
  EventPort,
  AgentEvent,
  ToolDefinition,
  ToolInvocation,
  CompletionResult,
  ContextBuilder,
  IdGenerator,
  Clock,
  CostCalculator,
  RemindersPort,
} from '../../ports.js';
import { AgentEventTypes } from '../../ports.js';

describe('Hook Integration', () => {
  let mockHookPort: HookPort;
  let mockTools: ToolPort;
  let mockMemory: MemoryPort<Message>;
  let mockLLM: LLMPort;
  let mockContext: ContextBuilder;
  let mockIds: IdGenerator;
  let mockClock: Clock;
  let mockCost: CostCalculator;
  let mockReminders: RemindersPort;
  let mockEvents: EventPort;
  let emittedEvents: AgentEvent[];
  let idCounter: number;

  beforeEach(() => {
    emittedEvents = [];
    idCounter = 0;

    mockHookPort = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(true),
    };

    mockMemory = {
      get: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockResolvedValue(undefined),
    };

    mockTools = {
      list: vi.fn().mockReturnValue([
        { name: 'bash_tool', description: 'Run bash commands', inputSchema: {} },
      ]),
      getToolDefinitions: vi.fn().mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'bash_tool',
            description: 'Run bash commands',
            parameters: { type: 'object', properties: {} },
          },
        } as ToolDefinition,
      ]),
      executeToolCalls: vi.fn().mockImplementation(async (invocations: ToolInvocation[]) => {
        return invocations.map((inv) => ({
          id: inv.id,
          name: inv.name,
          status: 'success' as const,
          type: 'text' as const,
          result: `Executed ${inv.name}`,
          durationMs: 10,
        }));
      }),
    };

    mockLLM = {
      generateCompletion: vi.fn(),
      streamCompletion: vi.fn(),
    };

    mockContext = {
      toProviderMessages: vi.fn().mockReturnValue([{ role: 'user', content: 'test' }]),
    };

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
  });

  const createOrchestrator = (hookPort?: HookPort, requireToolApproval = false) => {
    return new AgentOrchestrator(
      {
        id: 'test',
        systemPrompt: 'You are a test agent',
        temperature: 0.7,
        topP: 0.9,
        model: 'test-model',
        enabledTools: ['bash_tool'],
        requireToolApproval,
      },
      {
        memory: mockMemory,
        tools: mockTools,
        events: mockEvents,
        llm: mockLLM,
        context: mockContext,
        ids: mockIds,
        clock: mockClock,
        cost: mockCost,
        reminders: mockReminders,
        hookPort,
      }
    );
  };

  it('should accept hookPort in constructor', () => {
    const orchestrator = createOrchestrator(mockHookPort);
    expect(orchestrator).toBeDefined();
  });

  it('should allow setting hookPort after construction', () => {
    const orchestrator = createOrchestrator();
    orchestrator.setHookPort(mockHookPort);
    expect(orchestrator.getHookPort()).toBe(mockHookPort);
  });

  it('should have hasHooks method that checks hookPort', () => {
    const orchestrator = createOrchestrator(mockHookPort);
    expect(orchestrator.hasHooks(HookEventTypes.PreToolUse)).toBe(true);
    expect(mockHookPort.hasHooks).toHaveBeenCalledWith(HookEventTypes.PreToolUse, undefined);
  });

  it('should return false for hasHooks when no hookPort', () => {
    const orchestrator = createOrchestrator();
    expect(orchestrator.hasHooks(HookEventTypes.PreToolUse)).toBe(false);
  });

  it('should trigger PermissionRequest hook when tool requires approval', async () => {
    // Setup hook port that only has PermissionRequest hooks
    const permissionHookPort: HookPort = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockImplementation((event: string) => {
        return event === HookEventTypes.PermissionRequest;
      }),
    };

    const orchestrator = createOrchestrator(permissionHookPort, true); // Enable tool approval

    // Setup LLM to return a tool call, then a final response
    const toolCallResponse: CompletionResult = {
      content: '',
      tool_calls: [
        { id: 'tc-1', type: 'function', function: { name: 'bash_tool', arguments: '{"cmd":"echo hello"}' } },
      ],
    };
    const finalResponse: CompletionResult = {
      content: 'Done',
    };

    let callCount = 0;
    vi.mocked(mockLLM.generateCompletion).mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? toolCallResponse : finalResponse;
    });

    // Start the send in background - it will wait for approval
    const sendPromise = orchestrator.send('run echo hello', { stream: false });

    // Wait for ToolCalls event to be emitted
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify ToolCalls event was emitted
    const toolCallsEvent = emittedEvents.find(e => e.type === AgentEventTypes.ToolCalls);
    expect(toolCallsEvent).toBeDefined();

    // Verify PermissionRequest hook was called
    expect(permissionHookPort.executeHook).toHaveBeenCalledWith(
      expect.objectContaining({
        hookEvent: HookEventTypes.PermissionRequest,
        toolName: 'bash_tool',
        permissionType: 'tool_approval',
      })
    );

    // Now approve the tool to complete the test
    const approvalId = (toolCallsEvent as { toolCalls: Array<{ approvalId?: string }> }).toolCalls[0]?.approvalId;
    if (approvalId) {
      orchestrator.handleToolApproval(approvalId, 'approve');
    }

    // Wait for completion
    const result = await sendPromise;
    expect(result.content).toBe('Done');
  });
});
