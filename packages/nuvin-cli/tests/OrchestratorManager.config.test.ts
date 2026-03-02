import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MessageLine } from '../source/adapters/index.js';
import type { CLIConfig } from '../source/config/types.js';

const createMockHandlers = () => {
  const messages: MessageLine[] = [];
  const errors: string[] = [];
  const updates: Record<string, string> = {};

  return {
    appendLine: (line: MessageLine) => messages.push(line),
    updateLine: (id: string, content: string) => {
      updates[id] = content;
    },
    setLastMetadata: () => {},
    updateLineMetadata: () => {},
    handleError: (message: string) => errors.push(message),
    messages,
    errors,
    updates,
  };
};

// Use vi.hoisted to create mock before module is loaded
const { mockConfigManager } = vi.hoisted(() => {
  let currentConfig: CLIConfig = {};

  const instance = {
    getConfig: vi.fn(() => JSON.parse(JSON.stringify(currentConfig))),
    get: vi.fn((key: string) => {
      const keys = key.split('.');
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic config access requires any type
      let current: any = currentConfig;
      for (const k of keys) {
        if (current && typeof current === 'object' && k in current) {
          current = current[k];
        } else {
          return undefined;
        }
      }
      return current;
    }),
    set: vi.fn(),
    getProfileManager: vi.fn(() => undefined),
    getCurrentProfile: vi.fn(() => 'default'),
    setMockConfig: (config: CLIConfig) => {
      currentConfig = {
        memory: { enabled: false },
        ...config,
      };
    },
  };

  return { mockConfigManager: instance };
});

vi.mock('../source/config/manager.js', () => ({
  ConfigManager: {
    getInstance: vi.fn(() => mockConfigManager),
  },
}));

// Import after mocking
import { OrchestratorManager } from '../source/services/OrchestratorManager.js';

describe('OrchestratorManager - ConfigManager Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config to empty
    mockConfigManager.setMockConfig({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads config from ConfigManager during init', async () => {
    mockConfigManager.setMockConfig({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4o',
      providers: {
        openrouter: {
          auth: [
            {
              type: 'api-key',
              'api-key': 'test-api-key-123',
            },
          ],
          'current-auth': 'api-key',
        },
      },
    });

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(manager.getOrchestrator()).toBeTruthy();
    expect(result.model).toBe('openai/gpt-4o');
    expect(manager.getStatus()).toBe('Ready');

    await manager.cleanup();
  });

  it('reads OAuth config from ConfigManager during init', async () => {
    mockConfigManager.setMockConfig({
      activeProvider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      providers: {
        anthropic: {
          auth: [
            {
              type: 'oauth',
              access: 'access-token-123',
              refresh: 'refresh-token-456',
              expires: Date.now() + 3600000,
            },
          ],
          'current-auth': 'oauth',
        },
      },
    });

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(manager.getOrchestrator()).toBeTruthy();
    expect(result.model).toBe('claude-sonnet-4-5-20250929');
    expect(manager.getStatus()).toBe('Ready');

    await manager.cleanup();
  });

  it('uses default model if not in config', async () => {
    mockConfigManager.setMockConfig({
      activeProvider: 'github',
    });

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(result.model).toBe('gpt-4.1');

    await manager.cleanup();
  });

  it('reads requireToolApproval from config', async () => {
    mockConfigManager.setMockConfig({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      requireToolApproval: true,
    });

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    await manager.init({}, handlers);

    const orchestrator = manager.getOrchestrator();
    const config = orchestrator?.getConfig();

    expect(config.requireToolApproval).toBe(true);

    await manager.cleanup();
  });

  it('handles thinking: OFF correctly', async () => {
    mockConfigManager.setMockConfig({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      thinking: 'OFF',
    });

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    await manager.init({}, handlers);

    const orchestrator = manager.getOrchestrator();
    const config = orchestrator?.getConfig();

    expect(config.reasoningEffort).toBeUndefined();

    await manager.cleanup();
  });

  it('reads streamingChunks from config', async () => {
    mockConfigManager.setMockConfig({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      streamingChunks: false,
    });

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    await manager.init({}, handlers);

    await manager.cleanup();
  });

  it('handles missing provider gracefully', async () => {
    mockConfigManager.setMockConfig({});

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(manager.getOrchestrator()).toBeTruthy();
    expect(result.model).toBe('openai/gpt-4.1');

    await manager.cleanup();
  });

  it('supports mocking ConfigManager with vi.mock', async () => {
    mockConfigManager.setMockConfig({
      activeProvider: 'zai',
      model: 'glm-4.6',
      providers: {
        zai: {
          auth: [
            {
              type: 'api-key',
              'api-key': 'custom-test-key',
            },
          ],
          'current-auth': 'api-key',
        },
      },
    });

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(manager.getOrchestrator()).toBeTruthy();
    expect(result.model).toBe('glm-4.6');

    await manager.cleanup();
  });

  it('reads mcpAllowedTools from config', async () => {
    mockConfigManager.setMockConfig({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      mcpAllowedTools: {
        'test-server': {
          tool1: true,
          tool2: false,
        },
      },
    });

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    await manager.init({}, handlers);

    const mcpManager = manager.getMcpManager();
    expect(mcpManager).toBeTruthy();

    await manager.cleanup();
  });

  it('disables memory_save tool when memory.saveTool is false', async () => {
    mockConfigManager.setMockConfig({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      memory: {
        enabled: true,
        saveTool: false,
      },
    });

    const manager = new OrchestratorManager();
    const handlers = createMockHandlers();

    await manager.init({}, handlers);

    const orchestrator = manager.getOrchestrator();
    const config = orchestrator?.getConfig();
    expect(config?.enabledTools?.includes('memory_save')).toBe(false);

    await manager.cleanup();
  });
});
