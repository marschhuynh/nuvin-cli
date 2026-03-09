import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPServerManager } from '../source/services/MCPServerManager.js';
import type { MessageLine } from '../source/adapters/index.js';
import type { MCPSettings } from '../source/config/types.js';

vi.mock('@nuvin/nuvin-core', async () => {
  const actual = await vi.importActual('@nuvin/nuvin-core');
  return {
    ...actual,
    CoreMCPClient: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
    MCPToolPort: vi.fn().mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      getExposedToolNames: vi.fn().mockReturnValue([]),
    })),
    loadMCPConfig: vi.fn().mockResolvedValue(null),
  };
});

const createMockOptions = (config?: MCPSettings | null) => {
  const messages: MessageLine[] = [];
  const errors: string[] = [];

  return {
    getConfig: () => config ?? undefined,
    appendLine: (line: MessageLine) => messages.push(line),
    handleError: (message: string) => errors.push(message),
    silentInit: true,
    messages,
    errors,
  };
};

describe('MCPServerManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializeServers handles empty config', async () => {
    const mockOptions = createMockOptions(null);
    const manager = new MCPServerManager(mockOptions);

    const result = await manager.initializeServers();

    expect(result).toEqual({ mcpPorts: [], mcpClients: [], enabledTools: [] });
    expect(manager.getAllServers().length).toBe(0);
  });

  it('initializeServers handles config with no servers', async () => {
    const mockOptions = createMockOptions({ servers: {} });
    const manager = new MCPServerManager(mockOptions);

    const result = await manager.initializeServers();

    expect(result).toEqual({ mcpPorts: [], mcpClients: [], enabledTools: [] });
    expect(manager.getAllServers().length).toBe(0);
  });

  it('initializeServer creates failed server with missing transport config', async () => {
    const config: MCPSettings = {
      servers: {
        'test-server': {
          prefix: 'test_',
        },
      },
    };

    const mockOptions = createMockOptions(config);
    const manager = new MCPServerManager(mockOptions);

    await manager.initializeServers();

    const servers = manager.getAllServers();
    expect(servers.length).toBe(1);
    expect(servers[0].id).toBe('test-server');
    expect(servers[0].status).toBe('failed');
    expect(servers[0].error).toBe('Missing or invalid transport configuration');
    expect(servers[0].client).toBe(null);
    expect(servers[0].port).toBe(null);
    expect(servers[0].exposedTools).toEqual([]);
    expect(servers[0].allowedTools).toEqual([]);
  });

  it('getAllServers returns both connected and failed servers', async () => {
    const config: MCPSettings = {
      servers: {
        'failed-server': {
          prefix: 'failed_',
        },
        'another-failed': {
          prefix: 'another_',
        },
      },
    };

    const mockOptions = createMockOptions(config);
    const manager = new MCPServerManager(mockOptions);

    await manager.initializeServers();

    const allServers = manager.getAllServers();
    expect(allServers.length).toBe(2);

    const failedServers = manager.getFailedServers();
    expect(failedServers.length).toBe(2);

    const connectedServers = manager.getConnectedServers();
    expect(connectedServers.length).toBe(0);
  });

  it('updateAllowedToolsConfig filters tools correctly', async () => {
    const manager = new MCPServerManager(createMockOptions(null));

    const mockServer = {
      id: 'test-server',
      client: null,
      port: null,
      exposedTools: ['tool1', 'tool2', 'tool3'],
      allowedTools: ['tool1', 'tool2', 'tool3'],
      prefix: 'test_',
      status: 'connected' as const,
    };

    (manager as { servers: Map<string, unknown> }).servers.set('test-server', mockServer);

    await manager.updateAllowedToolsConfig({
      'test-server': {
        tool1: true,
        tool2: false,
        tool3: true,
      },
    });

    const serverInfo = manager.getServerInfo('test-server');
    expect(serverInfo).toBeTruthy();
    expect(serverInfo?.allowedTools).toEqual(['tool1', 'tool3']);
    expect(serverInfo?.exposedTools).toEqual(['tool1', 'tool2', 'tool3']);
  });

  it('updateAllowedToolsConfig defaults to true for unspecified tools', async () => {
    const manager = new MCPServerManager(createMockOptions(null));

    const mockServer = {
      id: 'test-server',
      client: null,
      port: null,
      exposedTools: ['tool1', 'tool2', 'tool3'],
      allowedTools: ['tool1', 'tool2', 'tool3'],
      prefix: 'test_',
      status: 'connected' as const,
    };

    (manager as { servers: Map<string, unknown> }).servers.set('test-server', mockServer);

    await manager.updateAllowedToolsConfig({
      'test-server': {
        tool2: false,
      },
    });

    const serverInfo = manager.getServerInfo('test-server');
    expect(serverInfo).toBeTruthy();
    expect(serverInfo?.allowedTools).toEqual(['tool1', 'tool3']);
  });

  it('getServerInfo returns undefined for non-existent server', () => {
    const manager = new MCPServerManager(createMockOptions(null));

    const serverInfo = manager.getServerInfo('non-existent');

    expect(serverInfo).toBeUndefined();
  });

  it('exposedTools and allowedTools are separated correctly', async () => {
    const manager = new MCPServerManager(createMockOptions(null));

    const mockServer = {
      id: 'test-server',
      client: null,
      port: null,
      exposedTools: ['tool1', 'tool2', 'tool3'],
      allowedTools: ['tool1', 'tool2', 'tool3'],
      prefix: 'test_',
      status: 'connected' as const,
    };

    (manager as { servers: Map<string, unknown> }).servers.set('test-server', mockServer);

    await manager.updateAllowedToolsConfig({
      'test-server': {
        tool1: true,
        tool2: false,
        tool3: false,
      },
    });

    const serverInfo = manager.getServerInfo('test-server');

    expect(serverInfo?.exposedTools).toEqual(['tool1', 'tool2', 'tool3']);
    expect(serverInfo?.allowedTools).toEqual(['tool1']);
    expect(serverInfo?.exposedTools).not.toEqual(serverInfo?.allowedTools);
  });

  it('updateAllowedToolsConfig persists config internally', async () => {
    const manager = new MCPServerManager(createMockOptions(null));

    const mockServer = {
      id: 'test-server',
      client: null,
      port: null,
      exposedTools: ['tool1', 'tool2', 'tool3'],
      allowedTools: ['tool1', 'tool2', 'tool3'],
      prefix: 'test_',
      status: 'connected' as const,
    };

    (manager as { servers: Map<string, unknown> }).servers.set('test-server', mockServer);

    const config = {
      'test-server': {
        tool1: true,
        tool2: false,
        tool3: true,
      },
    };

    await manager.updateAllowedToolsConfig(config);

    // Verify internal config is persisted
    expect((manager as { allowedToolsConfig: Record<string, Record<string, boolean>> }).allowedToolsConfig).toEqual(
      config,
    );
  });

  it('setAllowedToolsConfig sets config before initialization', () => {
    const manager = new MCPServerManager(createMockOptions(null));

    const config = {
      'test-server': {
        tool1: true,
        tool2: false,
      },
    };

    manager.setAllowedToolsConfig(config);

    expect((manager as { allowedToolsConfig: Record<string, Record<string, boolean>> }).allowedToolsConfig).toEqual(
      config,
    );
  });

  it('updateAllowedToolsConfig updates multiple servers', async () => {
    const manager = new MCPServerManager(createMockOptions(null));

    const mockServer1 = {
      id: 'server1',
      client: null,
      port: null,
      exposedTools: ['tool1', 'tool2'],
      allowedTools: ['tool1', 'tool2'],
      prefix: 's1_',
      status: 'connected' as const,
    };

    const mockServer2 = {
      id: 'server2',
      client: null,
      port: null,
      exposedTools: ['tool3', 'tool4', 'tool5'],
      allowedTools: ['tool3', 'tool4', 'tool5'],
      prefix: 's2_',
      status: 'connected' as const,
    };

    (manager as { servers: Map<string, unknown> }).servers.set('server1', mockServer1);
    (manager as { servers: Map<string, unknown> }).servers.set('server2', mockServer2);

    await manager.updateAllowedToolsConfig({
      server1: {
        tool1: false,
        tool2: true,
      },
      server2: {
        tool3: true,
        tool4: false,
        tool5: true,
      },
    });

    const server1Info = manager.getServerInfo('server1');
    const server2Info = manager.getServerInfo('server2');

    expect(server1Info?.allowedTools).toEqual(['tool2']);
    expect(server2Info?.allowedTools).toEqual(['tool3', 'tool5']);
  });

  it('updateAllowedToolsConfig handles empty config for server', async () => {
    const manager = new MCPServerManager(createMockOptions(null));

    const mockServer = {
      id: 'test-server',
      client: null,
      port: null,
      exposedTools: ['tool1', 'tool2', 'tool3'],
      allowedTools: ['tool1', 'tool2', 'tool3'],
      prefix: 'test_',
      status: 'connected' as const,
    };

    (manager as { servers: Map<string, unknown> }).servers.set('test-server', mockServer);

    // Update with config that doesn't include this server
    await manager.updateAllowedToolsConfig({
      'other-server': {
        tool1: false,
      },
    });

    const serverInfo = manager.getServerInfo('test-server');

    // Should keep original allowedTools when server not in config
    expect(serverInfo?.allowedTools).toEqual(['tool1', 'tool2', 'tool3']);
  });

  it('updateAllowedToolsConfig takes effect immediately', async () => {
    const manager = new MCPServerManager(createMockOptions(null));

    const mockServer = {
      id: 'test-server',
      client: null,
      port: null,
      exposedTools: ['tool1', 'tool2', 'tool3'],
      allowedTools: ['tool1', 'tool2', 'tool3'],
      prefix: 'test_',
      status: 'connected' as const,
    };

    (manager as { servers: Map<string, unknown> }).servers.set('test-server', mockServer);

    // Initial state
    expect(manager.getServerInfo('test-server')?.allowedTools).toEqual(['tool1', 'tool2', 'tool3']);

    // Update config
    await manager.updateAllowedToolsConfig({
      'test-server': {
        tool1: true,
        tool2: false,
        tool3: true,
      },
    });

    // Verify change takes effect immediately
    const serverInfo = manager.getServerInfo('test-server');
    expect(serverInfo?.allowedTools).toEqual(['tool1', 'tool3']);

    // Update again
    await manager.updateAllowedToolsConfig({
      'test-server': {
        tool1: false,
        tool2: false,
        tool3: false,
      },
    });

    // Verify second change also takes effect immediately
    const serverInfo2 = manager.getServerInfo('test-server');
    expect(serverInfo2?.allowedTools).toEqual([]);
  });
});
