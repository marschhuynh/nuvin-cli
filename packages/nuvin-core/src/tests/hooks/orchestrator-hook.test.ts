import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../../orchestrator.js';
import { NoopEventPort } from '../../events.js';
import { HookPort, HookContext, HookResult, HookEventTypes } from '../../hooks/types.js';
import type { MemoryPort, Message, ToolPort, LLMPort, ToolExecutionResult, ChatMessage, ToolInvocation } from '../../ports.js';

// Minimal mock implementations
const createMockMemory = (): MemoryPort<Message> => ({
  get: vi.fn().mockResolvedValue([]),
  set: vi.fn().mockResolvedValue(undefined),
});

const createMockToolPort = (): ToolPort => ({
  list: vi.fn().mockReturnValue([
    { name: 'bash_tool', description: 'Run bash commands', inputSchema: {} },
  ]),
  executeToolCalls: vi.fn().mockResolvedValue([
    { id: 'tool-1', name: 'bash_tool', status: 'success', type: 'text', result: 'ok', durationMs: 10 },
  ] satisfies ToolExecutionResult[]),
});

const createMockLLM = (): LLMPort => ({
  complete: vi.fn().mockResolvedValue({
    role: 'assistant',
    content: 'Done',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5 },
    cacheReadTokens: 0,
    cacheCreatedTokens: 0,
  }),
  getModels: vi.fn().mockResolvedValue([]),
});

describe('Hook Integration', () => {
  let mockHookPort: HookPort;
  let mockTools: ToolPort;
  let mockMemory: MemoryPort<Message>;
  let mockLLM: LLMPort;

  beforeEach(() => {
    mockHookPort = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(true),
    };
    mockTools = createMockToolPort();
    mockMemory = createMockMemory();
    mockLLM = createMockLLM();
  });

  it('should accept hookPort in constructor', () => {
    const orchestrator = new AgentOrchestrator(
      {
        id: 'test',
        systemPrompt: 'You are a test agent',
        temperature: 0.7,
        topP: 0.9,
        model: 'test-model',
      },
      {
        memory: mockMemory,
        tools: mockTools,
        events: new NoopEventPort(),
        llm: mockLLM,
        hookPort: mockHookPort,
      }
    );

    expect(orchestrator).toBeDefined();
  });

  it('should allow setting hookPort after construction', () => {
    const orchestrator = new AgentOrchestrator(
      {
        id: 'test',
        systemPrompt: 'You are a test agent',
        temperature: 0.7,
        topP: 0.9,
        model: 'test-model',
      },
      {
        memory: mockMemory,
        tools: mockTools,
        events: new NoopEventPort(),
        llm: mockLLM,
      }
    );

    orchestrator.setHookPort(mockHookPort);
    expect(orchestrator.getHookPort()).toBe(mockHookPort);
  });

  it('should have hasHooks method that checks hookPort', () => {
    const orchestrator = new AgentOrchestrator(
      {
        id: 'test',
        systemPrompt: 'You are a test agent',
        temperature: 0.7,
        topP: 0.9,
        model: 'test-model',
      },
      {
        memory: mockMemory,
        tools: mockTools,
        events: new NoopEventPort(),
        llm: mockLLM,
        hookPort: mockHookPort,
      }
    );

    expect(orchestrator.hasHooks(HookEventTypes.PreToolUse)).toBe(true);
    expect(mockHookPort.hasHooks).toHaveBeenCalledWith(HookEventTypes.PreToolUse, undefined);
  });

  it('should return false for hasHooks when no hookPort', () => {
    const orchestrator = new AgentOrchestrator(
      {
        id: 'test',
        systemPrompt: 'You are a test agent',
        temperature: 0.7,
        topP: 0.9,
        model: 'test-model',
      },
      {
        memory: mockMemory,
        tools: mockTools,
        events: new NoopEventPort(),
        llm: mockLLM,
      }
    );

    expect(orchestrator.hasHooks(HookEventTypes.PreToolUse)).toBe(false);
  });
});
