import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrchestratorManager } from '../source/services/OrchestratorManager.js';
import { sessionMetricsService } from '../source/services/SessionMetricsService.js';
import { InMemoryMemory } from '@nuvin/nuvin-core';
import type { Message, MemoryPort } from '@nuvin/nuvin-core';
import { eventBus } from '../source/services/EventBus.js';
import { modelLimitsCache } from '../source/services/ModelLimitsCache.js';

const TEST_SESSION_ID = 'test-session';

interface MockOrchestrator {
  getLLM: ReturnType<typeof vi.fn>;
  setMemory: ReturnType<typeof vi.fn>;
  setEvents: ReturnType<typeof vi.fn>;
  setMetrics: ReturnType<typeof vi.fn>;
}

interface MockConversationStore {
  updateMetadata: ReturnType<typeof vi.fn>;
}

interface TestableOrchestratorManager {
  sessionId: string;
  memory: MemoryPort<Message> | null;
  orchestrator: MockOrchestrator | null;
  conversationStore: MockConversationStore | null;
  handlers: unknown;
  memPersist: boolean;
  summarize: ReturnType<typeof vi.fn>;
  checkContextWindowUsage: (provider: string, model: string) => Promise<void>;
  createNewConversation: ReturnType<typeof vi.fn>;
}

interface EmittedEvent {
  event: string;
  payload?: {
    content?: string;
    type?: string;
    memPersist?: boolean;
  };
}

describe('Context Window Auto-Summary', () => {
  let manager: OrchestratorManager;
  let testableManager: TestableOrchestratorManager;
  let eventEmitted: EmittedEvent[] = [];
  let originalEmit: typeof eventBus.emit;

  beforeEach(() => {
    vi.clearAllMocks();
    eventEmitted = [];
    modelLimitsCache.clear();
    sessionMetricsService.reset(TEST_SESSION_ID);

    manager = new OrchestratorManager();
    testableManager = manager as unknown as TestableOrchestratorManager;
    testableManager.sessionId = TEST_SESSION_ID;

    originalEmit = eventBus.emit.bind(eventBus);
    eventBus.emit = vi.fn((event, payload?) => {
      eventEmitted.push({ event, payload });
      return originalEmit(event, payload);
    }) as typeof eventBus.emit;
  });

  afterEach(() => {
    eventBus.emit = originalEmit;
    modelLimitsCache.clear();
    sessionMetricsService.reset(TEST_SESSION_ID);
  });

  it('should calculate context window usage from prompt tokens', async () => {
    const memory = new InMemoryMemory<Message>();
    testableManager.memory = memory;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([
          {
            id: 'openai/gpt-4o',
            limits: { contextWindow: 128000 },
          },
        ]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 45200,
      completion_tokens: 5100,
      total_tokens: 50300,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    const snapshot = sessionMetricsService.getSnapshot(TEST_SESSION_ID);
    expect(snapshot.contextWindowLimit).toBe(128000);
    expect(snapshot.contextWindowUsage).toBeCloseTo(45200 / 128000, 4);
  });

  it('should emit warning when usage is 85-95%', async () => {
    const memory = new InMemoryMemory<Message>();
    testableManager.memory = memory;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([
          {
            id: 'openai/gpt-4o',
            limits: { contextWindow: 100000 },
          },
        ]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 88000,
      completion_tokens: 1000,
      total_tokens: 89000,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    const warningEvent = eventEmitted.find(
      (e: EmittedEvent) =>
        e.event === 'ui:line' &&
        e.payload?.content?.includes('⚠️ Context window') &&
        e.payload?.content?.includes('Consider using /summary'),
    );

    expect(warningEvent).toBeDefined();
    expect((warningEvent as EmittedEvent)?.payload.content).toContain('88%');
  });

  it('should trigger auto-summary when usage >= 95%', async () => {
    const memory = new InMemoryMemory<Message>();
    const testMessage: Message = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    };
    await memory.set('default', [testMessage]);
    testableManager.memory = memory;
    testableManager.handlers = {};
    testableManager.memPersist = true;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([
          {
            id: 'openai/gpt-4o',
            limits: { contextWindow: 100000 },
          },
        ]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    testableManager.conversationStore = {
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    };

    testableManager.summarize = vi.fn().mockResolvedValue('Summary of conversation');
    testableManager.createNewConversation = vi.fn().mockResolvedValue({
      sessionId: 'new-session-id',
      sessionDir: '/tmp/new-session',
      memory: new InMemoryMemory(),
    });

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 96000,
      completion_tokens: 1000,
      total_tokens: 97000,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    const autoSummaryEvent = eventEmitted.find(
      (e: EmittedEvent) => e.event === 'ui:line' && e.payload?.content?.includes('Running auto-summary'),
    );

    expect(autoSummaryEvent).toBeDefined();
    expect((autoSummaryEvent as EmittedEvent)?.payload.content).toContain('96%');
  });

  it('should create new session after auto-summary instead of replacing history', async () => {
    const memory = new InMemoryMemory<Message>();
    const testMessages: Message[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date().toISOString(),
      },
    ];
    await memory.set('default', testMessages);
    testableManager.memory = memory;
    testableManager.handlers = {};
    testableManager.memPersist = true;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([
          {
            id: 'openai/gpt-4o',
            limits: { contextWindow: 100000 },
          },
        ]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    testableManager.conversationStore = {
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    };

    testableManager.summarize = vi.fn().mockResolvedValue('Summary of conversation');
    testableManager.createNewConversation = vi.fn().mockResolvedValue({
      sessionId: 'new-session-id',
      sessionDir: '/tmp/new-session',
      memory: new InMemoryMemory(),
    });

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 96000,
      completion_tokens: 1000,
      total_tokens: 97000,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    expect(testableManager.createNewConversation).toHaveBeenCalledWith({
      memPersist: true,
    });
  });

  it('should update metadata with summarizedFrom field after auto-summary', async () => {
    const memory = new InMemoryMemory<Message>();
    const testMessage: Message = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    };
    await memory.set('default', [testMessage]);
    testableManager.memory = memory;
    testableManager.handlers = {};
    testableManager.memPersist = true;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([
          {
            id: 'openai/gpt-4o',
            limits: { contextWindow: 100000 },
          },
        ]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    const mockUpdateMetadata = vi.fn().mockResolvedValue(undefined);
    testableManager.conversationStore = {
      updateMetadata: mockUpdateMetadata,
    };

    testableManager.summarize = vi.fn().mockResolvedValue('Summary of conversation');
    testableManager.createNewConversation = vi.fn().mockResolvedValue({
      sessionId: 'new-session-id',
      sessionDir: '/tmp/new-session',
      memory: new InMemoryMemory(),
    });

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 96000,
      completion_tokens: 1000,
      total_tokens: 97000,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    expect(mockUpdateMetadata).toHaveBeenCalledWith('default', {
      summarizedFrom: TEST_SESSION_ID,
      topic: `Summary of session ${TEST_SESSION_ID}`,
    });
  });

  it('should emit conversation:created event after auto-summary', async () => {
    const memory = new InMemoryMemory<Message>();
    const testMessage: Message = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    };
    await memory.set('default', [testMessage]);
    testableManager.memory = memory;
    testableManager.handlers = {};
    testableManager.memPersist = true;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([
          {
            id: 'openai/gpt-4o',
            limits: { contextWindow: 100000 },
          },
        ]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    testableManager.conversationStore = {
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    };

    testableManager.summarize = vi.fn().mockResolvedValue('Summary of conversation');
    testableManager.createNewConversation = vi.fn().mockResolvedValue({
      sessionId: 'new-session-id',
      sessionDir: '/tmp/new-session',
      memory: new InMemoryMemory(),
    });

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 96000,
      completion_tokens: 1000,
      total_tokens: 97000,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    const conversationCreatedEvent = eventEmitted.find((e: EmittedEvent) => e.event === 'conversation:created');

    expect(conversationCreatedEvent).toBeDefined();
    expect((conversationCreatedEvent as EmittedEvent)?.payload?.memPersist).toBe(true);
  });

  it('should emit ui:lines:clear and ui:header:refresh after auto-summary', async () => {
    const memory = new InMemoryMemory<Message>();
    const testMessage: Message = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    };
    await memory.set('default', [testMessage]);
    testableManager.memory = memory;
    testableManager.handlers = {};
    testableManager.memPersist = true;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([
          {
            id: 'openai/gpt-4o',
            limits: { contextWindow: 100000 },
          },
        ]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    testableManager.conversationStore = {
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    };

    testableManager.summarize = vi.fn().mockResolvedValue('Summary of conversation');
    testableManager.createNewConversation = vi.fn().mockResolvedValue({
      sessionId: 'new-session-id',
      sessionDir: '/tmp/new-session',
      memory: new InMemoryMemory(),
    });

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 96000,
      completion_tokens: 1000,
      total_tokens: 97000,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    const clearEvent = eventEmitted.find((e: EmittedEvent) => e.event === 'ui:lines:clear');
    const refreshEvent = eventEmitted.find((e: EmittedEvent) => e.event === 'ui:header:refresh');

    expect(clearEvent).toBeDefined();
    expect(refreshEvent).toBeDefined();
  });

  it('should not trigger auto-summary when usage < 85%', async () => {
    const memory = new InMemoryMemory<Message>();
    testableManager.memory = memory;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([
          {
            id: 'openai/gpt-4o',
            limits: { contextWindow: 100000 },
          },
        ]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    const summarizeSpy = vi.fn().mockResolvedValue('Summary of conversation');
    testableManager.summarize = summarizeSpy;

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 50000,
      completion_tokens: 1000,
      total_tokens: 51000,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    const warningEvent = eventEmitted.find(
      (e: EmittedEvent) => e.event === 'ui:line' && e.payload?.content?.includes('⚠️'),
    );

    expect(warningEvent).toBeUndefined();
    expect(summarizeSpy).not.toHaveBeenCalled();
  });

  it('should use fallback limits when model limits are not available from API', async () => {
    const memory = new InMemoryMemory<Message>();
    testableManager.memory = memory;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 45200,
      completion_tokens: 5100,
      total_tokens: 50300,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    const snapshot = sessionMetricsService.getSnapshot(TEST_SESSION_ID);
    expect(snapshot.contextWindowLimit).toBe(128000);
  });

  it('should show summary message in UI after auto-summary', async () => {
    const memory = new InMemoryMemory<Message>();
    const testMessage: Message = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    };
    await memory.set('default', [testMessage]);
    testableManager.memory = memory;
    testableManager.handlers = {};
    testableManager.memPersist = true;

    testableManager.orchestrator = {
      getLLM: vi.fn().mockReturnValue({
        getModels: vi.fn().mockResolvedValue([
          {
            id: 'openai/gpt-4o',
            limits: { contextWindow: 100000 },
          },
        ]),
      }),
      setMemory: vi.fn(),
      setEvents: vi.fn(),
      setMetrics: vi.fn(),
    } as MockOrchestrator;

    testableManager.conversationStore = {
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    };

    testableManager.summarize = vi.fn().mockResolvedValue('This is a test summary');
    testableManager.createNewConversation = vi.fn().mockResolvedValue({
      sessionId: 'new-session-id',
      sessionDir: '/tmp/new-session',
      memory: new InMemoryMemory(),
    });

    sessionMetricsService.recordLLMCall(TEST_SESSION_ID, {
      prompt_tokens: 96000,
      completion_tokens: 1000,
      total_tokens: 97000,
    });

    const provider = 'openrouter';
    const model = 'openai/gpt-4o';

    await testableManager.checkContextWindowUsage(provider, model);

    const summaryDisplayEvent = eventEmitted.find(
      (e: EmittedEvent) =>
        e.event === 'ui:line' &&
        e.payload?.type === 'user' &&
        e.payload?.content?.includes('Previous conversation summary'),
    );

    expect(summaryDisplayEvent).toBeDefined();
    expect(summaryDisplayEvent?.payload?.content).toContain('This is a test summary');
  });
});
