import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentSwapManager,
  type AgentSwapManagerDeps,
} from '../../source/services/orchestrator-modules/AgentSwapManager.js';
import { InMemoryMemory, ConversationContext } from '@nuvin/nuvin-core';
import type { Message, MemoryPort, AgentOrchestrator, ToolPort, AgentAwareToolPort, LLMPort, ConversationStore, ToolRegistry } from '@nuvin/nuvin-core';
import type { UIHandlers } from '../../source/services/orchestrator-modules/types.js';
import type { OrchestratorRuntime } from '../../source/services/OrchestratorRuntime.js';

// ─── Mock external services ────────────────────────────────────────────────────

// Must use vi.hoisted to ensure mocks are created before module loading
const { mockGetGitContextInfo, mockSkillsService, mockEventBus } = vi.hoisted(() => {
  return {
    mockGetGitContextInfo: vi.fn().mockResolvedValue({
      shell: '/bin/bash',
      gitBranch: 'main',
      gitRepo: 'test-repo',
      recentCommits: '(none)',
    }),
    mockSkillsService: {
      list: vi.fn().mockReturnValue([
        { name: 'test-skill', description: 'A test skill' },
      ]),
      setConfig: vi.fn(),
      discover: vi.fn().mockResolvedValue([]),
    },
    mockEventBus: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
    },
  };
});

vi.mock('../../source/utils/git-context.js', () => ({
  getGitContextInfo: mockGetGitContextInfo,
}));

vi.mock('../../source/services/SkillsService.js', () => ({
  skillsService: mockSkillsService,
}));

vi.mock('../../source/services/EventBus.js', () => ({
  eventBus: mockEventBus,
}));

vi.mock('../../source/services/SessionMetricsService.js', () => ({
  sessionMetricsService: {
    recordLLMCall: vi.fn(),
    recordToolCall: vi.fn(),
    recordRequestComplete: vi.fn(),
    setContextWindow: vi.fn(),
    reset: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({}),
  },
}));

// ─── Test helpers ──────────────────────────────────────────────────────────────

function createMockHandlers(): UIHandlers {
  return {
    appendLine: vi.fn(),
    updateLine: vi.fn(),
    updateLineMetadata: vi.fn(),
    handleError: vi.fn(),
  };
}

function createMockAgentRegistry(agents: Record<string, unknown> = {}) {
  const defaultAgents: Record<string, unknown> = {
    'nuvin': {
      name: 'nuvin',
      description: 'Main nuvin agent',
      instructions: 'You are the main agent. {{injectedSystem}}',
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 4096,
    },
    'code-reviewer': {
      name: 'code-reviewer',
      description: 'Code review specialist',
      instructions: 'You are a code reviewer. {{injectedSystem}}',
      temperature: 0.3,
      allowed_tools: ['file_read', 'grep_tool'],
    },
    ...agents,
  };

  return {
    get: vi.fn((id: string) => defaultAgents[id] ?? null),
    list: vi.fn(() => Object.values(defaultAgents)),
    exists: vi.fn((id: string) => id in defaultAgents),
  };
}

function createMockOrchestrator(overrides: Record<string, unknown> = {}) {
  const agentRegistry = createMockAgentRegistry(overrides.agents as Record<string, unknown> | undefined);
  const tools = {
    execute: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    getAgentRegistry: vi.fn().mockReturnValue(agentRegistry),
  } as unknown as ToolPort & AgentAwareToolPort;

  return {
    getTools: vi.fn().mockReturnValue(tools),
    getConfig: vi.fn().mockReturnValue({
      id: 'nuvin-agent',
      systemPrompt: 'Main system prompt',
      model: 'openai/gpt-4',
      enabledTools: ['bash_tool', 'file_read'],
      maxToolConcurrency: 10,
      requireToolApproval: false,
      reasoningEffort: undefined,
      thinking: 'OFF',
    }),
    setLLM: vi.fn(),
    setMemory: vi.fn(),
    setEvents: vi.fn(),
    setMetrics: vi.fn(),
    setSessionId: vi.fn(),
    send: vi.fn(),
    ...overrides,
  } as unknown as AgentOrchestrator;
}

function createMockLLM(): LLMPort {
  return {
    generateCompletion: vi.fn().mockResolvedValue({ content: 'test' }),
    streamCompletion: vi.fn(),
  } as unknown as LLMPort;
}

function createMockRuntime(
  orchestrator: AgentOrchestrator,
  overrides: Partial<OrchestratorRuntime> = {},
): OrchestratorRuntime {
  return {
    orchestrator,
    memory: new InMemoryMemory<Message>(),
    conversationStore: null as unknown as ConversationStore,
    toolRegistry: null as unknown as ToolRegistry,
    sessionId: null,
    sessionDir: null,
    activeAgentId: 'main',
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<AgentSwapManagerDeps> = {}): AgentSwapManagerDeps {
  const context = new ConversationContext();
  const mockOrchestrator = createMockOrchestrator();
  const mockRuntime = createMockRuntime(mockOrchestrator);

  const patchRuntimeFn = vi.fn((updates: Partial<OrchestratorRuntime>) => {
    Object.assign(mockRuntime, updates);
    return mockRuntime;
  });

  return {
    getRuntime: () => mockRuntime,
    patchRuntime: patchRuntimeFn,
    getHandlers: () => createMockHandlers(),
    getConversationContext: () => context,
    getCurrentConfig: () => ({
      config: { session: { persistEventLog: false }, memory: undefined },
      model: 'openai/gpt-4',
      requireToolApproval: false,
      reasoningEffort: undefined,
      thinking: 'OFF',
    }),
    getEnableSkills: () => true,
    getStreamingChunks: () => true,
    createLLM: () => createMockLLM(),
    createMemory: vi.fn((_sessionDir: string, _agentId: string) => new InMemoryMemory<Message>()),
    createEventAdapter: vi.fn(
      (_sessionDir: string, _handlers: UIHandlers, _persist: boolean, _streaming: boolean) => ({
        /* mock event adapter */
      }),
    ),
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentSwapManager', () => {
  let manager: AgentSwapManager;
  let deps: AgentSwapManagerDeps;

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-initialize mocks after clearAllMocks
    mockGetGitContextInfo.mockResolvedValue({
      shell: '/bin/bash',
      gitBranch: 'main',
      gitRepo: 'test-repo',
      recentCommits: '(none)',
    });
    mockSkillsService.list.mockReturnValue([
      { name: 'test-skill', description: 'A test skill' },
    ]);

    deps = createMockDeps();
    manager = new AgentSwapManager(deps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Construction & initial state ─────────────────────────────────────────

  describe('construction', () => {
    it('starts with activeAgentId = "main" on runtime', () => {
      expect(deps.getRuntime()?.activeAgentId).toBe('main');
    });

    it('starts with previousOrchestrator = null', () => {
      expect(manager.getPreviousOrchestrator()).toBeNull();
    });
  });

  // ── activeAgentId (via runtime) ──────────────────────────────────────────

  describe('activeAgentId', () => {
    it('returns "main" by default', () => {
      expect(deps.getRuntime()?.activeAgentId).toBe('main');
    });

    it('returns the agent ID after swapToAgent', async () => {
      await manager.swapToAgent('code-reviewer');
      expect(deps.getRuntime()?.activeAgentId).toBe('code-reviewer');
    });

    it('returns "main" after swapToMain', async () => {
      // First swap to an agent
      await manager.swapToAgent('code-reviewer');
      expect(deps.getRuntime()?.activeAgentId).toBe('code-reviewer');

      // Then swap back
      await manager.swapToMain();
      expect(deps.getRuntime()?.activeAgentId).toBe('main');
    });
  });

  // ── swapToAgent ──────────────────────────────────────────────────────────

  describe('swapToAgent', () => {
    it('throws when orchestrator is null', async () => {
      deps = createMockDeps({ getRuntime: () => null });
      manager = new AgentSwapManager(deps);

      await expect(manager.swapToAgent('code-reviewer')).rejects.toThrow(
        'Orchestrator not initialized',
      );
    });

    it('throws when handlers are null', async () => {
      deps = createMockDeps({ getHandlers: () => null });
      manager = new AgentSwapManager(deps);

      await expect(manager.swapToAgent('code-reviewer')).rejects.toThrow(
        'Handlers not initialized',
      );
    });

    it('throws when agent is not found', async () => {
      await expect(manager.swapToAgent('non-existent')).rejects.toThrow(
        'Agent "non-existent" not found',
      );
    });

    it('throws when agent registry is not available', async () => {
      const orchestrator = createMockOrchestrator();
      // Return tools without getAgentRegistry
      (orchestrator.getTools as ReturnType<typeof vi.fn>).mockReturnValue({
        execute: vi.fn(),
        list: vi.fn().mockReturnValue([]),
      });

      deps = createMockDeps({ getRuntime: () => createMockRuntime(orchestrator) });
      manager = new AgentSwapManager(deps);

      await expect(manager.swapToAgent('code-reviewer')).rejects.toThrow(
        'Agent registry not available',
      );
    });

    it('patches runtime with new orchestrator', async () => {
      const patchRuntimeSpy = deps.patchRuntime as ReturnType<typeof vi.fn>;

      await manager.swapToAgent('code-reviewer');

      expect(patchRuntimeSpy).toHaveBeenCalledOnce();
      expect(patchRuntimeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orchestrator: expect.anything(),
          memory: expect.anything(),
          activeAgentId: 'code-reviewer',
        }),
      );
    });

    it('patches runtime with new memory', async () => {
      const patchRuntimeSpy = deps.patchRuntime as ReturnType<typeof vi.fn>;

      await manager.swapToAgent('code-reviewer');

      expect(patchRuntimeSpy).toHaveBeenCalledOnce();
      expect(patchRuntimeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          memory: expect.anything(),
        }),
      );
    });

    it('updates activeAgentId via patchRuntime', async () => {
      await manager.swapToAgent('code-reviewer');
      expect(deps.getRuntime()?.activeAgentId).toBe('code-reviewer');
    });

    it('stores previous orchestrator', async () => {
      const orchestrator = createMockOrchestrator();
      const runtime = createMockRuntime(orchestrator);
      deps = createMockDeps({ getRuntime: () => runtime });
      manager = new AgentSwapManager(deps);

      await manager.swapToAgent('code-reviewer');

      expect(manager.getPreviousOrchestrator()).toBe(orchestrator);
    });

    it('preserves conversation history in new memory', async () => {
      const originalMemory = new InMemoryMemory<Message>();
      const context = new ConversationContext();
      const conversationId = context.getActiveConversationId();

      const testMessages: Message[] = [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: new Date().toISOString() },
      ];
      await originalMemory.set(conversationId, testMessages);

      let capturedMemory: MemoryPort<Message> | null = null;
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => {
        if (updates.memory) capturedMemory = updates.memory;
        return { ...createMockRuntime(createMockOrchestrator()), ...updates };
      });

      const orchestrator = createMockOrchestrator();
      deps = createMockDeps({
        getRuntime: () => createMockRuntime(orchestrator, { memory: originalMemory }),
        patchRuntime: patchRuntimeSpy,
        getConversationContext: () => context,
      });
      manager = new AgentSwapManager(deps);

      await manager.swapToAgent('code-reviewer');

      expect(capturedMemory).not.toBeNull();
      const copiedMessages = await capturedMemory?.get(conversationId);
      expect(copiedMessages).toHaveLength(2);
      expect(copiedMessages[0]?.id).toBe('msg-1');
      expect(copiedMessages[1]?.id).toBe('msg-2');
    });

    it('works with empty conversation history', async () => {
      const emptyMemory = new InMemoryMemory<Message>();
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => ({
        ...createMockRuntime(createMockOrchestrator()),
        ...updates,
      }));

      const orchestrator = createMockOrchestrator();
      deps = createMockDeps({
        getRuntime: () => createMockRuntime(orchestrator, { memory: emptyMemory }),
        patchRuntime: patchRuntimeSpy,
      });
      manager = new AgentSwapManager(deps);

      // Should not throw
      await manager.swapToAgent('code-reviewer');
      expect(patchRuntimeSpy).toHaveBeenCalledOnce();
    });

    it('uses createMemory from deps when sessionDir is set', async () => {
      const createMemorySpy = vi.fn().mockReturnValue(new InMemoryMemory<Message>());

      const orchestrator = createMockOrchestrator();
      deps = createMockDeps({
        getRuntime: () => createMockRuntime(orchestrator, { sessionDir: '/tmp/test-session' }),
        createMemory: createMemorySpy,
      });
      manager = new AgentSwapManager(deps);

      await manager.swapToAgent('code-reviewer');

      expect(createMemorySpy).toHaveBeenCalledWith('/tmp/test-session', 'swapped-code-reviewer');
    });

    it('uses InMemoryMemory when sessionDir is null', async () => {
      const createMemorySpy = vi.fn();

      deps = createMockDeps({
        createMemory: createMemorySpy,
      });
      manager = new AgentSwapManager(deps);

      await manager.swapToAgent('code-reviewer');

      // createMemory should NOT be called when sessionDir is null
      expect(createMemorySpy).not.toHaveBeenCalled();
    });

    it('emits agent:swapped event', async () => {
      await manager.swapToAgent('code-reviewer');

      expect(mockEventBus.emit).toHaveBeenCalledWith('agent:swapped', expect.objectContaining({
        type: 'agent:swapped',
        previousAgentId: 'main',
        agentId: 'code-reviewer',
        agentName: 'code-reviewer',
      }));
    });

    it('emits event with correct previousAgentId after multiple swaps', async () => {
      // First swap: main -> code-reviewer
      await manager.swapToAgent('code-reviewer');

      expect(mockEventBus.emit).toHaveBeenLastCalledWith('agent:swapped', expect.objectContaining({
        previousAgentId: 'main',
        agentId: 'code-reviewer',
      }));

      // Second swap: code-reviewer -> another agent (still uses code-reviewer as previous)
      // We need to re-register the current orchestrator mock with the new activeAgentId context
      await manager.swapToAgent('code-reviewer');

      expect(mockEventBus.emit).toHaveBeenLastCalledWith('agent:swapped', expect.objectContaining({
        previousAgentId: 'code-reviewer',
        agentId: 'code-reviewer',
      }));
    });

    it('creates event adapter via deps.createEventAdapter', async () => {
      const createEventAdapterSpy = vi.fn().mockReturnValue({});
      const orchestrator = createMockOrchestrator();

      deps = createMockDeps({
        getRuntime: () => createMockRuntime(orchestrator, { sessionDir: '/tmp/test-session' }),
        createEventAdapter: createEventAdapterSpy,
      });
      manager = new AgentSwapManager(deps);

      await manager.swapToAgent('code-reviewer');

      expect(createEventAdapterSpy).toHaveBeenCalledOnce();
      expect(createEventAdapterSpy).toHaveBeenCalledWith(
        '/tmp/test-session',
        expect.any(Object), // handlers
        false, // persistEventLog
        true,  // streamingChunks
      );
    });

    it('creates LLM via deps.createLLM', async () => {
      const createLLMSpy = vi.fn().mockReturnValue(createMockLLM());

      deps = createMockDeps({ createLLM: createLLMSpy });
      manager = new AgentSwapManager(deps);

      await manager.swapToAgent('code-reviewer');

      expect(createLLMSpy).toHaveBeenCalled();
    });
  });

  // ── swapToMain ───────────────────────────────────────────────────────────

  describe('swapToMain', () => {
    it('throws when orchestrator is null', async () => {
      deps = createMockDeps({ getRuntime: () => null });
      manager = new AgentSwapManager(deps);

      await expect(manager.swapToMain()).rejects.toThrow('Orchestrator not initialized');
    });

    it('throws when handlers are null', async () => {
      deps = createMockDeps({ getHandlers: () => null });
      manager = new AgentSwapManager(deps);

      await expect(manager.swapToMain()).rejects.toThrow('Handlers not initialized');
    });

    it('returns early when already on main agent', async () => {
      const patchRuntimeSpy = deps.patchRuntime as ReturnType<typeof vi.fn>;

      // Already on main, should be a no-op
      await manager.swapToMain();

      expect(patchRuntimeSpy).not.toHaveBeenCalled();
    });

    it('patches runtime with new orchestrator when swapping back from agent', async () => {
      const patchRuntimeSpy = deps.patchRuntime as ReturnType<typeof vi.fn>;

      // First swap to an agent
      await manager.swapToAgent('code-reviewer');
      patchRuntimeSpy.mockClear();

      // Then swap back to main
      await manager.swapToMain();

      expect(patchRuntimeSpy).toHaveBeenCalledOnce();
      expect(patchRuntimeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orchestrator: expect.anything(),
          activeAgentId: 'main',
        }),
      );
    });

    it('resets activeAgentId to "main"', async () => {
      await manager.swapToAgent('code-reviewer');
      expect(deps.getRuntime()?.activeAgentId).toBe('code-reviewer');

      await manager.swapToMain();
      expect(deps.getRuntime()?.activeAgentId).toBe('main');
    });

    it('stores previous orchestrator', async () => {
      await manager.swapToAgent('code-reviewer');

      await manager.swapToMain();

      // Previous orchestrator should be the one from the swap-to-agent step
      expect(manager.getPreviousOrchestrator()).toBeDefined();
    });

    it('preserves conversation history in new memory', async () => {
      const context = new ConversationContext();
      const conversationId = context.getActiveConversationId();

      // First swap to agent with some history
      const originalMemory = new InMemoryMemory<Message>();
      const testMessages: Message[] = [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        { id: 'msg-2', role: 'assistant', content: 'Hi!', timestamp: new Date().toISOString() },
      ];
      await originalMemory.set(conversationId, testMessages);

      let lastCapturedMemory: MemoryPort<Message> | null = null;
      const orchestrator = createMockOrchestrator();
      const runtime: OrchestratorRuntime = {
        ...createMockRuntime(orchestrator, { memory: originalMemory }),
      };

      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => {
        Object.assign(runtime, updates);
        if (updates.memory) lastCapturedMemory = updates.memory;
        return runtime;
      });

      deps = createMockDeps({
        getRuntime: () => runtime,
        patchRuntime: patchRuntimeSpy,
        getConversationContext: () => context,
      });
      manager = new AgentSwapManager(deps);

      // Swap to agent first
      await manager.swapToAgent('code-reviewer');

      // Add a message to the "agent" memory
      if (lastCapturedMemory) {
        const existingMsgs = await lastCapturedMemory.get(conversationId);
        existingMsgs.push({
          id: 'msg-3',
          role: 'user',
          content: 'Review this code',
          timestamp: new Date().toISOString(),
        });
        await lastCapturedMemory.set(conversationId, existingMsgs);
      }

      // Now swap back to main
      await manager.swapToMain();

      expect(lastCapturedMemory).not.toBeNull();
      const copiedMessages = await lastCapturedMemory?.get(conversationId);
      expect(copiedMessages.length).toBeGreaterThanOrEqual(2);
    });

    it('emits agent:swapped event with main as target', async () => {
      // First swap to an agent
      await manager.swapToAgent('code-reviewer');
      vi.mocked(mockEventBus.emit).mockClear();

      // Then swap back to main
      await manager.swapToMain();

      expect(mockEventBus.emit).toHaveBeenCalledWith('agent:swapped', expect.objectContaining({
        type: 'agent:swapped',
        agentId: 'main',
        agentName: 'Main Agent',
      }));
    });

    it('does not emit event when already on main', async () => {
      vi.mocked(mockEventBus.emit).mockClear();

      await manager.swapToMain();

      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('builds main config with correct properties', async () => {
      const orchestrator = createMockOrchestrator();
      const runtime = createMockRuntime(orchestrator);
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => {
        Object.assign(runtime, updates);
        return runtime;
      });
      deps = createMockDeps({
        getRuntime: () => runtime,
        patchRuntime: patchRuntimeSpy,
        getCurrentConfig: () => ({
          config: { session: { persistEventLog: false }, memory: { enabled: false } },
          model: 'anthropic/claude-sonnet',
          requireToolApproval: true,
          reasoningEffort: 'medium',
          thinking: 'MEDIUM',
        }),
      });
      manager = new AgentSwapManager(deps);

      // First swap to agent to leave 'main'
      await manager.swapToAgent('code-reviewer');
      patchRuntimeSpy.mockClear();

      // Then swap back
      await manager.swapToMain();

      expect(patchRuntimeSpy).toHaveBeenCalledOnce();
    });

    it('uses createMemory when sessionDir is set', async () => {
      const createMemorySpy = vi.fn().mockReturnValue(new InMemoryMemory<Message>());
      const orchestrator = createMockOrchestrator();
      const runtime = createMockRuntime(orchestrator, { sessionDir: '/tmp/test-session' });
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => {
        Object.assign(runtime, updates);
        return runtime;
      });

      deps = createMockDeps({
        getRuntime: () => runtime,
        patchRuntime: patchRuntimeSpy,
        createMemory: createMemorySpy,
      });
      manager = new AgentSwapManager(deps);

      await manager.swapToAgent('code-reviewer');
      createMemorySpy.mockClear();

      await manager.swapToMain();

      expect(createMemorySpy).toHaveBeenCalledWith('/tmp/test-session', 'cli');
    });

    it('uses InMemoryMemory when sessionDir is null', async () => {
      const createMemorySpy = vi.fn();

      deps = createMockDeps({
        createMemory: createMemorySpy,
      });
      manager = new AgentSwapManager(deps);

      await manager.swapToAgent('code-reviewer');
      createMemorySpy.mockClear();

      await manager.swapToMain();

      // createMemory should NOT be called when sessionDir is null
      expect(createMemorySpy).not.toHaveBeenCalled();
    });
  });

  // ── Integration-like scenarios ───────────────────────────────────────────

  describe('swap lifecycle', () => {
    it('main -> agent -> main round trip', async () => {
      expect(deps.getRuntime()?.activeAgentId).toBe('main');

      await manager.swapToAgent('code-reviewer');
      expect(deps.getRuntime()?.activeAgentId).toBe('code-reviewer');

      await manager.swapToMain();
      expect(deps.getRuntime()?.activeAgentId).toBe('main');
    });

    it('handles null memory gracefully in swapToAgent', async () => {
      const orchestrator = createMockOrchestrator();
      const runtime = createMockRuntime(orchestrator, { memory: null as unknown as MemoryPort<Message> });
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => {
        Object.assign(runtime, updates);
        return runtime;
      });
      deps = createMockDeps({
        getRuntime: () => runtime,
        patchRuntime: patchRuntimeSpy,
      });
      manager = new AgentSwapManager(deps);

      // Should not throw even with null memory
      await manager.swapToAgent('code-reviewer');
      expect(runtime.activeAgentId).toBe('code-reviewer');
    });

    it('handles null memory gracefully in swapToMain', async () => {
      const orchestrator = createMockOrchestrator();
      const runtime = createMockRuntime(orchestrator, { memory: null as unknown as MemoryPort<Message> });
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => {
        Object.assign(runtime, updates);
        return runtime;
      });
      deps = createMockDeps({
        getRuntime: () => runtime,
        patchRuntime: patchRuntimeSpy,
      });
      manager = new AgentSwapManager(deps);

      await manager.swapToAgent('code-reviewer');

      // Should not throw even with null memory
      await manager.swapToMain();
      expect(runtime.activeAgentId).toBe('main');
    });
  });
});
