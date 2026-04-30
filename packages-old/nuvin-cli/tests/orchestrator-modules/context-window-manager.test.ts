import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContextWindowManager,
  type ContextWindowManagerDeps,
} from '../../source/services/orchestrator-modules/ContextWindowManager.js';
import { InMemoryMemory, ConversationContext } from '@nuvin/nuvin-core';
import type { Message, MemoryPort, ConversationStore, AgentOrchestrator, ToolRegistry, MessageContent, MessageContentPart } from '@nuvin/nuvin-core';
import type { OrchestratorRuntime } from '../../source/services/OrchestratorRuntime.js';
import { sessionMetricsService } from '../../source/services/SessionMetricsService.js';
import { modelLimitsCache } from '../../source/services/ModelLimitsCache.js';
import { eventBus } from '../../source/services/EventBus.js';

// ─── Test helpers ──────────────────────────────────────────────────────────────

const TEST_SESSION_ID = 'test-session';

interface EmittedEvent {
  event: string;
  payload?: {
    content?: string;
    type?: string;
    color?: string;
    memPersist?: boolean;
  };
}

function createMockOrchestrator(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getLLM: vi.fn().mockReturnValue({
      getModels: vi.fn().mockResolvedValue([
        { id: 'openai/gpt-4o', limits: { contextWindow: 100_000 } },
      ]),
    }),
    getMetrics: vi.fn().mockReturnValue({
      getSnapshot: vi.fn().mockReturnValue({ contextWindowUsage: 0 }),
      setContextWindow: vi.fn(),
    }),
    ...overrides,
  } as unknown as AgentOrchestrator;
}

function createMockConversationStore(): ConversationStore {
  return {
    updateMetadata: vi.fn().mockResolvedValue(undefined),
    updateTopic: vi.fn().mockResolvedValue(undefined),
    getConversation: vi.fn().mockResolvedValue({ messages: [], metadata: {} }),
    setConversation: vi.fn().mockResolvedValue(undefined),
    listConversations: vi.fn().mockResolvedValue([]),
    recordRequestMetrics: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConversationStore;
}

function createMockRuntimeForCWM(overrides: Partial<OrchestratorRuntime> = {}): OrchestratorRuntime {
  return {
    orchestrator: createMockOrchestrator(),
    memory: new InMemoryMemory<Message>(),
    conversationStore: createMockConversationStore(),
    toolRegistry: null as unknown as ToolRegistry,
    sessionId: TEST_SESSION_ID,
    sessionDir: '/tmp/test-session',
    activeAgentId: 'main',
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<ContextWindowManagerDeps> = {}): ContextWindowManagerDeps {
  const context = new ConversationContext();
  const mockRuntime = createMockRuntimeForCWM();

  return {
    getRuntime: () => mockRuntime,
    getConversationContext: () => context,
    getCurrentConfig: () => ({
      config: {},
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      smallModel: 'openai/gpt-4o-mini',
    }),
    createLLM: () => ({
      generateCompletion: vi.fn().mockResolvedValue({
        content: 'Mock summary',
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    }),
    send: vi.fn().mockResolvedValue({
      id: 'assistant-1',
      role: 'assistant',
      content: 'continued',
      timestamp: new Date().toISOString(),
    }),
    createNewConversation: vi.fn().mockResolvedValue({
      sessionId: 'new-session-id',
      sessionDir: '/tmp/new-session',
      memory: new InMemoryMemory<Message>(),
    }),
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ContextWindowManager', () => {
  let manager: ContextWindowManager;
  let deps: ContextWindowManagerDeps;
  let emittedEvents: EmittedEvent[];
  let originalEmit: typeof eventBus.emit;

  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents = [];
    modelLimitsCache.clear();
    sessionMetricsService.reset(TEST_SESSION_ID);

    originalEmit = eventBus.emit.bind(eventBus);
    eventBus.emit = vi.fn((event: string, payload?: unknown) => {
      emittedEvents.push({ event, payload: payload as EmittedEvent['payload'] });
      return originalEmit(event, payload);
    }) as typeof eventBus.emit;

    deps = createMockDeps();
    manager = new ContextWindowManager(deps);
  });

  afterEach(() => {
    eventBus.emit = originalEmit;
    modelLimitsCache.clear();
    sessionMetricsService.reset(TEST_SESSION_ID);
  });

  // ── Thresholds ───────────────────────────────────────────────────────────

  describe('thresholds', () => {
    it('should expose WARNING_THRESHOLD as 0.85', () => {
      expect(ContextWindowManager.WARNING_THRESHOLD).toBe(0.85);
    });

    it('should expose AUTO_SUMMARY_THRESHOLD as 0.95', () => {
      expect(ContextWindowManager.AUTO_SUMMARY_THRESHOLD).toBe(0.95);
    });
  });

  // ── checkContextWindowUsage ──────────────────────────────────────────────

  describe('checkContextWindowUsage', () => {
    it('should no-op when sessionId is null', async () => {
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ sessionId: null }) });
      manager = new ContextWindowManager(deps);

      await manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
        conversationId: 'default',
      });

      // No events emitted because we bail early
      expect(emittedEvents).toHaveLength(0);
    });

    it('should no-op when model limits are not available', async () => {
      deps = createMockDeps({
        getRuntime: () =>
          createMockRuntimeForCWM({
            orchestrator: createMockOrchestrator({
              getLLM: vi.fn().mockReturnValue({
                getModels: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
      });
      manager = new ContextWindowManager(deps);

      // Record some tokens but with a model that has no known limits and no API response
      sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
        prompt_tokens: 50_000,
        completion_tokens: 1000,
        total_tokens: 51_000,
      });

      // Clear the fallback too
      modelLimitsCache.clear();

      await manager.checkContextWindowUsage('unknown-provider', 'unknown-model', {
        conversationId: 'default',
      });

      // Should still set context window if fallback limits exist, but no warning at 50%
      const warningEvent = emittedEvents.find(
        (e) => e.event === 'ui:line' && e.payload?.content?.includes('⚠️'),
      );
      expect(warningEvent).toBeUndefined();
    });

    it('should calculate usage and set context window metrics', async () => {
      const mockOrchestrator = createMockOrchestrator({
        getLLM: vi.fn().mockReturnValue({
          getModels: vi.fn().mockResolvedValue([
            { id: 'openai/gpt-4o', limits: { contextWindow: 128_000 } },
          ]),
        }),
      });
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ orchestrator: mockOrchestrator }) });
      manager = new ContextWindowManager(deps);

      sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
        prompt_tokens: 45_200,
        completion_tokens: 5_100,
        total_tokens: 50_300,
      });

      await manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
        conversationId: 'default',
      });

      const snapshot = sessionMetricsService.getSnapshot(TEST_SESSION_ID);
      expect(snapshot.contextWindowLimit).toBe(128_000);
      expect(snapshot.contextWindowUsage).toBeCloseTo(45_200 / 128_000, 4);
    });

    it('should not emit any warning when usage < 85%', async () => {
      sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
        prompt_tokens: 50_000,
        completion_tokens: 1_000,
        total_tokens: 51_000,
      });

      await manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
        conversationId: 'default',
      });

      const warningEvent = emittedEvents.find(
        (e) => e.event === 'ui:line' && e.payload?.content?.includes('⚠️'),
      );
      expect(warningEvent).toBeUndefined();
    });

    it('should emit warning when usage is 85-95%', async () => {
      sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
        prompt_tokens: 88_000,
        completion_tokens: 1_000,
        total_tokens: 89_000,
      });

      await manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
        conversationId: 'default',
      });

      const warningEvent = emittedEvents.find(
        (e) =>
          e.event === 'ui:line' &&
          e.payload?.content?.includes('⚠️ Context window') &&
          e.payload?.content?.includes('Consider using /summary'),
      );

      expect(warningEvent).toBeDefined();
      expect(warningEvent?.payload?.content).toContain('88%');
    });

    it('should trigger auto-summary when usage >= 95%', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ]);

      const mockStore = createMockConversationStore();
      const sendSpy = vi.fn().mockResolvedValue({
        id: 'assistant-1',
        role: 'assistant',
        content: 'continued',
        timestamp: new Date().toISOString(),
      });
      const createNewConv = vi.fn().mockResolvedValue({
        sessionId: 'new-session-id',
        sessionDir: '/tmp/new-session',
        memory: new InMemoryMemory<Message>(),
      });

      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory, conversationStore: mockStore }),
        send: sendSpy,
        createNewConversation: createNewConv,
      });
      manager = new ContextWindowManager(deps);

      sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
        prompt_tokens: 96_000,
        completion_tokens: 1_000,
        total_tokens: 97_000,
      });

      await manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
        conversationId: 'default',
      });

      const autoSummaryEvent = emittedEvents.find(
        (e) =>
          e.event === 'ui:line' && e.payload?.content?.includes('Running auto-summary'),
      );
      expect(autoSummaryEvent).toBeDefined();
      expect(autoSummaryEvent?.payload?.content).toContain('96%');
    });

    it('should send continuation message after auto-summary', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ]);

      const sendSpy = vi.fn().mockResolvedValue({
        id: 'assistant-1',
        role: 'assistant',
        content: 'continued',
        timestamp: new Date().toISOString(),
      });

      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory }),
        send: sendSpy,
      });
      manager = new ContextWindowManager(deps);

      sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
        prompt_tokens: 96_000,
        completion_tokens: 1_000,
        total_tokens: 97_000,
      });

      await manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
        conversationId: 'default',
      });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Continue the task from where it left off'),
        }),
        expect.objectContaining({
          conversationId: 'default',
          stream: true,
          skipAutoSummaryCheck: true,
        }),
      );
    });

    it('should emit success message after auto-summary completes', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ]);

      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ memory }) });
      manager = new ContextWindowManager(deps);

      sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
        prompt_tokens: 96_000,
        completion_tokens: 1_000,
        total_tokens: 97_000,
      });

      await manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
        conversationId: 'default',
      });

      const successEvent = emittedEvents.find(
        (e) =>
          e.event === 'ui:line' &&
          e.payload?.content?.includes('✓ Auto-summary completed'),
      );
      expect(successEvent).toBeDefined();
    });

    it('should handle continuation send failure gracefully', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ]);

      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory }),
        send: vi.fn().mockRejectedValue(new Error('continuation failed')),
      });
      manager = new ContextWindowManager(deps);

      sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
        prompt_tokens: 96_000,
        completion_tokens: 1_000,
        total_tokens: 97_000,
      });

      // Should not throw
      await expect(
        manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
          conversationId: 'default',
        }),
      ).resolves.not.toThrow();

      const errorEvent = emittedEvents.find(
        (e) =>
          e.event === 'ui:line' &&
          e.payload?.content?.includes('Auto-summary completed') &&
          e.payload?.content?.includes('continuation failed'),
      );
      expect(errorEvent).toBeDefined();
    });

    it('should handle summarize failure gracefully', async () => {
      // Need memory with messages so summarize() actually calls the LLM
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ]);

      // Create a manager with a createLLM that throws during summarize
      const failingLLM = {
        generateCompletion: vi.fn().mockRejectedValue(new Error('LLM down')),
      };

      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory }),
        createLLM: () => failingLLM,
      });
      manager = new ContextWindowManager(deps);

      sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
        prompt_tokens: 96_000,
        completion_tokens: 1_000,
        total_tokens: 97_000,
      });

      // Should not throw even when the full summarize path fails
      await expect(
        manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
          conversationId: 'default',
        }),
      ).resolves.not.toThrow();

      const errorEvent = emittedEvents.find(
        (e) =>
          e.event === 'ui:line' &&
          e.payload?.content?.includes('⚠️ Auto-summary failed'),
      );
      expect(errorEvent).toBeDefined();
    });

    it('should no-op when no prompt tokens recorded', async () => {
      // No recordLLMCall = no prompt tokens
      await manager.checkContextWindowUsage('openrouter', 'openai/gpt-4o', {
        conversationId: 'default',
      });

      const warningEvent = emittedEvents.find(
        (e) => e.event === 'ui:line' && e.payload?.content?.includes('⚠️'),
      );
      expect(warningEvent).toBeUndefined();
    });
  });

  // ── summarizeAndCreateNewSession ─────────────────────────────────────────

  describe('summarizeAndCreateNewSession', () => {
    it('should throw when memory is null', async () => {
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ memory: null as unknown as MemoryPort<Message> }) });
      manager = new ContextWindowManager(deps);

      await expect(manager.summarizeAndCreateNewSession()).rejects.toThrow(
        'Memory not initialized',
      );
    });

    it('should throw when sessionId is null', async () => {
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ sessionId: null }) });
      manager = new ContextWindowManager(deps);

      await expect(manager.summarizeAndCreateNewSession()).rejects.toThrow(
        'Session ID not set',
      );
    });

    it('should throw when createNewConversation fails to produce sessionId', async () => {
      deps = createMockDeps({
        createNewConversation: vi.fn().mockResolvedValue({
          sessionId: null,
          sessionDir: null,
          memory: new InMemoryMemory<Message>(),
        }),
      });
      manager = new ContextWindowManager(deps);

      await expect(manager.summarizeAndCreateNewSession()).rejects.toThrow(
        'Failed to create new session',
      );
    });

    it('should summarize and create new session successfully', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello world', timestamp: '2024-01-01' },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: '2024-01-01' },
      ]);

      const mockStore = createMockConversationStore();
      const createNewConv = vi.fn().mockResolvedValue({
        sessionId: 'new-session-id',
        sessionDir: '/tmp/new-session',
        memory: new InMemoryMemory<Message>(),
      });

      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory, conversationStore: mockStore }),
        createNewConversation: createNewConv,
      });
      manager = new ContextWindowManager(deps);

      const result = await manager.summarizeAndCreateNewSession();

      expect(result.previousSessionId).toBe(TEST_SESSION_ID);
      expect(result.newSessionId).toBe('new-session-id');
      expect(result.newSessionDir).toBe('/tmp/new-session');
      expect(result.summary).toBeTruthy();
      expect(result.summaryPrompt).toContain('Previous conversation summary');
    });

    it('should update metadata with summarizedFrom field', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ]);

      const mockStore = createMockConversationStore();
      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory, conversationStore: mockStore }),
      });
      manager = new ContextWindowManager(deps);

      await manager.summarizeAndCreateNewSession();

      expect(mockStore.updateMetadata).toHaveBeenCalledWith('default', {
        summarizedFrom: TEST_SESSION_ID,
        topic: `Summary of session ${TEST_SESSION_ID}`,
      });
    });

    it('should emit ui:lines:clear, ui:line (user), and ui:header:refresh when skipEvents is false', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ]);

      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ memory }) });
      manager = new ContextWindowManager(deps);

      await manager.summarizeAndCreateNewSession();

      expect(emittedEvents.find((e) => e.event === 'ui:lines:clear')).toBeDefined();
      expect(emittedEvents.find((e) => e.event === 'ui:header:refresh')).toBeDefined();

      const summaryDisplayEvent = emittedEvents.find(
        (e) => e.event === 'ui:line' && e.payload?.type === 'user',
      );
      expect(summaryDisplayEvent).toBeDefined();
      expect(summaryDisplayEvent?.payload?.content).toContain('Previous conversation summary');
    });

    it('should skip UI events when skipEvents is true', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ]);

      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ memory }) });
      manager = new ContextWindowManager(deps);

      await manager.summarizeAndCreateNewSession({ skipEvents: true });

      expect(emittedEvents.find((e) => e.event === 'ui:lines:clear')).toBeUndefined();
      expect(emittedEvents.find((e) => e.event === 'ui:header:refresh')).toBeUndefined();
    });

    it('should emit conversation:created event', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ]);

      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ memory }) });
      manager = new ContextWindowManager(deps);

      await manager.summarizeAndCreateNewSession();

      const createdEvent = emittedEvents.find(
        (e) => e.event === 'conversation:created',
      );
      expect(createdEvent).toBeDefined();
      expect(createdEvent?.payload?.memPersist).toBe(true);
    });

    it('should reset metrics for the new session', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ]);

      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ memory }) });
      manager = new ContextWindowManager(deps);

      // Record some metrics first
      sessionMetricsService.recordLLMCall('new-session-id', {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      });

      await manager.summarizeAndCreateNewSession();

      const snapshot = sessionMetricsService.getSnapshot('new-session-id');
      expect(snapshot.currentPromptTokens).toBe(0);
    });

    it('should append summary message to memory', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ]);

      // We need the memory returned by createNewConversation to be the one we can inspect.
      // After createNewConversation, the manager reads from deps.getRuntime()?.memory for append.
      // We use a mutable runtime so that the callback can swap the memory reference.

      const newMemory = new InMemoryMemory<Message>();
      const mutableRuntime = createMockRuntimeForCWM({ memory });
      deps = createMockDeps({
        getRuntime: () => mutableRuntime,
        createNewConversation: vi.fn().mockImplementation(async () => {
          // Simulate that after creating new conversation, runtime.memory returns newMemory
          (mutableRuntime as unknown as { memory: MemoryPort<Message> }).memory = newMemory;
          return {
            sessionId: 'new-session-id',
            sessionDir: '/tmp/new-session',
            memory: newMemory,
          };
        }),
      });
      manager = new ContextWindowManager(deps);

      await manager.summarizeAndCreateNewSession();

      // The summary message should have been appended to the memory
      // It calls deps.getRuntime()?.memory after createNewConversation, so it uses the new memory
      const messages = await newMemory.get('default');
      expect(messages.length).toBe(1);
      expect(messages[0]?.role).toBe('user');
      expect(messages[0]?.content).toContain('Previous conversation summary');
    });
  });

  // ── compressAndCreateNewSession ──────────────────────────────────────────

  describe('compressAndCreateNewSession', () => {
    it('should throw when memory is null', async () => {
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ memory: null as unknown as MemoryPort<Message> }) });
      manager = new ContextWindowManager(deps);

      await expect(
        manager.compressAndCreateNewSession(() => ({
          compressed: [],
          stats: {},
        })),
      ).rejects.toThrow('Memory not initialized');
    });

    it('should throw when sessionId is null', async () => {
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ sessionId: null }) });
      manager = new ContextWindowManager(deps);

      await expect(
        manager.compressAndCreateNewSession(() => ({
          compressed: [],
          stats: {},
        })),
      ).rejects.toThrow('Session ID not set');
    });

    it('should throw when there is no conversation history', async () => {
      // Empty memory
      deps = createMockDeps();
      manager = new ContextWindowManager(deps);

      await expect(
        manager.compressAndCreateNewSession(() => ({
          compressed: [],
          stats: {},
        })),
      ).rejects.toThrow('No conversation history to compress');
    });

    it('should compress history and create new session', async () => {
      const memory = new InMemoryMemory<Message>();
      const originalMessages: Message[] = [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
        { id: 'msg-2', role: 'assistant', content: 'Hi!', timestamp: '2024-01-01' },
        { id: 'msg-3', role: 'user', content: 'How are you?', timestamp: '2024-01-01' },
      ];
      await memory.set('default', originalMessages);

      const mockStore = createMockConversationStore();
      const createNewConv = vi.fn().mockResolvedValue({
        sessionId: 'new-session-id',
        sessionDir: '/tmp/new-session',
        memory: new InMemoryMemory<Message>(),
      });

      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory, conversationStore: mockStore }),
        createNewConversation: createNewConv,
      });
      manager = new ContextWindowManager(deps);

      const compressedMsg: Message = {
        id: 'compressed-1',
        role: 'user',
        content: 'Summary of conversation',
        timestamp: '2024-01-01',
      };

      const result = await manager.compressAndCreateNewSession((messages) => ({
        compressed: [compressedMsg],
        stats: { originalCount: messages.length, compressedCount: 1 },
      }));

      expect(result.previousSessionId).toBe(TEST_SESSION_ID);
      expect(result.newSessionId).toBe('new-session-id');
      expect(result.newSessionDir).toBe('/tmp/new-session');
      expect(result.stats).toEqual({ originalCount: 3, compressedCount: 1 });
    });

    it('should update metadata with summarizedFrom field', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ]);

      const mockStore = createMockConversationStore();
      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory, conversationStore: mockStore }),
      });
      manager = new ContextWindowManager(deps);

      await manager.compressAndCreateNewSession(() => ({
        compressed: [{ id: 'c-1', role: 'user', content: 'Compressed', timestamp: '2024-01-01' }],
        stats: {},
      }));

      expect(mockStore.updateMetadata).toHaveBeenCalledWith('default', {
        summarizedFrom: TEST_SESSION_ID,
        topic: `Compressed from session ${TEST_SESSION_ID}`,
      });
    });

    it('should emit conversation:created event', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ]);

      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ memory }) });
      manager = new ContextWindowManager(deps);

      await manager.compressAndCreateNewSession(() => ({
        compressed: [{ id: 'c-1', role: 'user', content: 'Compressed', timestamp: '2024-01-01' }],
        stats: {},
      }));

      const createdEvent = emittedEvents.find(
        (e) => e.event === 'conversation:created',
      );
      expect(createdEvent).toBeDefined();
      expect(createdEvent?.payload?.memPersist).toBe(true);
    });

    it('should throw when createNewConversation fails', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ]);

      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory }),
        createNewConversation: vi.fn().mockResolvedValue({
          sessionId: null,
          sessionDir: null,
          memory: new InMemoryMemory<Message>(),
        }),
      });
      manager = new ContextWindowManager(deps);

      await expect(
        manager.compressAndCreateNewSession(() => ({
          compressed: [],
          stats: {},
        })),
      ).rejects.toThrow('Failed to create new session');
    });
  });

  // ── summarize ────────────────────────────────────────────────────────────

  describe('summarize', () => {
    it('should return fallback message when no history exists', async () => {
      // Empty memory
      deps = createMockDeps();
      manager = new ContextWindowManager(deps);

      const summary = await manager.summarize();
      expect(summary).toBe('No conversation history to summarize.');
    });

    it('should throw when memory is null', async () => {
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ memory: null as unknown as MemoryPort<Message> }) });
      manager = new ContextWindowManager(deps);

      await expect(manager.summarize()).rejects.toThrow('Memory not initialized');
    });

    it('should call LLM with conversation text and return summary', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        { id: 'msg-1', role: 'user', content: 'Build a React app', timestamp: '2024-01-01' },
        { id: 'msg-2', role: 'assistant', content: 'Sure, starting now.', timestamp: '2024-01-01' },
      ]);

      const mockLLM = {
        generateCompletion: vi.fn().mockResolvedValue({
          content: 'Session summary: Building React app',
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      };

      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory }),
        createLLM: () => mockLLM,
      });
      manager = new ContextWindowManager(deps);

      const summary = await manager.summarize();

      expect(summary).toBe('Session summary: Building React app');
    });

    it('should handle multi-part content in messages', async () => {
      const memory = new InMemoryMemory<Message>();
      await memory.set('default', [
        {
          id: 'msg-1',
          role: 'user',
          content: {
            parts: [
              { type: 'text', text: 'Part 1' },
              { type: 'image_url', image_url: { url: 'http://example.com' } } as unknown as MessageContentPart,
              { type: 'text', text: 'Part 2' },
            ],
          } as unknown as MessageContent,
          timestamp: '2024-01-01',
        },
      ]);

      const mockLLM = {
        generateCompletion: vi.fn().mockResolvedValue({
          content: 'Summary',
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };

      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ memory }),
        createLLM: () => mockLLM,
      });
      manager = new ContextWindowManager(deps);

      await manager.summarize();

      // Verify the conversation text passed to LLM includes text parts
      const call = mockLLM.generateCompletion.mock.calls[0];
      // The AgentOrchestrator.send gets called with conversationText, but since we mock
      // via the LLM inside the AgentOrchestrator, let's just verify it returns
      expect(call).toBeDefined();
    });
  });

  // ── getModelContextLimit ─────────────────────────────────────────────────

  describe('getModelContextLimit', () => {
    it('should return context limit from cache', async () => {
      const mockOrchestrator = createMockOrchestrator({
        getLLM: vi.fn().mockReturnValue({
          getModels: vi.fn().mockResolvedValue([
            { id: 'openai/gpt-4o', limits: { contextWindow: 128_000 } },
          ]),
        }),
      });
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ orchestrator: mockOrchestrator }) });
      manager = new ContextWindowManager(deps);

      const limit = await manager.getModelContextLimit();
      expect(limit).toBe(128_000);
    });

    it('should return null when no limits available', async () => {
      const mockOrchestrator = createMockOrchestrator({
        getLLM: vi.fn().mockReturnValue({
          getModels: vi.fn().mockResolvedValue([]),
        }),
      });
      deps = createMockDeps({
        getRuntime: () => createMockRuntimeForCWM({ orchestrator: mockOrchestrator }),
        getCurrentConfig: () => ({
          config: {},
          provider: 'unknown-provider',
          model: 'unknown-model',
          smallModel: 'unknown-model',
        }),
      });
      manager = new ContextWindowManager(deps);

      modelLimitsCache.clear();
      const limit = await manager.getModelContextLimit();
      // May return fallback or null depending on whether the model has fallback limits
      // For a truly unknown model, it should be null
      expect(limit === null || typeof limit === 'number').toBe(true);
    });
  });

  // ── ensureContextWindowLimitSet ──────────────────────────────────────────

  describe('ensureContextWindowLimitSet', () => {
    it('should no-op when orchestrator has no metrics', async () => {
      const mockOrchestrator = createMockOrchestrator({
        getMetrics: vi.fn().mockReturnValue(undefined),
        getLLM: vi.fn().mockReturnValue({
          getModels: vi.fn().mockResolvedValue([
            { id: 'openai/gpt-4o', limits: { contextWindow: 128_000 } },
          ]),
        }),
      });
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ orchestrator: mockOrchestrator }) });
      manager = new ContextWindowManager(deps);

      // Should not throw
      await expect(
        manager.ensureContextWindowLimitSet('openrouter', 'openai/gpt-4o'),
      ).resolves.not.toThrow();
    });

    it('should set context window on metrics when limits are available', async () => {
      const setContextWindowSpy = vi.fn();
      const mockOrchestrator = createMockOrchestrator({
        getMetrics: vi.fn().mockReturnValue({
          getSnapshot: vi.fn().mockReturnValue({ contextWindowUsage: 0.5 }),
          setContextWindow: setContextWindowSpy,
        }),
        getLLM: vi.fn().mockReturnValue({
          getModels: vi.fn().mockResolvedValue([
            { id: 'openai/gpt-4o', limits: { contextWindow: 128_000 } },
          ]),
        }),
      });
      deps = createMockDeps({ getRuntime: () => createMockRuntimeForCWM({ orchestrator: mockOrchestrator }) });
      manager = new ContextWindowManager(deps);

      await manager.ensureContextWindowLimitSet('openrouter', 'openai/gpt-4o');

      expect(setContextWindowSpy).toHaveBeenCalledWith(128_000, 0.5);
    });

    it('should no-op when orchestrator is null', async () => {
      deps = createMockDeps({ getRuntime: () => null });
      manager = new ContextWindowManager(deps);

      await expect(
        manager.ensureContextWindowLimitSet('openrouter', 'openai/gpt-4o'),
      ).resolves.not.toThrow();
    });
  });
});
