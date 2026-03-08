import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionManager,
  type SessionManagerDeps,
} from '../../source/services/orchestrator-modules/SessionManager.js';
import { InMemoryMemory, ConversationContext, ConversationStore } from '@nuvin/nuvin-core';
import type { Message, MemoryPort, AgentOrchestrator, ToolRegistry } from '@nuvin/nuvin-core';
import type { UIHandlers } from '../../source/services/orchestrator-modules/types.js';
import type { OrchestratorRuntime } from '../../source/services/OrchestratorRuntime.js';
import { sessionMetricsService } from '../../source/services/SessionMetricsService.js';

// ─── Test helpers ──────────────────────────────────────────────────────────────

const TEST_SESSIONS_DIR = '/tmp/test-nuvin/sessions';
const TEST_AGENTS_DIR = '/tmp/test-nuvin/agents';

function createMockHandlers(): UIHandlers {
  return {
    appendLine: vi.fn(),
    updateLine: vi.fn(),
    updateLineMetadata: vi.fn(),
    handleError: vi.fn(),
  };
}

function createMockOrchestrator(overrides: Record<string, unknown> = {}) {
  return {
    setMemory: vi.fn(),
    setEvents: vi.fn(),
    setMetrics: vi.fn(),
    setSessionId: vi.fn(),
    getConfig: vi.fn().mockReturnValue({ systemPrompt: 'test' }),
    getTools: vi.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as AgentOrchestrator;
}

function createMockToolRegistry(overrides: Record<string, unknown> = {}) {
  return {
    setSharedMemory: vi.fn(),
    ...overrides,
  } as unknown as ToolRegistry;
}

function createMockRuntime(
  orchestrator: AgentOrchestrator | null,
  overrides: Partial<OrchestratorRuntime> = {},
): OrchestratorRuntime | null {
  if (!orchestrator) return null;
  return {
    orchestrator,
    memory: new InMemoryMemory<Message>(),
    conversationStore: null as any,
    toolRegistry: createMockToolRegistry(),
    sessionId: null,
    sessionDir: null,
    activeAgentId: 'main',
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<SessionManagerDeps> = {}): SessionManagerDeps {
  const context = new ConversationContext();
  const mockOrchestrator = createMockOrchestrator();
  const mockRuntime = createMockRuntime(mockOrchestrator)!;

  const patchRuntimeFn = vi.fn((updates: Partial<OrchestratorRuntime>) => {
    Object.assign(mockRuntime, updates);
    return mockRuntime;
  });

  return {
    getRuntime: () => mockRuntime,
    patchRuntime: patchRuntimeFn,
    getHandlers: () => createMockHandlers(),
    getProfilePaths: () => ({
      sessionsDir: TEST_SESSIONS_DIR,
      agentsDir: TEST_AGENTS_DIR,
    }),
    getCurrentConfig: () => ({
      config: {
        session: { persistEventLog: false },
        memory: undefined,
      },
    }),
    getConversationContext: () => context,
    getToolRegistry: () => createMockToolRegistry(),
    getStreamingChunks: () => true,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionManager', () => {
  let manager: SessionManager;
  let deps: SessionManagerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    manager = new SessionManager(deps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Construction & initial state ─────────────────────────────────────────

  describe('construction', () => {
    it('starts with null session', () => {
      const session = manager.getSession();
      expect(session.sessionId).toBeNull();
      expect(session.sessionDir).toBeNull();
    });

    it('starts not initialized', () => {
      expect(manager.isSessionInitialized()).toBe(false);
    });

    it('starts with memPersist false', () => {
      expect(manager.getMemPersist()).toBe(false);
    });
  });

  // ── setMemPersist ────────────────────────────────────────────────────────

  describe('setMemPersist', () => {
    it('sets memPersist flag', () => {
      manager.setMemPersist(true);
      expect(manager.getMemPersist()).toBe(true);
    });
  });

  // ── resolveSession ───────────────────────────────────────────────────────

  describe('resolveSession', () => {
    it('generates sessionId from Date.now() when no sessionId provided', () => {
      const before = Date.now();
      const result = manager.resolveSession({});
      const after = Date.now();

      const id = Number(result.sessionId);
      expect(id).toBeGreaterThanOrEqual(before);
      expect(id).toBeLessThanOrEqual(after);
    });

    it('uses provided sessionId when given', () => {
      const result = manager.resolveSession({ sessionId: 'my-session' });
      expect(result.sessionId).toBe('my-session');
    });

    it('derives sessionDir from sessionsDir + sessionId when no sessionDir provided', () => {
      const result = manager.resolveSession({ sessionId: 'abc123' });
      expect(result.sessionDir).toBe(`${TEST_SESSIONS_DIR}/abc123`);
    });

    it('uses provided sessionDir when given', () => {
      const result = manager.resolveSession({
        sessionId: 'abc123',
        sessionDir: '/custom/dir',
      });
      expect(result.sessionDir).toBe('/custom/dir');
    });

    it('generates both sessionId and sessionDir from profile paths when nothing provided', () => {
      const result = manager.resolveSession({});
      expect(result.sessionDir).toBe(`${TEST_SESSIONS_DIR}/${result.sessionId}`);
    });
  });

  // ── createMemory ─────────────────────────────────────────────────────────

  describe('createMemory', () => {
    it('returns a PersistedMemory instance', () => {
      const memory = manager.createMemory('/tmp/session-dir', 'cli');
      // Verify it's a MemoryPort (has get/set methods)
      expect(memory).toBeDefined();
      expect(typeof memory.get).toBe('function');
      expect(typeof memory.set).toBe('function');
    });

    it('creates memory with agent-specific filename', () => {
      // We can't inspect the internal filename directly, but we verify
      // different agentIds produce different memory instances
      const memory1 = manager.createMemory('/tmp/session-dir', 'cli');
      const memory2 = manager.createMemory('/tmp/session-dir', 'agent:test:1');
      expect(memory1).not.toBe(memory2);
    });
  });

  // ── createEventAdapter ───────────────────────────────────────────────────

  describe('createEventAdapter', () => {
    it('creates a UIEventAdapter with persistence when persistEventLog is true', () => {
      const handlers = createMockHandlers();
      const adapter = manager.createEventAdapter('/tmp/session-dir', handlers, true, true);
      expect(adapter).toBeDefined();
    });

    it('creates a UIEventAdapter without persistence', () => {
      const handlers = createMockHandlers();
      const adapter = manager.createEventAdapter('/tmp/session-dir', handlers, false, true);
      expect(adapter).toBeDefined();
    });
  });

  // ── initializePersistedSession ───────────────────────────────────────────

  describe('initializePersistedSession', () => {
    it('throws when orchestrator is null', async () => {
      deps = createMockDeps({ getRuntime: () => null });
      manager = new SessionManager(deps);

      await expect(manager.initializePersistedSession()).rejects.toThrow(
        'Orchestrator or handlers not initialized',
      );
    });

    it('throws when handlers are null', async () => {
      deps = createMockDeps({ getHandlers: () => null });
      manager = new SessionManager(deps);

      await expect(manager.initializePersistedSession()).rejects.toThrow(
        'Orchestrator or handlers not initialized',
      );
    });

    it('creates persisted session and updates state', async () => {
      const mockOrchestrator = createMockOrchestrator();
      const mockToolRegistry = createMockToolRegistry();
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => ({
        ...createMockRuntime(mockOrchestrator)!,
        ...updates,
      }));

      // Provide an in-memory memory with some preloaded messages
      const initialMemory = new InMemoryMemory<Message>();
      const context = new ConversationContext();
      const conversationId = context.getActiveConversationId();

      deps = createMockDeps({
        getRuntime: () => createMockRuntime(mockOrchestrator)!,
        patchRuntime: patchRuntimeSpy,
        getHandlers: () => createMockHandlers(),
        getToolRegistry: () => mockToolRegistry,
        getConversationContext: () => context,
      });
      manager = new SessionManager(deps);

      // Provide the initial memory for migration
      await manager.initializePersistedSession(initialMemory);

      // Should have set memory on orchestrator
      expect(mockOrchestrator.setMemory).toHaveBeenCalledOnce();
      expect(mockOrchestrator.setEvents).toHaveBeenCalledOnce();
      expect(mockOrchestrator.setMetrics).toHaveBeenCalledOnce();
      expect(mockOrchestrator.setSessionId).toHaveBeenCalledOnce();

      // Should have reinitialized sub-agent memory
      expect(mockToolRegistry.setSharedMemory).toHaveBeenCalledOnce();

      // Should have called patchRuntime with new memory and store
      expect(patchRuntimeSpy).toHaveBeenCalledOnce();
      expect(patchRuntimeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          memory: expect.anything(),
          conversationStore: expect.anything(),
        }),
      );

      // State should be updated
      expect(manager.isSessionInitialized()).toBe(true);
      expect(manager.getSession().sessionId).toBeTruthy();
      expect(manager.getSession().sessionDir).toBeTruthy();
    });

    it('preserves preloaded messages during migration', async () => {
      const mockOrchestrator = createMockOrchestrator();
      const context = new ConversationContext();
      const conversationId = context.getActiveConversationId();

      // Create initial memory with preloaded messages
      const initialMemory = new InMemoryMemory<Message>();
      const preloadedMsg: Message = {
        id: 'preloaded-1',
        role: 'user',
        content: 'Hello from history',
        timestamp: new Date().toISOString(),
      };
      await initialMemory.set(conversationId, [preloadedMsg]);

      // Track what memory gets patched via patchRuntime
      let capturedMemory: MemoryPort<Message> | null = null;
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => {
        if (updates.memory) capturedMemory = updates.memory;
        return { ...createMockRuntime(mockOrchestrator)!, ...updates };
      });

      deps = createMockDeps({
        getRuntime: () => createMockRuntime(mockOrchestrator)!,
        patchRuntime: patchRuntimeSpy,
        getHandlers: () => createMockHandlers(),
        getConversationContext: () => context,
      });
      manager = new SessionManager(deps);

      await manager.initializePersistedSession(initialMemory);

      // The new memory should have the preloaded messages restored
      expect(capturedMemory).not.toBeNull();
      const messages = await capturedMemory!.get(conversationId);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe('preloaded-1');
    });
  });

  // ── initializeDefaultConversation ────────────────────────────────────────

  describe('initializeDefaultConversation', () => {
    it('creates default conversation with initial metadata', async () => {
      const memory = new InMemoryMemory<Message>();
      const store = new ConversationStore(memory);
      const context = new ConversationContext();

      deps = createMockDeps({ getConversationContext: () => context });
      manager = new SessionManager(deps);

      await manager.initializeDefaultConversation(store);

      const conversationId = context.getActiveConversationId();
      const conversation = await store.getConversation(conversationId);
      expect(conversation.metadata.createdAt).toBeTruthy();
      expect(conversation.metadata.updatedAt).toBeTruthy();
      expect(conversation.metadata.messageCount).toBe(0);
    });

    it('does not overwrite existing conversation metadata', async () => {
      const memory = new InMemoryMemory<Message>();
      const store = new ConversationStore(memory);
      const context = new ConversationContext();
      const conversationId = context.getActiveConversationId();

      // Pre-set existing conversation
      await store.setConversation(conversationId, {
        messages: [],
        metadata: {
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          messageCount: 5,
        },
      });

      deps = createMockDeps({ getConversationContext: () => context });
      manager = new SessionManager(deps);

      await manager.initializeDefaultConversation(store);

      const conversation = await store.getConversation(conversationId);
      // Should preserve original createdAt
      expect(conversation.metadata.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  // ── createNewConversation ────────────────────────────────────────────────

  describe('createNewConversation', () => {
    it('throws when orchestrator is null', async () => {
      deps = createMockDeps({ getRuntime: () => null });
      manager = new SessionManager(deps);

      await expect(manager.createNewConversation()).rejects.toThrow(
        'Orchestrator not initialized',
      );
    });

    it('throws when handlers are null', async () => {
      deps = createMockDeps({ getHandlers: () => null });
      manager = new SessionManager(deps);

      await expect(manager.createNewConversation()).rejects.toThrow(
        'Handlers not initialized',
      );
    });

    it('creates new session with memPersist=true', async () => {
      const mockOrchestrator = createMockOrchestrator();
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => ({
        ...createMockRuntime(mockOrchestrator)!,
        ...updates,
      }));

      deps = createMockDeps({
        getRuntime: () => createMockRuntime(mockOrchestrator)!,
        patchRuntime: patchRuntimeSpy,
      });
      manager = new SessionManager(deps);
      manager.setMemPersist(true);

      const result = await manager.createNewConversation({ memPersist: true });

      expect(result.sessionId).toBeTruthy();
      expect(result.sessionDir).toBeTruthy();
      expect(result.memory).toBeDefined();

      // Orchestrator should be updated
      expect(mockOrchestrator.setMemory).toHaveBeenCalledOnce();
      expect(mockOrchestrator.setEvents).toHaveBeenCalledOnce();
      expect(mockOrchestrator.setMetrics).toHaveBeenCalledOnce();
      expect(mockOrchestrator.setSessionId).toHaveBeenCalledOnce();

      // State should be updated
      expect(manager.getSession().sessionId).toBe(result.sessionId);
      expect(manager.getSession().sessionDir).toBe(result.sessionDir);
      expect(manager.isSessionInitialized()).toBe(true);
      expect(manager.getMemPersist()).toBe(true);
    });

    it('creates new session with memPersist=false', async () => {
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator)! });
      manager = new SessionManager(deps);

      const result = await manager.createNewConversation({ memPersist: false });

      expect(result.sessionId).toBeNull();
      expect(result.sessionDir).toBeNull();

      // setSessionId should NOT be called for non-persisted
      expect(mockOrchestrator.setSessionId).not.toHaveBeenCalled();
    });

    it('defaults memPersist from instance state', async () => {
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator)! });
      manager = new SessionManager(deps);
      manager.setMemPersist(true);

      const result = await manager.createNewConversation();

      expect(result.sessionId).toBeTruthy();
      expect(result.sessionDir).toBeTruthy();
    });

    it('calls patchRuntime with memory and conversationStore', async () => {
      const mockOrchestrator = createMockOrchestrator();
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => ({
        ...createMockRuntime(mockOrchestrator)!,
        ...updates,
      }));

      deps = createMockDeps({
        getRuntime: () => createMockRuntime(mockOrchestrator)!,
        patchRuntime: patchRuntimeSpy,
      });
      manager = new SessionManager(deps);

      await manager.createNewConversation({ memPersist: true });

      expect(patchRuntimeSpy).toHaveBeenCalledOnce();
      expect(patchRuntimeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          memory: expect.anything(),
          conversationStore: expect.anything(),
        }),
      );
    });
  });

  // ── switchToSession ──────────────────────────────────────────────────────

  describe('switchToSession', () => {
    it('throws when orchestrator is null', async () => {
      deps = createMockDeps({ getRuntime: () => null });
      manager = new SessionManager(deps);

      await expect(
        manager.switchToSession({ sessionId: 'abc', sessionDir: '/tmp/abc' }),
      ).rejects.toThrow('Orchestrator not initialized');
    });

    it('throws when handlers are null', async () => {
      deps = createMockDeps({ getHandlers: () => null });
      manager = new SessionManager(deps);

      await expect(
        manager.switchToSession({ sessionId: 'abc', sessionDir: '/tmp/abc' }),
      ).rejects.toThrow('Handlers not initialized');
    });

    it('switches to existing session', async () => {
      const mockOrchestrator = createMockOrchestrator();
      const patchRuntimeSpy = vi.fn((updates: Partial<OrchestratorRuntime>) => ({
        ...createMockRuntime(mockOrchestrator)!,
        ...updates,
      }));

      deps = createMockDeps({
        getRuntime: () => createMockRuntime(mockOrchestrator)!,
        patchRuntime: patchRuntimeSpy,
      });
      manager = new SessionManager(deps);

      const result = await manager.switchToSession({
        sessionId: 'existing-session',
        sessionDir: '/tmp/existing-session',
      });

      expect(result.sessionId).toBe('existing-session');
      expect(result.sessionDir).toBe('/tmp/existing-session');
      expect(result.memory).toBeDefined();

      // Orchestrator should be updated
      expect(mockOrchestrator.setMemory).toHaveBeenCalledOnce();
      expect(mockOrchestrator.setEvents).toHaveBeenCalledOnce();
      expect(mockOrchestrator.setMetrics).toHaveBeenCalledOnce();
      expect(mockOrchestrator.setSessionId).toHaveBeenCalledWith('existing-session');

      // State should be updated
      expect(manager.getSession().sessionId).toBe('existing-session');
      expect(manager.getSession().sessionDir).toBe('/tmp/existing-session');
      expect(manager.isSessionInitialized()).toBe(true);
      expect(manager.getMemPersist()).toBe(true);

      // Callbacks
      expect(patchRuntimeSpy).toHaveBeenCalledOnce();
      expect(patchRuntimeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          memory: expect.anything(),
          conversationStore: expect.anything(),
        }),
      );
    });
  });

  // ── updateConversationMetadataAfterSend ──────────────────────────────────

  describe('updateConversationMetadataAfterSend', () => {
    it('no-ops when conversationStore is null', async () => {
      // Should not throw
      await manager.updateConversationMetadataAfterSend(null, null, 'conv-1');
    });

    it('no-ops when memory is null', async () => {
      const store = new ConversationStore(new InMemoryMemory<Message>());
      // Should not throw
      await manager.updateConversationMetadataAfterSend(store, null, 'conv-1');
    });

    it('updates message count from memory', async () => {
      const memory = new InMemoryMemory<Message>();
      const store = new ConversationStore(memory);
      const conversationId = 'test-conv';

      // Initialize conversation
      await store.setConversation(conversationId, {
        messages: [],
        metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 0 },
      });

      // Add messages to memory
      await memory.set(conversationId, [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        { id: 'msg-2', role: 'assistant', content: 'Hi!', timestamp: new Date().toISOString() },
      ]);

      await manager.updateConversationMetadataAfterSend(store, memory, conversationId);

      const conversation = await store.getConversation(conversationId);
      expect(conversation.metadata.messageCount).toBe(2);
    });

    it('records request metrics when provided', async () => {
      const memory = new InMemoryMemory<Message>();
      const store = new ConversationStore(memory);
      const conversationId = 'test-conv';

      await store.setConversation(conversationId, {
        messages: [],
        metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 0 },
      });

      const recordSpy = vi.spyOn(store, 'recordRequestMetrics');

      const metrics = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        toolCalls: 2,
        responseTimeMs: 1500,
        cost: 0.005,
      };

      await manager.updateConversationMetadataAfterSend(store, memory, conversationId, metrics);

      expect(recordSpy).toHaveBeenCalledWith(conversationId, metrics);
    });

    it('skips metrics recording when no metrics provided', async () => {
      const memory = new InMemoryMemory<Message>();
      const store = new ConversationStore(memory);
      const conversationId = 'test-conv';

      await store.setConversation(conversationId, {
        messages: [],
        metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 0 },
      });

      const recordSpy = vi.spyOn(store, 'recordRequestMetrics');

      await manager.updateConversationMetadataAfterSend(store, memory, conversationId);

      expect(recordSpy).not.toHaveBeenCalled();
    });
  });

  // ── getConversationMetadata ──────────────────────────────────────────────

  describe('getConversationMetadata', () => {
    it('returns metadata for a valid conversation', async () => {
      const memory = new InMemoryMemory<Message>();
      const store = new ConversationStore(memory);
      const conversationId = 'test-conv';

      const now = new Date().toISOString();
      await store.setConversation(conversationId, {
        messages: [],
        metadata: { createdAt: now, updatedAt: now, messageCount: 3 },
      });

      const metadata = await manager.getConversationMetadata(store, conversationId);
      expect(metadata.createdAt).toBe(now);
      expect(metadata.messageCount).toBe(3);
    });

    it('throws when conversationStore is null', async () => {
      await expect(
        manager.getConversationMetadata(null, 'conv-1'),
      ).rejects.toThrow('ConversationStore not initialized');
    });
  });

  // ── listConversations ────────────────────────────────────────────────────

  describe('listConversations', () => {
    it('returns list of conversations', async () => {
      const memory = new InMemoryMemory<Message>();
      const store = new ConversationStore(memory);
      const now = new Date().toISOString();

      await store.setConversation('conv-1', {
        messages: [{ id: 'msg-1', role: 'user', content: 'Hello', timestamp: now }],
        metadata: { createdAt: now, updatedAt: now, messageCount: 1 },
      });

      const list = await manager.listConversations(store);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.some((c) => c.id === 'conv-1')).toBe(true);
    });

    it('throws when conversationStore is null', async () => {
      await expect(manager.listConversations(null)).rejects.toThrow(
        'ConversationStore not initialized',
      );
    });
  });

  // ── getSession ───────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('returns current session state', () => {
      const session = manager.getSession();
      expect(session).toHaveProperty('sessionId');
      expect(session).toHaveProperty('sessionDir');
    });

    it('reflects updated state after createNewConversation', async () => {
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator)! });
      manager = new SessionManager(deps);

      const result = await manager.createNewConversation({ memPersist: true });

      const session = manager.getSession();
      expect(session.sessionId).toBe(result.sessionId);
      expect(session.sessionDir).toBe(result.sessionDir);
    });
  });

  // ── setSessionState ──────────────────────────────────────────────────────

  describe('setSessionState', () => {
    it('sets session state for explicit session initialization', () => {
      manager.setSessionState({
        sessionId: 'explicit-session',
        sessionDir: '/tmp/explicit-session',
        sessionInitialized: true,
      });

      expect(manager.getSession().sessionId).toBe('explicit-session');
      expect(manager.getSession().sessionDir).toBe('/tmp/explicit-session');
      expect(manager.isSessionInitialized()).toBe(true);
    });

    it('allows setting null session state', () => {
      // First set some state
      manager.setSessionState({
        sessionId: 'some-session',
        sessionDir: '/tmp/some-session',
        sessionInitialized: true,
      });

      // Then reset it
      manager.setSessionState({
        sessionId: null,
        sessionDir: null,
        sessionInitialized: false,
      });

      expect(manager.getSession().sessionId).toBeNull();
      expect(manager.getSession().sessionDir).toBeNull();
      expect(manager.isSessionInitialized()).toBe(false);
    });
  });

  // ── reset ────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('resets all session state to defaults', async () => {
      // First set up some state
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator)! });
      manager = new SessionManager(deps);

      await manager.createNewConversation({ memPersist: true });
      expect(manager.isSessionInitialized()).toBe(true);

      // Then reset
      manager.reset();

      expect(manager.getSession().sessionId).toBeNull();
      expect(manager.getSession().sessionDir).toBeNull();
      expect(manager.isSessionInitialized()).toBe(false);
    });
  });
});
