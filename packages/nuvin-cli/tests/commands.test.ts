import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { CommandRegistry } from '../source/modules/commands/registry.js';
import { registerClearCommand } from '../source/modules/commands/definitions/clear.js';
import { registerNewCommand } from '../source/modules/commands/definitions/new.js';
import { registerSudoCommand } from '../source/modules/commands/definitions/sudo.js';
import type { OrchestratorManager } from '../source/services/OrchestratorManager.js';
import type { CommandContext } from '../source/modules/commands/types.js';

const mockEventBus = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('../source/services/EventBus.js', () => ({
  eventBus: mockEventBus,
  TypedEventBus: vi.fn(),
}));

const createMockConfigFunctions = (): CommandContext['config'] => ({
  get: vi.fn((key: string) => {
    if (key === 'memPersist') return false;
    return undefined;
  }) as CommandContext['config']['get'],
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
});

const createMockMemory = () => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  has: vi.fn(),
  list: vi.fn(),
  clear: vi.fn(),
});

describe('/clear command', () => {
  let registry: CommandRegistry;
  let mockMemory: ReturnType<typeof createMockMemory>;
  let mockOrchestratorManager: OrchestratorManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMemory = createMockMemory();

    mockOrchestratorManager = {
      getMemory: vi.fn(() => mockMemory),
      getSession: vi.fn(() => ({ sessionId: 'test-session-id' })),
      getConversationContext: vi.fn(() => ({
        getActiveConversationId: () => 'default',
      })),
    } as unknown as OrchestratorManager;

    registry = new CommandRegistry();
    registry.setConfigFunctions(createMockConfigFunctions());
    registry.setOrchestrator(mockOrchestratorManager);

    registerClearCommand(registry);
  });

  it('should be registered with correct id and description', () => {
    const command = registry.get('/clear');

    expect(command).toBeDefined();
    expect(command?.id).toBe('/clear');
    expect(command?.description).toBe('Clear all messages from the current conversation');
    expect(command?.category).toBe('session');
  });

  it('should clear memory when executed', async () => {
    await registry.execute('/clear');

    expect(mockMemory.delete).toHaveBeenCalledWith('default');
  });

  it('should emit ui:lines:clear event', async () => {
    await registry.execute('/clear');

    expect(mockEventBus.emit).toHaveBeenCalledWith('ui:lines:clear');
  });

  it('should emit ui:clear:complete event', async () => {
    await registry.execute('/clear');

    expect(mockEventBus.emit).toHaveBeenCalledWith('ui:clear:complete');
  });
});

describe('/new command', () => {
  let registry: CommandRegistry;
  let mockMemory: ReturnType<typeof createMockMemory>;
  let mockConfig: ReturnType<typeof createMockConfigFunctions>;
  let mockOrchestratorManager: OrchestratorManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMemory = createMockMemory();
    mockConfig = createMockConfigFunctions();

    mockOrchestratorManager = {
      getStatus: vi.fn(() => 'Ready'),
      getMemory: vi.fn(() => mockMemory),
      getSession: vi.fn(() => ({ sessionId: 'test-session-id' })),
      createNewConversation: vi.fn().mockResolvedValue({
        sessionId: 'new-session-id',
        sessionDir: '/tmp/new-session',
        memory: mockMemory,
      }),
    } as unknown as OrchestratorManager;

    registry = new CommandRegistry();
    registry.setConfigFunctions(mockConfig);
    registry.setOrchestrator(mockOrchestratorManager);

    registerNewCommand(registry);
  });

  it('should be registered with correct id and description', () => {
    const command = registry.get('/new');

    expect(command).toBeDefined();
    expect(command?.id).toBe('/new');
    expect(command?.description).toBe('Start a new conversation session');
    expect(command?.category).toBe('session');
  });

  it('should clear UI messages', async () => {
    await registry.execute('/new');

    expect(mockEventBus.emit).toHaveBeenCalledWith('ui:lines:clear');
  });

  it('should not clear memory (preserves session)', async () => {
    await registry.execute('/new');

    expect(mockMemory.delete).not.toHaveBeenCalled();
  });

  it('should call createNewConversation with memPersist=false by default', async () => {
    await registry.execute('/new');

    expect(mockOrchestratorManager.createNewConversation).toHaveBeenCalledWith(
      expect.objectContaining({ memPersist: false }),
    );
  });

  it('should call createNewConversation with memPersist=true when configured', async () => {
    (mockConfig.get as Mock).mockImplementation((key: string) => {
      if (key === 'session.memPersist') return true;
      return undefined;
    });

    await registry.execute('/new');

    expect(mockOrchestratorManager.createNewConversation).toHaveBeenCalledWith(
      expect.objectContaining({ memPersist: true }),
    );
  });

  it('should emit conversation:created event on success', async () => {
    await registry.execute('/new');

    expect(mockEventBus.emit).toHaveBeenCalledWith('conversation:created', { memPersist: false });
  });

  it('should get session.memPersist config', async () => {
    await registry.execute('/new');

    expect(mockConfig.get).toHaveBeenCalledWith('session.memPersist');
  });
});

describe('/sudo command', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new CommandRegistry();
    registry.setConfigFunctions(createMockConfigFunctions());

    registerSudoCommand(registry);
  });

  it('should be registered with correct id and description', () => {
    const command = registry.get('/sudo');

    expect(command).toBeDefined();
    expect(command?.id).toBe('/sudo');
    expect(command?.description).toBe('Toggle sudo mode (bypass tool approval requirement).');
    expect(command?.category).toBe('debug');
  });

  it('should emit command:sudo:toggle event when executed', async () => {
    await registry.execute('/sudo');

    expect(mockEventBus.emit).toHaveBeenCalledWith('command:sudo:toggle', undefined);
  });

  it('should handle execution errors gracefully', async () => {
    (mockEventBus.emit as Mock).mockImplementationOnce(() => {
      throw new Error('Event bus error');
    });

    const result = await registry.execute('/sudo');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
