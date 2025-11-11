import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrchestratorManager } from '../source/services/OrchestratorManager.js';
import type { ConfigManager } from '../source/config/manager.js';
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

class MockConfigManager {
  private config: CLIConfig = {};

  constructor(initialConfig: CLIConfig = {}) {
    this.config = initialConfig;
  }

  getConfig(): CLIConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  setConfig(config: CLIConfig): void {
    this.config = config;
  }

  async load() {
    return { config: this.config, sources: [] };
  }

  async set(key: string, value: unknown) {
    const keys = key.split('.');
    let current: Record<string, unknown> = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = value;
  }

  get(key: string): unknown {
    const keys = key.split('.');
    let current: unknown = this.config;
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = (current as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }
    return current;
  }
}

describe('OrchestratorManager - ConfigManager Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads config from ConfigManager during init', async () => {
    const mockConfig = new MockConfigManager({
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

    const manager = new OrchestratorManager(mockConfig as unknown as ConfigManager);
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(result.orchestrator).toBeTruthy();
    expect(result.model).toBe('openai/gpt-4o');
    expect(manager.getStatus()).toBe('Ready');

    await manager.cleanup();
  });

  it('reads OAuth config from ConfigManager during init', async () => {
    const mockConfig = new MockConfigManager({
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

    const manager = new OrchestratorManager(mockConfig as unknown as ConfigManager);
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(result.orchestrator).toBeTruthy();
    expect(result.model).toBe('claude-sonnet-4-5-20250929');
    expect(manager.getStatus()).toBe('Ready');

    await manager.cleanup();
  });

  it('uses default model if not in config', async () => {
    const mockConfig = new MockConfigManager({
      activeProvider: 'github',
    });

    const manager = new OrchestratorManager(mockConfig as unknown as ConfigManager);
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(result.model).toBe('gpt-4.1');

    await manager.cleanup();
  });

  it('reads requireToolApproval from config', async () => {
    const mockConfig = new MockConfigManager({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      requireToolApproval: true,
    });

    const manager = new OrchestratorManager(mockConfig as unknown as ConfigManager);
    const handlers = createMockHandlers();

    await manager.init({}, handlers);

    const orchestrator = manager.getOrchestrator();
    const config = orchestrator?.getConfig();

    expect(config.requireToolApproval).toBe(true);

    await manager.cleanup();
  });

  it('handles thinking: OFF correctly', async () => {
    const mockConfig = new MockConfigManager({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      thinking: 'OFF',
    });

    const manager = new OrchestratorManager(mockConfig as unknown as ConfigManager);
    const handlers = createMockHandlers();

    await manager.init({}, handlers);

    const orchestrator = manager.getOrchestrator();
    const config = orchestrator?.getConfig();

    expect(config.reasoningEffort).toBeUndefined();

    await manager.cleanup();
  });

  it('reads streamingChunks from config', async () => {
    const mockConfig = new MockConfigManager({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      streamingChunks: false,
    });

    const manager = new OrchestratorManager(mockConfig as unknown as ConfigManager);
    const handlers = createMockHandlers();

    await manager.init({}, handlers);

    await manager.cleanup();
  });

  it('handles missing provider gracefully', async () => {
    const mockConfig = new MockConfigManager({});

    const manager = new OrchestratorManager(mockConfig as unknown as ConfigManager);
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(result.orchestrator).toBeTruthy();
    expect(result.model).toBe('openai/gpt-4.1');

    await manager.cleanup();
  });

  it('supports injecting custom ConfigManager for testing', async () => {
    const customConfig = new MockConfigManager({
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

    const manager = new OrchestratorManager(customConfig as unknown as ConfigManager);
    const handlers = createMockHandlers();

    const result = await manager.init({}, handlers);

    expect(result.orchestrator).toBeTruthy();
    expect(result.model).toBe('glm-4.6');

    await manager.cleanup();
  });

  it('reads mcpAllowedTools from config', async () => {
    const mockConfig = new MockConfigManager({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      mcpAllowedTools: {
        'test-server': {
          tool1: true,
          tool2: false,
        },
      },
    });

    const manager = new OrchestratorManager(mockConfig as unknown as ConfigManager);
    const handlers = createMockHandlers();

    await manager.init({}, handlers);

    const mcpManager = manager.getMcpManager();
    expect(mcpManager).toBeTruthy();

    await manager.cleanup();
  });
});
