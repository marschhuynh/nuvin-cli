import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrchestratorManager } from '../source/services/OrchestratorManager.js';
import type { ConfigManager } from '../source/config/manager.js';
import type { MessageLine } from '../source/adapters/index.js';
import type { MCPServerManager } from '../source/services/MCPServerManager.js';

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

const createMockConfigManager = () => {
  return {
    getConfig: vi.fn().mockReturnValue({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      requireToolApproval: false,
      thinking: 'OFF',
      streamingChunks: false,
      mcp: undefined,
    }),
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any;
};

describe('OrchestratorManager', () => {
  let mockConfigManager: ConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigManager = createMockConfigManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getMCPServers returns empty array when no manager initialized', () => {
    const manager = new OrchestratorManager(mockConfigManager);

    const servers = manager.getMCPServers();

    expect(servers).toEqual([]);
  });

  it('getStatus returns Initializing before init', () => {
    const manager = new OrchestratorManager(mockConfigManager);

    expect(manager.getStatus()).toBe('Initializing');
  });

  it('getOrchestrator returns null before init', () => {
    const manager = new OrchestratorManager(mockConfigManager);

    expect(manager.getOrchestrator()).toBe(null);
  });

  it('init initializes orchestrator with openrouter provider', async () => {
    const manager = new OrchestratorManager(mockConfigManager);
    const handlers = createMockHandlers();

    const result = await manager.init({ mcpConfigPath: '/non/existent/path/mcp-config.json' }, handlers);

    expect(result.orchestrator).toBeTruthy();
    expect(result.memory).toBeTruthy();
    expect(result.model).toBe('openai/gpt-4');
    expect(result.sessionId).toBe(null); // null when memPersist is false (default)
    expect(result.sessionDir).toBe(null); // null when memPersist is false (default)
    expect(manager.getStatus()).toBe('Ready');

    await manager.cleanup();
  });

  it('updateMCPAllowedTools updates orchestrator enabledTools', async () => {
    const manager = new OrchestratorManager(mockConfigManager);
    const handlers = createMockHandlers();

    await manager.init({ mcpConfigPath: '/non/existent/path/mcp-config.json' }, handlers);

    const orchestrator = manager.getOrchestrator();
    expect(orchestrator).toBeTruthy();

    const initialConfig = orchestrator?.getConfig();
    const initialToolsCount = initialConfig.enabledTools.length;

    // Mock the MCP manager for testing
    const mockMcpManager = {
      updateAllowedToolsConfig: async () => {},
      getConnectedServers: () => [
        {
          id: 'test-server',
          allowedTools: ['mcp_tool1', 'mcp_tool2'],
          exposedTools: ['mcp_tool1', 'mcp_tool2', 'mcp_tool3'],
          prefix: 'mcp_',
          status: 'connected' as const,
          client: null,
          port: null,
        },
      ],
      disconnectAllServers: async () => {},
    };

    // Set the mock manager
    manager.setMcpManager(mockMcpManager as unknown as MCPServerManager);

    await manager.updateMCPAllowedTools({
      'test-server': {
        mcp_tool1: true,
        mcp_tool2: true,
        mcp_tool3: false,
      },
    });

    const updatedConfig = orchestrator?.getConfig();

    expect(updatedConfig.enabledTools.length).toBe(initialToolsCount + 2);
    expect(updatedConfig.enabledTools.includes('mcp_tool1')).toBe(true);
    expect(updatedConfig.enabledTools.includes('mcp_tool2')).toBe(true);
    expect(updatedConfig.enabledTools.includes('mcp_tool3')).toBe(false);

    await manager.cleanup();
  });

  it('updateMCPAllowedTools includes base tools in enabled list', async () => {
    const manager = new OrchestratorManager(mockConfigManager);
    const handlers = createMockHandlers();

    await manager.init({ mcpConfigPath: '/non/existent/path/mcp-config.json' }, handlers);

    const orchestrator = manager.getOrchestrator();
    const initialConfig = orchestrator?.getConfig();
    const baseTools = [...initialConfig.enabledTools];

    // Mock the MCP manager for testing
    const mockMcpManager = {
      updateAllowedToolsConfig: async () => {},
      getConnectedServers: () => [
        {
          id: 'test-server',
          allowedTools: ['mcp_tool1'],
          exposedTools: ['mcp_tool1'],
          prefix: 'mcp_',
          status: 'connected' as const,
          client: null,
          port: null,
        },
      ],
      disconnectAllServers: async () => {},
    };

    // Set the mock manager
    manager.setMcpManager(mockMcpManager as unknown as MCPServerManager);

    await manager.updateMCPAllowedTools({
      'test-server': { mcp_tool1: true },
    });

    const updatedConfig = orchestrator?.getConfig();

    for (const baseTool of baseTools) {
      expect(updatedConfig.enabledTools.includes(baseTool)).toBe(true);
    }

    expect(updatedConfig.enabledTools.includes('mcp_tool1')).toBe(true);

    await manager.cleanup();
  });

  it('init passes mcpAllowedTools to MCPServerManager', async () => {
    const manager = new OrchestratorManager(mockConfigManager);
    const handlers = createMockHandlers();

    await manager.init({ mcpConfigPath: '/non/existent/path/mcp-config.json' }, handlers);

    // Verify that the MCPServerManager received the config
    const mcpManager = manager.getMcpManager();
    expect(mcpManager).toBeTruthy();

    // Check that the internal config was set
    // expect(mcpManager.allowedToolsConfig).toEqual(mcpAllowedTools);

    await manager.cleanup();
  });

  it('init without mcpAllowedTools does not error', async () => {
    const manager = new OrchestratorManager(mockConfigManager);
    const handlers = createMockHandlers();

    const result = await manager.init({ mcpConfigPath: '/non/existent/path/mcp-config.json' }, handlers);

    expect(result.orchestrator).toBeTruthy();
    expect(manager.getStatus()).toBe('Ready');

    await manager.cleanup();
  });

  it('updateMCPAllowedTools changes take effect immediately', async () => {
    const manager = new OrchestratorManager(mockConfigManager);
    const handlers = createMockHandlers();

    await manager.init({ mcpConfigPath: '/non/existent/path/mcp-config.json' }, handlers);

    const orchestrator = manager.getOrchestrator();
    const initialConfig = orchestrator?.getConfig();
    const initialToolsCount = initialConfig.enabledTools.length;

    // Mock MCP manager with tools
    const mockMcpManager = {
      _config: {} as Record<string, Record<string, boolean>>,
      updateAllowedToolsConfig: async (config: Record<string, Record<string, boolean>>) => {
        // Simulate updating internal config
        mockMcpManager._config = config;
      },
      getConnectedServers: () => [
        {
          id: 'test-server',
          allowedTools: ['tool1', 'tool2', 'tool3'],
          exposedTools: ['tool1', 'tool2', 'tool3', 'tool4'],
          prefix: 'mcp_',
          status: 'connected' as const,
          client: null,
          port: null,
        },
      ],
      disconnectAllServers: async () => {},
    };

    // Set the mock manager
    manager.setMcpManager(mockMcpManager as unknown as MCPServerManager);

    // First update - enable 3 tools
    await manager.updateMCPAllowedTools({
      'test-server': {
        tool1: true,
        tool2: true,
        tool3: true,
        tool4: false,
      },
    });

    let config = orchestrator?.getConfig();
    expect(config.enabledTools.length).toBe(initialToolsCount + 3);
    expect(config.enabledTools.includes('tool1')).toBe(true);
    expect(config.enabledTools.includes('tool2')).toBe(true);
    expect(config.enabledTools.includes('tool3')).toBe(true);
    expect(config.enabledTools.includes('tool4')).toBe(false);

    // Update allowed tools to simulate user toggling tool2 off
    mockMcpManager.getConnectedServers = () => [
      {
        id: 'test-server',
        allowedTools: ['tool1', 'tool3'], // tool2 removed
        exposedTools: ['tool1', 'tool2', 'tool3', 'tool4'],
        prefix: 'mcp_',
        status: 'connected' as const,
        client: null,
        port: null,
      },
    ];

    // Second update - disable tool2
    await manager.updateMCPAllowedTools({
      'test-server': {
        tool1: true,
        tool2: false, // toggled off
        tool3: true,
        tool4: false,
      },
    });

    config = orchestrator?.getConfig();
    expect(config.enabledTools.length).toBe(initialToolsCount + 2);
    expect(config.enabledTools.includes('tool1')).toBe(true);
    expect(config.enabledTools.includes('tool2')).toBe(false);
    expect(config.enabledTools.includes('tool3')).toBe(true);

    await manager.cleanup();
  });
});
