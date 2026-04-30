import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationContext, type ConversationStore } from '@nuvin/nuvin-core';
import type { AgentOrchestrator, MemoryPort, Message, ToolRegistry } from '@nuvin/nuvin-core';
import type { ConfigManager } from '../../source/config/manager.js';
import type { MemorySettings } from '../../source/config/types.js';
import type { OrchestratorRuntime } from '../../source/services/OrchestratorRuntime.js';
import type { MemoryService } from '../../source/services/MemoryService.js';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGetWorkspaceContext, MockMemoryService } = vi.hoisted(() => {
  const mockGetWorkspaceContext = vi.fn().mockReturnValue({
    workspaceRoot: '/mock/workspace',
    workspaceId: 'ws_mock123',
  });
  const MockMemoryService = vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    _config: config,
    upsertTopicMemory: vi.fn().mockResolvedValue({
      topic: 'test-topic',
      type: 'semantic',
      scope: 'project',
    }),
    queryStatements: vi.fn().mockResolvedValue([]),
  }));
  return { mockGetWorkspaceContext, MockMemoryService };
});

// Mock MemoryService — we don't want real file I/O
vi.mock('../../source/services/MemoryService.js', () => ({
  MemoryService: MockMemoryService,
}));

// Mock WorkspaceContextService
vi.mock('../../source/services/WorkspaceContextService.js', () => ({
  getWorkspaceContext: mockGetWorkspaceContext,
}));

// Import after mocks are set up (vitest hoists vi.mock above imports)
import {
  MemoryToolWiring,
  type MemoryToolWiringDeps,
} from '../../source/services/orchestrator-modules/MemoryToolWiring.js';

// ─── Test helpers ──────────────────────────────────────────────────────────────

function createMockConfigManager(overrides: Record<string, unknown> = {}): ConfigManager {
  return {
    getConfig: vi.fn().mockReturnValue({
      memory: undefined,
      ...overrides,
    }),
    getCurrentProfile: vi.fn().mockReturnValue('default'),
    getProfileManager: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as unknown as ConfigManager;
}

function createMockDeps(overrides: Partial<MemoryToolWiringDeps> = {}): MemoryToolWiringDeps {
  const mockConfigManager = createMockConfigManager();
  return {
    configManager: mockConfigManager,
    getCurrentConfig: () => ({
      config: { memory: undefined as MemorySettings | undefined },
    }),
    getRuntime: () => null,
    getConversationContext: () => new ConversationContext(),
    ...overrides,
  };
}

function createMockRuntimeWithStore(store: ConversationStore | null): OrchestratorRuntime | null {
  if (!store) return null;
  return {
    orchestrator: null as unknown as AgentOrchestrator,
    memory: null as unknown as MemoryPort<Message>,
    conversationStore: store,
    toolRegistry: null as unknown as ToolRegistry,
    sessionId: null,
    sessionDir: null,
    activeAgentId: 'main',
  };
}

function createMockToolRegistry() {
  return {
    setMemoryHandler: vi.fn(),
    setMemoryQueryHandler: vi.fn(),
    setMemoryExtractionTaskBuilder: vi.fn(),
  };
}

function createMockConversationStore(messages: Array<{ role: string; content: string }> = []) {
  return {
    getConversation: vi.fn().mockResolvedValue({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    addMessage: vi.fn(),
    listConversations: vi.fn().mockResolvedValue([]),
  } as unknown as ConversationStore;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('MemoryToolWiring', () => {
  let wiring: MemoryToolWiring;
  let deps: MemoryToolWiringDeps;

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish mock return values after clearAllMocks wipes them
    mockGetWorkspaceContext.mockReturnValue({
      workspaceRoot: '/mock/workspace',
      workspaceId: 'ws_mock123',
    });
    MockMemoryService.mockImplementation((config: Record<string, unknown>) => ({
      _config: config,
      upsertTopicMemory: vi.fn().mockResolvedValue({
        topic: 'test-topic',
        type: 'semantic',
        scope: 'project',
      }),
      queryStatements: vi.fn().mockResolvedValue([]),
    }));

    deps = createMockDeps();
    wiring = new MemoryToolWiring(deps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Construction & state ────────────────────────────────────────────────

  describe('construction', () => {
    it('starts with null memoryService', () => {
      expect(wiring.getMemoryService()).toBeNull();
    });

    it('initializes workspaceContext from getWorkspaceContext()', () => {
      const ctx = wiring.getWorkspaceContext();
      expect(ctx).toEqual({
        workspaceRoot: '/mock/workspace',
        workspaceId: 'ws_mock123',
      });
    });

    it('starts with empty turn limits map', () => {
      // clearTurnLimits should be safe on an empty map
      expect(() => wiring.clearTurnLimits()).not.toThrow();
    });
  });

  // ─── initializeMemoryService ─────────────────────────────────────────────

  describe('initializeMemoryService', () => {
    it('creates MemoryService when memory is enabled (default)', () => {
      wiring.initializeMemoryService();

      const service = wiring.getMemoryService();
      expect(service).not.toBeNull();
    });

    it('does NOT create MemoryService when memory is explicitly disabled', () => {
      const disabledDeps = createMockDeps({
        getCurrentConfig: () => ({
          config: { memory: { enabled: false } as MemorySettings },
        }),
      });
      const disabledWiring = new MemoryToolWiring(disabledDeps);

      disabledWiring.initializeMemoryService();

      expect(disabledWiring.getMemoryService()).toBeNull();
    });

    it('creates MemoryService when memory.enabled is undefined (defaults to enabled)', () => {
      const undefinedDeps = createMockDeps({
        getCurrentConfig: () => ({
          config: { memory: {} as MemorySettings },
        }),
      });
      const undefinedWiring = new MemoryToolWiring(undefinedDeps);

      undefinedWiring.initializeMemoryService();

      expect(undefinedWiring.getMemoryService()).not.toBeNull();
    });

    it('passes config-derived options to MemoryService constructor', () => {
      MockMemoryService.mockClear();

      const configDeps = createMockDeps({
        getCurrentConfig: () => ({
          config: {
            memory: {
              retrieval: {
                injectTokenBudget: 5000,
                coreInjectTokenBudget: 2000,
                candidateLimit: 50,
                activeCandidateLimit: 20,
                minScore: 0.5,
                freshnessHalfLifeDays: 14,
              },
              index: {
                persisted: true,
                flushIntervalMs: 30000,
              },
            } as MemorySettings,
          },
        }),
      });
      const configWiring = new MemoryToolWiring(configDeps);

      configWiring.initializeMemoryService();

      expect(MockMemoryService).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_mock123',
          maxInjectionTokens: 5000,
          coreInjectionTokens: 2000,
          candidateLimit: 50,
          activeCandidateLimit: 20,
          minScore: 0.5,
          freshnessHalfLifeDays: 14,
          indexPersisted: true,
          indexFlushIntervalMs: 30000,
        }),
      );
    });

    it('uses profile suffix for non-default profiles', () => {
      MockMemoryService.mockClear();

      const profileDeps = createMockDeps({
        configManager: {
          getConfig: vi.fn().mockReturnValue({ memory: undefined }),
          getCurrentProfile: vi.fn().mockReturnValue('work'),
          getProfileManager: vi.fn().mockReturnValue(undefined),
        } as unknown as ConfigManager,
      });
      const profileWiring = new MemoryToolWiring(profileDeps);

      profileWiring.initializeMemoryService();

      expect(MockMemoryService).toHaveBeenCalled();
      const callArgs = MockMemoryService.mock.calls[0]?.[0] as {
        globalDir: string;
        projectDir: string;
      };
      expect(callArgs.globalDir).toContain('-work');
    });

    it('uses no suffix for default profile', () => {
      MockMemoryService.mockClear();

      wiring.initializeMemoryService();

      expect(MockMemoryService).toHaveBeenCalled();
      const callArgs = MockMemoryService.mock.calls[0]?.[0] as {
        globalDir: string;
      };
      expect(callArgs.globalDir).not.toContain('-default');
    });

    it('refreshes workspaceContext on each call', () => {
      // Change the mock return value
      mockGetWorkspaceContext.mockReturnValue({
        workspaceRoot: '/new/workspace',
        workspaceId: 'ws_new456',
      });

      wiring.initializeMemoryService();

      expect(wiring.getWorkspaceContext().workspaceId).toBe('ws_new456');
    });
  });

  // ─── enforceMemoryQueryTurnLimit ─────────────────────────────────────────

  describe('enforceMemoryQueryTurnLimit', () => {
    it('allows queries under the limit', () => {
      expect(() => wiring.enforceMemoryQueryTurnLimit('msg-1', 3)).not.toThrow();
      expect(() => wiring.enforceMemoryQueryTurnLimit('msg-1', 3)).not.toThrow();
    });

    it('allows queries up to the limit (last allowed)', () => {
      wiring.enforceMemoryQueryTurnLimit('msg-1', 2);
      wiring.enforceMemoryQueryTurnLimit('msg-1', 2);
      // 2 queries allowed, third should throw
      expect(() => wiring.enforceMemoryQueryTurnLimit('msg-1', 2)).toThrow(
        'memory_query limit reached for this turn (2)',
      );
    });

    it('throws at the limit', () => {
      wiring.enforceMemoryQueryTurnLimit('msg-1', 1); // first call OK
      expect(() => wiring.enforceMemoryQueryTurnLimit('msg-1', 1)).toThrow(
        'memory_query limit reached for this turn (1)',
      );
    });

    it('tracks different message IDs independently', () => {
      wiring.enforceMemoryQueryTurnLimit('msg-1', 1);
      // msg-2 has its own counter
      expect(() => wiring.enforceMemoryQueryTurnLimit('msg-2', 1)).not.toThrow();
    });

    it('uses "unknown-turn" for undefined messageId', () => {
      wiring.enforceMemoryQueryTurnLimit(undefined, 1);
      expect(() => wiring.enforceMemoryQueryTurnLimit(undefined, 1)).toThrow(
        'memory_query limit reached for this turn (1)',
      );
    });

    it('evicts oldest entry when map exceeds 512 entries', () => {
      // Fill up to 512 entries
      for (let i = 0; i < 512; i++) {
        wiring.enforceMemoryQueryTurnLimit(`msg-${i}`, 100);
      }
      // The 513th entry should trigger eviction of the first
      wiring.enforceMemoryQueryTurnLimit('msg-new', 100);

      // Now msg-0 was evicted, so querying it again should start fresh (no throw)
      expect(() => wiring.enforceMemoryQueryTurnLimit('msg-0', 1)).not.toThrow();
    });
  });

  // ─── clearTurnLimits ─────────────────────────────────────────────────────

  describe('clearTurnLimits', () => {
    it('clears the turn limits map', () => {
      wiring.enforceMemoryQueryTurnLimit('msg-1', 1);
      wiring.clearTurnLimits();
      // After clear, the same messageId should be allowed again
      expect(() => wiring.enforceMemoryQueryTurnLimit('msg-1', 1)).not.toThrow();
    });

    it('is safe to call on empty map', () => {
      expect(() => wiring.clearTurnLimits()).not.toThrow();
    });

    it('is safe to call multiple times', () => {
      wiring.clearTurnLimits();
      wiring.clearTurnLimits();
      expect(() => wiring.enforceMemoryQueryTurnLimit('msg-1', 1)).not.toThrow();
    });
  });

  // ─── wireHandlers ────────────────────────────────────────────────────────

  describe('wireHandlers', () => {
    it('sets all three handlers on the tool registry', () => {
      wiring.initializeMemoryService();
      const registry = createMockToolRegistry();

      wiring.wireHandlers(registry as never);

      expect(registry.setMemoryHandler).toHaveBeenCalledTimes(1);
      expect(registry.setMemoryHandler).toHaveBeenCalledWith(expect.any(Function));

      expect(registry.setMemoryQueryHandler).toHaveBeenCalledTimes(1);
      expect(registry.setMemoryQueryHandler).toHaveBeenCalledWith(expect.any(Function));

      expect(registry.setMemoryExtractionTaskBuilder).toHaveBeenCalledTimes(1);
      expect(registry.setMemoryExtractionTaskBuilder).toHaveBeenCalledWith(
        expect.any(Function),
        { hiddenAgentName: '__memory_extractor_internal' },
      );
    });

    // ─── memory_save handler ─────────────────────────────────────────────

    describe('memory_save handler', () => {
      it('returns error string when memoryService is null', async () => {
        const registry = createMockToolRegistry();
        // Don't call initializeMemoryService — memoryService is null
        wiring.wireHandlers(registry as never);

        const handler = registry.setMemoryHandler.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
        ) => Promise<string>;
        const result = await handler({ content: 'test', type: 'semantic' });
        expect(result).toBe('Memory system is not enabled.');
      });

      it('delegates to memoryService.upsertTopicMemory with correct args', async () => {
        wiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        wiring.wireHandlers(registry as never);

        const handler = registry.setMemoryHandler.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
        ) => Promise<string>;
        const result = await handler({
          content: 'Use tabs',
          type: 'semantic',
          scope: 'global',
          topic: 'style',
          key: 'indentation',
          title: 'Indentation preference',
          confidence: 0.9,
          evidence: 'User stated preference',
          tags: ['style'],
          keywords: ['tabs', 'indent'],
          updateMode: 'replace',
        });

        const service = wiring.getMemoryService() as MemoryService;
        expect(service.upsertTopicMemory).toHaveBeenCalledWith(
          expect.objectContaining({
            content: 'Use tabs',
            type: 'semantic',
            scope: 'global',
            topic: 'style',
            key: 'indentation',
            confidence: 0.9,
            updateMode: 'replace',
            source: 'explicit',
          }),
        );

        expect(result).toContain('Memory saved');
      });

      it('defaults scope to "project" when not provided', async () => {
        wiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        wiring.wireHandlers(registry as never);

        const handler = registry.setMemoryHandler.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
        ) => Promise<string>;
        await handler({ content: 'test', type: 'semantic' });

        const service = wiring.getMemoryService() as MemoryService;
        expect(service.upsertTopicMemory).toHaveBeenCalledWith(
          expect.objectContaining({
            scope: 'project',
            workspaceId: 'ws_mock123',
          }),
        );
      });

      it('does not set workspaceId for global scope', async () => {
        wiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        wiring.wireHandlers(registry as never);

        const handler = registry.setMemoryHandler.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
        ) => Promise<string>;
        await handler({ content: 'test', type: 'semantic', scope: 'global' });

        const service = wiring.getMemoryService() as MemoryService;
        expect(service.upsertTopicMemory).toHaveBeenCalledWith(
          expect.objectContaining({
            scope: 'global',
            workspaceId: undefined,
          }),
        );
      });
    });

    // ─── memory_query handler ────────────────────────────────────────────

    describe('memory_query handler', () => {
      it('throws when memoryService is null', async () => {
        const registry = createMockToolRegistry();
        wiring.wireHandlers(registry as never);

        const handler = registry.setMemoryQueryHandler.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;

        await expect(handler({ query: 'test' })).rejects.toThrow(
          'Memory system is not enabled.',
        );
      });

      it('enforces turn limits via context.messageId', async () => {
        const limitDeps = createMockDeps({
          getCurrentConfig: () => ({
            config: {
              memory: {
                retrieval: { maxQueriesPerTurn: 1 },
              } as MemorySettings,
            },
          }),
        });
        const limitWiring = new MemoryToolWiring(limitDeps);
        limitWiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        limitWiring.wireHandlers(registry as never);

        const handler = registry.setMemoryQueryHandler.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;

        // First call succeeds
        await handler({ query: 'test' }, { messageId: 'msg-1' });

        // Second call with same messageId should throw
        await expect(
          handler({ query: 'test' }, { messageId: 'msg-1' }),
        ).rejects.toThrow('memory_query limit reached');
      });

      it('defaults scope to "both" and resolves to global+project scopes', async () => {
        wiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        wiring.wireHandlers(registry as never);

        const handler = registry.setMemoryQueryHandler.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;

        const result = (await handler(
          { query: 'test' },
          { messageId: 'msg-1' },
        )) as { scope: string };
        expect(result.scope).toBe('both');

        const service = wiring.getMemoryService() as MemoryService;
        expect(service.queryStatements).toHaveBeenCalledWith(
          expect.objectContaining({
            scopes: ['global', 'project'],
          }),
        );
      });

      it('passes workspaceId to queryStatements', async () => {
        wiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        wiring.wireHandlers(registry as never);

        const handler = registry.setMemoryQueryHandler.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;
        await handler({ query: 'test' }, { messageId: 'msg-1' });

        const service = wiring.getMemoryService() as MemoryService;
        expect(service.queryStatements).toHaveBeenCalledWith(
          expect.objectContaining({
            workspaceId: 'ws_mock123',
          }),
        );
      });

      it('returns structured query result', async () => {
        wiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        wiring.wireHandlers(registry as never);

        const handler = registry.setMemoryQueryHandler.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;

        const result = (await handler(
          { query: 'style', key: 'indentation', scope: 'global', topK: 5 },
          { messageId: 'msg-1' },
        )) as { query: string; key: string; scope: string; totalHits: number; hits: unknown[] };

        expect(result).toEqual({
          query: 'style',
          key: 'indentation',
          scope: 'global',
          totalHits: 0,
          hits: [],
        });
      });
    });

    // ─── memory_extract task builder ─────────────────────────────────────

    describe('memory_extract task builder', () => {
      it('throws when conversationStore is null', async () => {
        wiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        wiring.wireHandlers(registry as never);

        const builder = registry.setMemoryExtractionTaskBuilder.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;

        await expect(builder({})).rejects.toThrow('Memory system is not enabled.');
      });

      it('throws when extraction is disabled', async () => {
        const disabledDeps = createMockDeps({
          getCurrentConfig: () => ({
            config: {
              memory: {
                extraction: { enabled: false },
              } as MemorySettings,
            },
          }),
          getRuntime: () =>
            createMockRuntimeWithStore(createMockConversationStore([
              { role: 'user', content: 'hello' },
              { role: 'assistant', content: 'hi' },
            ])),
        });
        const disabledWiring = new MemoryToolWiring(disabledDeps);
        disabledWiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        disabledWiring.wireHandlers(registry as never);

        const builder = registry.setMemoryExtractionTaskBuilder.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;

        await expect(builder({})).rejects.toThrow('memory_extract is disabled');
      });

      it('throws when conversation has fewer than 2 messages', async () => {
        const emptyDeps = createMockDeps({
          getRuntime: () =>
            createMockRuntimeWithStore(createMockConversationStore([{ role: 'user', content: 'hello' }])),
        });
        const emptyWiring = new MemoryToolWiring(emptyDeps);
        emptyWiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        emptyWiring.wireHandlers(registry as never);

        const builder = registry.setMemoryExtractionTaskBuilder.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;

        await expect(builder({})).rejects.toThrow('No conversation context available');
      });

      it('throws when no user/assistant messages', async () => {
        const systemOnlyDeps = createMockDeps({
          getRuntime: () =>
            createMockRuntimeWithStore(createMockConversationStore([
              { role: 'system', content: 'system msg 1' },
              { role: 'system', content: 'system msg 2' },
            ])),
        });
        const systemOnlyWiring = new MemoryToolWiring(systemOnlyDeps);
        systemOnlyWiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        systemOnlyWiring.wireHandlers(registry as never);

        const builder = registry.setMemoryExtractionTaskBuilder.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;

        await expect(builder({})).rejects.toThrow('No user/assistant messages');
      });

      it('builds extraction task with correct transcript', async () => {
        const messages = [
          { role: 'user', content: 'I prefer tabs' },
          { role: 'assistant', content: 'Noted, tabs it is' },
          { role: 'user', content: 'Also use Vitest' },
        ];
        const convDeps = createMockDeps({
          getRuntime: () => createMockRuntimeWithStore(createMockConversationStore(messages)),
        });
        const convWiring = new MemoryToolWiring(convDeps);
        convWiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        convWiring.wireHandlers(registry as never);

        const builder = registry.setMemoryExtractionTaskBuilder.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<{ task: string; description: string }>;

        const result = await builder({ scope: 'project' });

        expect(result.description).toBe(
          'Extract and consolidate memory from this conversation',
        );
        expect(result.task).toContain('I prefer tabs');
        expect(result.task).toContain('Noted, tabs it is');
        expect(result.task).toContain('Also use Vitest');
        expect(result.task).toContain('Scope: project');
      });

      it('clamps maxMessages between 1 and 100', async () => {
        const messages = Array.from({ length: 5 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        }));
        const convDeps = createMockDeps({
          getRuntime: () => createMockRuntimeWithStore(createMockConversationStore(messages)),
        });
        const convWiring = new MemoryToolWiring(convDeps);
        convWiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        convWiring.wireHandlers(registry as never);

        const builder = registry.setMemoryExtractionTaskBuilder.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<{ task: string }>;

        // With maxMessages=2, only last 2 user/assistant messages
        const result = await builder({ maxMessages: 2 });
        expect(result.task).toContain('2 messages');
      });

      it('includes sensitive filter status in task', async () => {
        const messages = [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ];

        // sensitiveFilter ON (default)
        const onDeps = createMockDeps({
          getRuntime: () => createMockRuntimeWithStore(createMockConversationStore(messages)),
        });
        const onWiring = new MemoryToolWiring(onDeps);
        onWiring.initializeMemoryService();
        const onRegistry = createMockToolRegistry();
        onWiring.wireHandlers(onRegistry as never);
        const onBuilder = onRegistry.setMemoryExtractionTaskBuilder.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
        ) => Promise<{ task: string }>;
        const onResult = await onBuilder({});
        expect(onResult.task).toContain('Sensitive filter: ON');

        // sensitiveFilter OFF
        const offDeps = createMockDeps({
          getCurrentConfig: () => ({
            config: {
              memory: {
                extraction: { enabled: true, sensitiveFilter: false },
              } as MemorySettings,
            },
          }),
          getRuntime: () => createMockRuntimeWithStore(createMockConversationStore(messages)),
        });
        const offWiring = new MemoryToolWiring(offDeps);
        offWiring.initializeMemoryService();
        const offRegistry = createMockToolRegistry();
        offWiring.wireHandlers(offRegistry as never);
        const offBuilder = offRegistry.setMemoryExtractionTaskBuilder.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
        ) => Promise<{ task: string }>;
        const offResult = await offBuilder({});
        expect(offResult.task).toContain('Sensitive filter: OFF');
      });

      it('uses conversationId from context or falls back to ConversationContext', async () => {
        const store = createMockConversationStore([
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ]);

        const convContext = new ConversationContext();
        const ctxDeps = createMockDeps({
          getRuntime: () => createMockRuntimeWithStore(store),
          getConversationContext: () => convContext,
        });
        const ctxWiring = new MemoryToolWiring(ctxDeps);
        ctxWiring.initializeMemoryService();
        const registry = createMockToolRegistry();
        ctxWiring.wireHandlers(registry as never);

        const builder = registry.setMemoryExtractionTaskBuilder.mock.calls[0]?.[0] as (
          input: Record<string, unknown>,
          context?: Record<string, unknown>,
        ) => Promise<unknown>;

        // With explicit conversationId
        await builder({}, { conversationId: 'conv-123' });
        expect(store.getConversation).toHaveBeenCalledWith('conv-123');

        // Without conversationId — uses ConversationContext default
        vi.mocked(store.getConversation).mockClear();
        await builder({});
        expect(store.getConversation).toHaveBeenCalledWith('default');
      });
    });
  });

  // ─── getMemoryService ────────────────────────────────────────────────────

  describe('getMemoryService', () => {
    it('returns null before initialization', () => {
      expect(wiring.getMemoryService()).toBeNull();
    });

    it('returns the service after initialization', () => {
      wiring.initializeMemoryService();
      expect(wiring.getMemoryService()).not.toBeNull();
    });
  });

  // ─── getWorkspaceContext ─────────────────────────────────────────────────

  describe('getWorkspaceContext', () => {
    it('returns workspace context with workspaceRoot and workspaceId', () => {
      const ctx = wiring.getWorkspaceContext();
      expect(ctx).toHaveProperty('workspaceRoot');
      expect(ctx).toHaveProperty('workspaceId');
    });
  });
});
