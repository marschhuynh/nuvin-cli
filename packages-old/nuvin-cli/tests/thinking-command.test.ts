import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandRegistry } from '../source/modules/commands/registry.js';
import { registerThinkingCommand } from '../source/modules/commands/definitions/thinking.js';
import { ConfigManager } from '../source/config/manager.js';
import type { TypedEventBus } from '../source/services/EventBus.js';

vi.mock('node:fs', () => {
  const mockFs: Record<string, string> = {};

  const promises = {
    mkdir: vi.fn(async () => {}),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      mockFs[filePath] = content;
    }),
    readFile: vi.fn(async (filePath: string) => {
      if (!(filePath in mockFs)) {
        const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return mockFs[filePath];
    }),
    rename: vi.fn(async (oldPath: string, newPath: string) => {
      if (!(oldPath in mockFs)) {
        const error = new Error(`ENOENT: no such file or directory, rename '${oldPath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      const oldContent = mockFs[oldPath];
      if (oldContent !== undefined) {
        mockFs[newPath] = oldContent;
      }
      delete mockFs[oldPath];
    }),
    unlink: vi.fn(async (filePath: string) => {
      delete mockFs[filePath];
    }),
  };

  return {
    default: {
      existsSync: vi.fn((filePath: string) => filePath in mockFs),
      readFileSync: vi.fn((filePath: string) => {
        if (!(filePath in mockFs)) {
          const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        }
        return mockFs[filePath];
      }),
      writeFileSync: vi.fn((filePath: string, content: string) => {
        mockFs[filePath] = content;
      }),
      mkdirSync: vi.fn(() => {}),
      rmSync: vi.fn(() => {}),
      readdirSync: vi.fn(() => []),
      promises,
    },
    existsSync: vi.fn((filePath: string) => filePath in mockFs),
    readFileSync: vi.fn((filePath: string) => {
      if (!(filePath in mockFs)) {
        const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return mockFs[filePath];
    }),
    writeFileSync: vi.fn((filePath: string, content: string) => {
      mockFs[filePath] = content;
    }),
    mkdirSync: vi.fn(() => {}),
    rmSync: vi.fn(() => {}),
    readdirSync: vi.fn(() => []),
    promises,
    __mockFs: mockFs,
  };
});

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/mock-home',
    tmpdir: () => '/mock-tmp',
  },
  homedir: () => '/mock-home',
  tmpdir: () => '/mock-tmp',
}));

type EventHandler = (...args: unknown[]) => void;

const createMockEventBus = (): TypedEventBus & { getCapturedEvents: () => Array<{ event: string; data: unknown }> } => {
  const listeners = new Map<string, Set<EventHandler>>();
  const capturedEvents: Array<{ event: string; data: unknown }> = [];

  return {
    on: vi.fn((event: string, handler: EventHandler) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)?.add(handler);
    }),
    off: vi.fn((event: string, handler: EventHandler) => {
      listeners.get(event)?.delete(handler);
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      capturedEvents.push({ event, data: args[0] });
      const handlers = listeners.get(event);
      if (handlers) {
        for (const handler of handlers) {
          handler(...args);
        }
      }
    }),
    getCapturedEvents: () => capturedEvents,
  } as TypedEventBus & { getCapturedEvents: () => Array<{ event: string; data: unknown }> };
};

describe('/thinking command', () => {
  let registry: CommandRegistry;
  let mockEventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    registry = new CommandRegistry();
    mockEventBus = createMockEventBus();

    // Replace global event bus for the test
    (registry as unknown as { createContext: (input: string) => unknown }).createContext = function (input: string) {
      const config = ConfigManager.getInstance();
      return {
        rawInput: input,
        eventBus: mockEventBus,
        registry: this,
        config: {
          get: (key: string) => config.get(key),
          set: async (key: string, value: unknown) => config.set(key, value, 'global'),
          delete: async (key: string) => config.delete(key),
        },
        memory: null,
        orchestrator: null,
      };
    };

    registerThinkingCommand(registry);
  });

  afterEach(() => {
    ConfigManager.resetInstance();
  });

  it('should register /thinking command', () => {
    const command = registry.get('/thinking');
    expect(command).toBeDefined();
    expect(command?.type).toBe('component');
  });

  it('should show interactive mode when no arguments provided', async () => {
    const result = await registry.execute('/thinking');
    expect(result.success).toBe(true);

    // Should activate component (not run handler)
    const activeCommand = registry.getActive();
    expect(activeCommand).not.toBeNull();
    expect(activeCommand?.command.id).toBe('/thinking');
  });

  it('should handle "off" argument directly', async () => {
    const result = await registry.execute('/thinking off');
    expect(result.success).toBe(true);

    // Should not activate component
    const activeCommand = registry.getActive();
    expect(activeCommand).toBeNull();

    // Should emit success message
    const capturedEvents = mockEventBus.getCapturedEvents();
    const uiLineEvents = capturedEvents.filter((e) => e.event === 'ui:line');
    expect(uiLineEvents.length).toBeGreaterThan(0);
    expect(uiLineEvents[0].data.content).toContain('OFF');
  });

  it('should handle "low" argument directly', async () => {
    const result = await registry.execute('/thinking low');
    expect(result.success).toBe(true);

    const activeCommand = registry.getActive();
    expect(activeCommand).toBeNull();

    const capturedEvents = mockEventBus.getCapturedEvents();
    const uiLineEvents = capturedEvents.filter((e) => e.event === 'ui:line');
    expect(uiLineEvents.length).toBeGreaterThan(0);
    expect(uiLineEvents[0].data.content).toContain('LOW');
  });

  it('should handle "medium" argument directly', async () => {
    const result = await registry.execute('/thinking medium');
    expect(result.success).toBe(true);

    const activeCommand = registry.getActive();
    expect(activeCommand).toBeNull();

    const capturedEvents = mockEventBus.getCapturedEvents();
    const uiLineEvents = capturedEvents.filter((e) => e.event === 'ui:line');
    expect(uiLineEvents.length).toBeGreaterThan(0);
    expect(uiLineEvents[0].data.content).toContain('MEDIUM');
  });

  it('should handle "high" argument directly', async () => {
    const result = await registry.execute('/thinking high');
    expect(result.success).toBe(true);

    const activeCommand = registry.getActive();
    expect(activeCommand).toBeNull();

    const capturedEvents = mockEventBus.getCapturedEvents();
    const uiLineEvents = capturedEvents.filter((e) => e.event === 'ui:line');
    expect(uiLineEvents.length).toBeGreaterThan(0);
    expect(uiLineEvents[0].data.content).toContain('HIGH');
  });

  it('should handle case-insensitive arguments', async () => {
    const result = await registry.execute('/thinking OFF');
    expect(result.success).toBe(true);

    const activeCommand = registry.getActive();
    expect(activeCommand).toBeNull();

    const capturedEvents = mockEventBus.getCapturedEvents();
    const uiLineEvents = capturedEvents.filter((e) => e.event === 'ui:line');
    expect(uiLineEvents[0].data.content).toContain('OFF');
  });

  it('should show error for invalid argument', async () => {
    const result = await registry.execute('/thinking invalid');
    expect(result.success).toBe(true);

    const activeCommand = registry.getActive();
    expect(activeCommand).toBeNull();

    const capturedEvents = mockEventBus.getCapturedEvents();
    const errorEvents = capturedEvents.filter((e) => e.event === 'ui:line' && e.data.type === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0].data.content).toContain('Invalid thinking level');
  });
});
