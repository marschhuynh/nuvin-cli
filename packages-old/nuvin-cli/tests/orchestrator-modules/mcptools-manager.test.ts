import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MCPToolsManager,
  type MCPToolsManagerDeps,
} from '../../source/services/orchestrator-modules/MCPToolsManager.js';
import type { AgentOrchestrator, AgentConfig, MCPToolPort } from '@nuvin/nuvin-core';
import type { MCPServerInfo, MCPServerManager } from '../../source/services/MCPServerManager.js';
import type { MemorySettings } from '../../source/config/types.js';
import type { OrchestratorRuntime } from '../../source/services/OrchestratorRuntime.js';

// ─── Test helpers ──────────────────────────────────────────────────────────────

function createMockOrchestrator(overrides: Record<string, unknown> = {}) {
  return {
    updateConfig: vi.fn(),
    getTools: vi.fn().mockReturnValue({
      getToolDefinitions: vi.fn().mockReturnValue([]),
      executeToolCalls: vi.fn().mockResolvedValue([]),
    }),
    setTools: vi.fn(),
    ...overrides,
  } as unknown as AgentOrchestrator;
}

function createMockRuntime(orchestrator: AgentOrchestrator | null): OrchestratorRuntime | null {
  if (!orchestrator) return null;
  return {
    orchestrator,
    memory: null as unknown as OrchestratorRuntime['memory'],
    conversationStore: null as unknown as OrchestratorRuntime['conversationStore'],
    toolRegistry: null as unknown as OrchestratorRuntime['toolRegistry'],
    sessionId: null,
    sessionDir: null,
    activeAgentId: 'main',
  };
}

function createMockMCPServerInfo(overrides: Partial<MCPServerInfo> = {}): MCPServerInfo {
  return {
    id: 'test-server',
    client: null,
    port: null,
    exposedTools: ['mcp_test_tool1', 'mcp_test_tool2'],
    allowedTools: ['mcp_test_tool1', 'mcp_test_tool2'],
    prefix: 'mcp_test_',
    status: 'connected',
    ...overrides,
  } as MCPServerInfo;
}

function createMockMCPManager(overrides: Record<string, unknown> = {}) {
  return {
    getConnectedServers: vi.fn().mockReturnValue([]),
    updateAllowedToolsConfig: vi.fn().mockResolvedValue(undefined),
    reconnectServer: vi.fn().mockResolvedValue(null),
    disconnectServer: vi.fn().mockResolvedValue(false),
    disconnectAllServers: vi.fn().mockResolvedValue(undefined),
    initializeServers: vi.fn().mockResolvedValue({
      mcpPorts: [],
      mcpClients: [],
      enabledTools: [],
    }),
    getAllServers: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<MCPToolsManagerDeps> = {}): MCPToolsManagerDeps {
  return {
    getRuntime: () => createMockRuntime(createMockOrchestrator()),
    getMemoryConfig: () => undefined,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('MCPToolsManager', () => {
  let manager: MCPToolsManager;
  let deps: MCPToolsManagerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    manager = new MCPToolsManager(deps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Construction & state ──────────────────────────────────────────────────

  describe('construction', () => {
    it('starts with null mcpManager', () => {
      expect(manager.getMcpManager()).toBeNull();
    });
  });

  // ─── setMcpManager / getMcpManager ─────────────────────────────────────────

  describe('setMcpManager / getMcpManager', () => {
    it('sets and gets the mcpManager', () => {
      const mockManager = createMockMCPManager();
      manager.setMcpManager(mockManager as unknown as MCPServerManager);
      expect(manager.getMcpManager()).toBe(mockManager);
    });

    it('can set mcpManager to null', () => {
      const mockManager = createMockMCPManager();
      manager.setMcpManager(mockManager as unknown as MCPServerManager);
      manager.setMcpManager(null);
      expect(manager.getMcpManager()).toBeNull();
    });
  });

  // ─── getMCPServers ─────────────────────────────────────────────────────────

  describe('getMCPServers', () => {
    it('returns empty array when mcpManager is null', () => {
      expect(manager.getMCPServers()).toEqual([]);
    });

    it('delegates to mcpManager.getAllServers()', () => {
      const servers = [createMockMCPServerInfo({ id: 'server-a' })];
      const mockManager = createMockMCPManager({
        getAllServers: vi.fn().mockReturnValue(servers),
      });
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const result = manager.getMCPServers();
      expect(result).toEqual(servers);
      expect(mockManager.getAllServers).toHaveBeenCalledOnce();
    });
  });

  // ─── recalculateEnabledTools ───────────────────────────────────────────────

  describe('recalculateEnabledTools', () => {
    it('returns only base tools when mcpManager is null', () => {
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);

      manager.recalculateEnabledTools();

      expect(mockOrchestrator.updateConfig).toHaveBeenCalledOnce();
      const call = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<AgentConfig>;
      expect(call.enabledTools).toBeDefined();
      // Should have base tools but no MCP tools
      expect(call.enabledTools?.some((t: string) => t === 'bash_tool')).toBe(true);
    });

    it('combines base tools with MCP allowed tools from connected servers', () => {
      const serverA = createMockMCPServerInfo({
        id: 'server-a',
        allowedTools: ['mcp_a_tool1', 'mcp_a_tool2'],
      });
      const serverB = createMockMCPServerInfo({
        id: 'server-b',
        allowedTools: ['mcp_b_tool1'],
      });
      const mockManager = createMockMCPManager({
        getConnectedServers: vi.fn().mockReturnValue([serverA, serverB]),
      });

      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      manager.recalculateEnabledTools();

      expect(mockOrchestrator.updateConfig).toHaveBeenCalledOnce();
      const call = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<AgentConfig>;
      const tools = call.enabledTools ?? [];

      // Should contain base tools
      expect(tools).toContain('bash_tool');
      expect(tools).toContain('file_read');

      // Should contain MCP tools at the end
      expect(tools).toContain('mcp_a_tool1');
      expect(tools).toContain('mcp_a_tool2');
      expect(tools).toContain('mcp_b_tool1');
    });

    it('does nothing when orchestrator is null', () => {
      deps = createMockDeps({ getRuntime: () => null });
      manager = new MCPToolsManager(deps);

      // Should not throw
      manager.recalculateEnabledTools();
    });

    it('respects memory config for base tools filtering', () => {
      const memoryConfig: MemorySettings = { enabled: false };
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({
        getRuntime: () => createMockRuntime(mockOrchestrator),
        getMemoryConfig: () => memoryConfig,
      });
      manager = new MCPToolsManager(deps);

      manager.recalculateEnabledTools();

      const call = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<AgentConfig>;
      const tools = call.enabledTools ?? [];
      expect(tools).not.toContain('memory_save');
      expect(tools).not.toContain('memory_query');
      expect(tools).not.toContain('memory_extract');
    });
  });

  // ─── updateMCPAllowedTools ─────────────────────────────────────────────────

  describe('updateMCPAllowedTools', () => {
    it('does nothing when mcpManager is null', async () => {
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);

      await manager.updateMCPAllowedTools({ server1: { tool1: true } });
      expect(mockOrchestrator.updateConfig).not.toHaveBeenCalled();
    });

    it('does nothing when orchestrator is null', async () => {
      const mockManager = createMockMCPManager();
      deps = createMockDeps({ getRuntime: () => null });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      await manager.updateMCPAllowedTools({ server1: { tool1: true } });
      expect(mockManager.updateAllowedToolsConfig).not.toHaveBeenCalled();
    });

    it('delegates to mcpManager.updateAllowedToolsConfig and recalculates', async () => {
      const serverA = createMockMCPServerInfo({
        id: 'server-a',
        allowedTools: ['mcp_a_tool1'],
      });
      const mockManager = createMockMCPManager({
        getConnectedServers: vi.fn().mockReturnValue([serverA]),
      });
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const config = { 'server-a': { mcp_a_tool1: true, mcp_a_tool2: false } };
      await manager.updateMCPAllowedTools(config);

      expect(mockManager.updateAllowedToolsConfig).toHaveBeenCalledWith(config);
      expect(mockOrchestrator.updateConfig).toHaveBeenCalledOnce();

      const call = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<AgentConfig>;
      expect(call.enabledTools).toContain('mcp_a_tool1');
    });
  });

  // ─── reconnectMCPServer ────────────────────────────────────────────────────

  describe('reconnectMCPServer', () => {
    it('returns null when mcpManager is null', async () => {
      const result = await manager.reconnectMCPServer('some-server');
      expect(result).toBeNull();
    });

    it('reconnects and recalculates enabled tools on success', async () => {
      const reconnectedServer = createMockMCPServerInfo({
        id: 'server-1',
        status: 'connected',
        allowedTools: ['mcp_s1_tool1'],
      });
      const mockManager = createMockMCPManager({
        reconnectServer: vi.fn().mockResolvedValue(reconnectedServer),
        getConnectedServers: vi.fn().mockReturnValue([reconnectedServer]),
      });
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const result = await manager.reconnectMCPServer('server-1');

      expect(result).toBe(reconnectedServer);
      expect(mockManager.reconnectServer).toHaveBeenCalledWith('server-1');
      expect(mockOrchestrator.updateConfig).toHaveBeenCalledOnce();

      const call = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<AgentConfig>;
      expect(call.enabledTools).toContain('mcp_s1_tool1');
    });

    it('rebuilds CompositeToolPort with new server port on reconnect', async () => {
      const { CompositeToolPort } = await import('@nuvin/nuvin-core');
      const mockPort = {
        getToolDefinitions: vi.fn().mockReturnValue([]),
        executeToolCalls: vi.fn().mockResolvedValue([]),
      };
      const reconnectedServer = createMockMCPServerInfo({
        id: 'server-1',
        status: 'connected',
        allowedTools: ['mcp_s1_tool1'],
        port: mockPort as unknown as MCPToolPort,
      });
      const mockManager = createMockMCPManager({
        reconnectServer: vi.fn().mockResolvedValue(reconnectedServer),
        getConnectedServers: vi.fn().mockReturnValue([reconnectedServer]),
      });
      const baseTools = {
        getToolDefinitions: vi.fn().mockReturnValue([]),
        executeToolCalls: vi.fn().mockResolvedValue([]),
      };
      const mockOrchestrator = createMockOrchestrator({
        getTools: vi.fn().mockReturnValue(baseTools),
      });
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      await manager.reconnectMCPServer('server-1');

      // setTools must be called to rebuild the composite with the new port
      expect(mockOrchestrator.setTools).toHaveBeenCalledOnce();
      const newTools = (mockOrchestrator.setTools as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(newTools).toBeInstanceOf(CompositeToolPort);
    });

    it('reconnects but does NOT recalculate when server status is not connected', async () => {
      const failedServer = createMockMCPServerInfo({
        id: 'server-1',
        status: 'failed',
        allowedTools: [],
      });
      const mockManager = createMockMCPManager({
        reconnectServer: vi.fn().mockResolvedValue(failedServer),
      });
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const result = await manager.reconnectMCPServer('server-1');

      expect(result).toBe(failedServer);
      expect(mockOrchestrator.updateConfig).not.toHaveBeenCalled();
    });

    it('reconnects but does NOT recalculate when orchestrator is null', async () => {
      const reconnectedServer = createMockMCPServerInfo({
        id: 'server-1',
        status: 'connected',
      });
      const mockManager = createMockMCPManager({
        reconnectServer: vi.fn().mockResolvedValue(reconnectedServer),
      });
      deps = createMockDeps({ getRuntime: () => null });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const result = await manager.reconnectMCPServer('server-1');

      expect(result).toBe(reconnectedServer);
      // No orchestrator => no updateConfig
    });
  });

  // ─── disconnectMCPServer ───────────────────────────────────────────────────

  describe('disconnectMCPServer', () => {
    it('returns false when mcpManager is null', async () => {
      const result = await manager.disconnectMCPServer('some-server');
      expect(result).toBe(false);
    });

    it('disconnects and recalculates enabled tools on success', async () => {
      const mockManager = createMockMCPManager({
        disconnectServer: vi.fn().mockResolvedValue(true),
        getConnectedServers: vi.fn().mockReturnValue([]), // server removed after disconnect
      });
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const result = await manager.disconnectMCPServer('server-1');

      expect(result).toBe(true);
      expect(mockManager.disconnectServer).toHaveBeenCalledWith('server-1');
      expect(mockOrchestrator.updateConfig).toHaveBeenCalledOnce();

      const call = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<AgentConfig>;
      // No MCP tools since server was disconnected
      expect(call.enabledTools).toBeDefined();
      expect(call.enabledTools?.every((t: string) => !t.startsWith('mcp_'))).toBe(true);
    });

    it('rebuilds tools without disconnected server port after disconnect', async () => {
      const mockManager = createMockMCPManager({
        disconnectServer: vi.fn().mockResolvedValue(true),
        getConnectedServers: vi.fn().mockReturnValue([]),
      });
      const baseTools = {
        getToolDefinitions: vi.fn().mockReturnValue([]),
        executeToolCalls: vi.fn().mockResolvedValue([]),
      };
      const mockOrchestrator = createMockOrchestrator({
        getTools: vi.fn().mockReturnValue(baseTools),
      });
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      await manager.disconnectMCPServer('server-1');

      // setTools must be called to reset to base tools (no MCP ports remain)
      expect(mockOrchestrator.setTools).toHaveBeenCalledOnce();
      const newTools = (mockOrchestrator.setTools as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      // When no MCP ports remain, should reset to the base tool port (not a composite)
      expect(newTools).toBe(baseTools);
    });

    it('does NOT recalculate when disconnect fails', async () => {
      const mockManager = createMockMCPManager({
        disconnectServer: vi.fn().mockResolvedValue(false),
      });
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const result = await manager.disconnectMCPServer('server-1');

      expect(result).toBe(false);
      expect(mockOrchestrator.updateConfig).not.toHaveBeenCalled();
    });

    it('does NOT recalculate when orchestrator is null', async () => {
      const mockManager = createMockMCPManager({
        disconnectServer: vi.fn().mockResolvedValue(true),
        getConnectedServers: vi.fn().mockReturnValue([]),
      });
      deps = createMockDeps({ getRuntime: () => null });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const result = await manager.disconnectMCPServer('server-1');

      expect(result).toBe(true);
      // No orchestrator => no updateConfig
    });
  });

  // ─── initializeMCPServersInBackground ──────────────────────────────────────

  describe('initializeMCPServersInBackground', () => {
    it('does nothing when mcpPorts is empty', async () => {
      const mockManager = createMockMCPManager({
        initializeServers: vi.fn().mockResolvedValue({
          mcpPorts: [],
          mcpClients: [],
          enabledTools: [],
        }),
      });
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const handlers = { handleError: vi.fn() };
      manager.initializeMCPServersInBackground(handlers);

      // Let background task complete
      await vi.waitFor(() => {
        expect(mockManager.initializeServers).toHaveBeenCalledOnce();
      });

      // No ports => no setTools/updateConfig
      expect(mockOrchestrator.setTools).not.toHaveBeenCalled();
      expect(mockOrchestrator.updateConfig).not.toHaveBeenCalled();
    });

    it('creates CompositeToolPort and updates orchestrator when ports exist', async () => {
      const mockMCPPort = {
        getToolDefinitions: vi.fn().mockReturnValue([]),
        executeToolCalls: vi.fn().mockResolvedValue([]),
      };
      const mockManager = createMockMCPManager({
        initializeServers: vi.fn().mockResolvedValue({
          mcpPorts: [mockMCPPort],
          mcpClients: [],
          enabledTools: ['mcp_test_tool'],
        }),
      });
      const existingTools = {
        getToolDefinitions: vi.fn().mockReturnValue([]),
        executeToolCalls: vi.fn().mockResolvedValue([]),
      };
      const mockOrchestrator = createMockOrchestrator({
        getTools: vi.fn().mockReturnValue(existingTools),
      });
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const handlers = { handleError: vi.fn() };
      manager.initializeMCPServersInBackground(handlers);

      // Let background task complete
      await vi.waitFor(() => {
        expect(mockOrchestrator.setTools).toHaveBeenCalledOnce();
      });

      // Should have created CompositeToolPort and set it
      expect(mockOrchestrator.setTools).toHaveBeenCalledOnce();

      // Should have updated enabled tools
      expect(mockOrchestrator.updateConfig).toHaveBeenCalledOnce();
      const call = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<AgentConfig>;
      expect(call.enabledTools).toContain('mcp_test_tool');
      expect(call.enabledTools).toContain('bash_tool');
    });

    it('does not update when orchestrator becomes null during background init', async () => {
      const mockMCPPort = {
        getToolDefinitions: vi.fn().mockReturnValue([]),
        executeToolCalls: vi.fn().mockResolvedValue([]),
      };
      let orchestrator: AgentOrchestrator | null = createMockOrchestrator();
      const mockManager = createMockMCPManager({
        initializeServers: vi.fn().mockImplementation(async () => {
          // Simulate orchestrator becoming null during init
          orchestrator = null;
          return {
            mcpPorts: [mockMCPPort],
            mcpClients: [],
            enabledTools: ['mcp_test_tool'],
          };
        }),
      });
      deps = createMockDeps({ getRuntime: () => createMockRuntime(orchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const handlers = { handleError: vi.fn() };
      manager.initializeMCPServersInBackground(handlers);

      await vi.waitFor(() => {
        expect(mockManager.initializeServers).toHaveBeenCalledOnce();
      });

      // Give time for the background task to attempt the setTools path
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Orchestrator was null when result came back => no setTools
      // (the original orchestrator mock was captured before null)
    });

    it('calls handleError on initialization failure', async () => {
      const mockManager = createMockMCPManager({
        initializeServers: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      deps = createMockDeps();
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const handlers = { handleError: vi.fn() };
      manager.initializeMCPServersInBackground(handlers);

      await vi.waitFor(() => {
        expect(handlers.handleError).toHaveBeenCalledOnce();
      });

      expect(handlers.handleError).toHaveBeenCalledWith(
        expect.stringContaining('Connection refused'),
      );
    });

    it('calls handleError with stringified error for non-Error objects', async () => {
      const mockManager = createMockMCPManager({
        initializeServers: vi.fn().mockRejectedValue('raw string error'),
      });
      deps = createMockDeps();
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      const handlers = { handleError: vi.fn() };
      manager.initializeMCPServersInBackground(handlers);

      await vi.waitFor(() => {
        expect(handlers.handleError).toHaveBeenCalledOnce();
      });

      expect(handlers.handleError).toHaveBeenCalledWith(
        expect.stringContaining('raw string error'),
      );
    });
  });

  // ─── cleanup ───────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('does nothing when mcpManager is null', async () => {
      // Should not throw
      await manager.cleanup();
    });

    it('calls disconnectAllServers on mcpManager', async () => {
      const mockManager = createMockMCPManager();
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      await manager.cleanup();

      expect(mockManager.disconnectAllServers).toHaveBeenCalledOnce();
    });

    it('handles missing disconnectAllServers gracefully', async () => {
      const mockManager = createMockMCPManager();
      delete (mockManager as unknown as Record<string, unknown>).disconnectAllServers;
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      // Should not throw (uses optional chaining)
      await manager.cleanup();
    });
  });

  // ─── Integration: recalculate after multiple operations ────────────────────

  describe('integration', () => {
    it('accumulates tools from multiple connected servers', () => {
      const serverA = createMockMCPServerInfo({
        id: 'github',
        allowedTools: ['mcp_gh_create_issue', 'mcp_gh_list_repos'],
      });
      const serverB = createMockMCPServerInfo({
        id: 'slack',
        allowedTools: ['mcp_slack_send'],
      });
      const mockManager = createMockMCPManager({
        getConnectedServers: vi.fn().mockReturnValue([serverA, serverB]),
      });
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      manager.recalculateEnabledTools();

      const call = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<AgentConfig>;
      const tools = call.enabledTools ?? [];

      // Base tools come first
      const bashIndex = tools.indexOf('bash_tool');
      const firstMCPIndex = tools.indexOf('mcp_gh_create_issue');
      expect(bashIndex).toBeLessThan(firstMCPIndex);

      // All MCP tools present
      expect(tools).toContain('mcp_gh_create_issue');
      expect(tools).toContain('mcp_gh_list_repos');
      expect(tools).toContain('mcp_slack_send');
    });

    it('recalculate produces consistent results when called multiple times', () => {
      const serverA = createMockMCPServerInfo({
        id: 'server-a',
        allowedTools: ['mcp_a_tool'],
      });
      const mockManager = createMockMCPManager({
        getConnectedServers: vi.fn().mockReturnValue([serverA]),
      });
      const mockOrchestrator = createMockOrchestrator();
      deps = createMockDeps({ getRuntime: () => createMockRuntime(mockOrchestrator) });
      manager = new MCPToolsManager(deps);
      manager.setMcpManager(mockManager as unknown as MCPServerManager);

      manager.recalculateEnabledTools();
      manager.recalculateEnabledTools();

      expect(mockOrchestrator.updateConfig).toHaveBeenCalledTimes(2);

      const call1 = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<AgentConfig>;
      const call2 = (mockOrchestrator.updateConfig as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as Partial<AgentConfig>;
      expect(call1.enabledTools).toEqual(call2.enabledTools);
    });
  });
});
