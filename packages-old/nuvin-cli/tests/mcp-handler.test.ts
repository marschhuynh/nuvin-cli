import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigManager } from '../source/config/manager.js';
import { MCPCliHandler, type MCPServerConfig } from '../source/config/mcp-handler.js';

vi.mock('@nuvin/nuvin-core', async () => {
  const actual = await vi.importActual<typeof import('@nuvin/nuvin-core')>('@nuvin/nuvin-core');
  return {
    ...actual,
    MCPOAuthClient: class {
      async discoverOAuthServer() {
        return {
          authorizationServerUrl: 'https://api.example.com/oauth',
          authServerMetadata: {
            issuer: 'https://api.example.com/oauth',
            authorization_endpoint: 'https://api.example.com/oauth/authorize',
            token_endpoint: 'https://api.example.com/oauth/token',
            scopes_supported: ['read', 'write'],
            code_challenge_methods_supported: ['S256'],
          },
        };
      }
      async initiateAuthFlow() {
        return {
          success: true,
          tokens: {
            accessToken: 'mock-token',
            expiresAt: Date.now() + 3600000,
          },
        };
      }
      async getAuthStatus() {
        return { authenticated: true };
      }
      async logout() {
        return Promise.resolve();
      }
    },
  };
});

vi.mock('open', () => ({
  default: vi.fn(async () => {}),
}));

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
      statSync: vi.fn((filePath: string) => {
        if (!(filePath in mockFs)) {
          const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        }
        return {
          isFile: () => !filePath.endsWith('/'),
          isDirectory: () => filePath.endsWith('/'),
        };
      }),
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
    statSync: vi.fn((filePath: string) => {
      if (!(filePath in mockFs)) {
        const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return {
        isFile: () => !filePath.endsWith('/'),
        isDirectory: () => filePath.endsWith('/'),
      };
    }),
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
    hostname: () => 'mock-host',
    userInfo: () => ({ username: 'mock-user' }),
    platform: () => 'darwin',
    arch: () => 'arm64',
  },
  homedir: () => '/mock-home',
  tmpdir: () => '/mock-tmp',
  hostname: () => 'mock-host',
  userInfo: () => ({ username: 'mock-user' }),
  platform: () => 'darwin',
  arch: () => 'arm64',
}));

describe('MCPCliHandler', () => {
  beforeEach(async () => {
    ConfigManager.resetInstance();
    const fs = (await import('node:fs')) as unknown as typeof import('node:fs') & { __mockFs: Record<string, string> };
    const mockFs = fs.__mockFs;
    for (const key in mockFs) {
      delete mockFs[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('URL auto-detection (positional URL)', () => {
    it('detects http:// URL as positional argument and creates http transport', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand(['add', 'figma', 'http://127.0.0.1:3845/mcp']);

      const config = manager.get('mcp.servers.figma') as MCPServerConfig;
      expect(config.transport).toBe('http');
      expect(config.url).toBe('http://127.0.0.1:3845/mcp');
      expect(config.command).toBeUndefined();
    });

    it('detects https:// URL as positional argument and creates http transport', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand(['add', 'remote-server', 'https://api.example.com/mcp']);

      const config = manager.get('mcp.servers.remote-server') as MCPServerConfig;
      expect(config.transport).toBe('http');
      expect(config.url).toBe('https://api.example.com/mcp');
      expect(config.command).toBeUndefined();
    });

    it('ignores additional positional arguments when URL is provided', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      const consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handler.handleMCPCommand(['add', 'server', 'http://localhost:3000/mcp', 'extra-arg']);

      consoleWarnMock.mockRestore();

      const config = manager.get('mcp.servers.server') as MCPServerConfig;
      expect(config.url).toBe('http://localhost:3000/mcp');
      expect(config.command).toBeUndefined();
    });

    it('treats non-URL positional as command for stdio transport', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'filesystem',
        'npx',
        '-y',
        '@anthropic-ai/mcp-server-filesystem',
        '/home',
      ]);

      const config = manager.get('mcp.servers.filesystem') as MCPServerConfig;
      expect(config.transport).toBeUndefined();
      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['-y', '@anthropic-ai/mcp-server-filesystem', '/home']);
      expect(config.url).toBeUndefined();
    });

    it('allows positional URL with explicit --transport http', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand(['add', 'server', '--transport', 'http', 'http://localhost:3000/mcp']);

      const config = manager.get('mcp.servers.server') as MCPServerConfig;
      expect(config.transport).toBe('http');
      expect(config.url).toBe('http://localhost:3000/mcp');
    });
  });

  describe('--url flag', () => {
    it('creates http transport with --url flag', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand(['add', 'figma', '--url', 'http://127.0.0.1:3845/mcp']);

      const config = manager.get('mcp.servers.figma') as MCPServerConfig;
      expect(config.transport).toBe('http');
      expect(config.url).toBe('http://127.0.0.1:3845/mcp');
      expect(config.command).toBeUndefined();
    });

    it('creates http transport with --url flag and headers', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'api-server',
        '--url',
        'https://api.example.com/mcp',
        '--header',
        'Authorization=Bearer token123',
        '--timeout',
        '60000',
      ]);

      const config = manager.get('mcp.servers.api-server') as MCPServerConfig;
      expect(config.transport).toBe('http');
      expect(config.url).toBe('https://api.example.com/mcp');
      expect(config.headers?.Authorization).toBe('Bearer token123');
      expect(config.timeoutMs).toBe(60000);
    });
  });

  describe('--profile support', () => {
    it('adds server with profile passed to constructor', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler('work');

      await handler.handleMCPCommand(['add', 'figma', '--url', 'http://127.0.0.1:3845/mcp']);

      const config = manager.get('mcp.servers.figma') as MCPServerConfig;
      expect(config.transport).toBe('http');
      expect(config.url).toBe('http://127.0.0.1:3845/mcp');
    });
  });

  describe('list command with HTTP servers', () => {
    it('lists http server', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      await manager.set(
        'mcp.servers.figma',
        {
          transport: 'http',
          url: 'http://127.0.0.1:3845/mcp',
          enabled: true,
          prefix: 'mcp_figma_',
        },
        'global',
      );

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand(['list']);
    });

    it('lists stdio server', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      await manager.set(
        'mcp.servers.filesystem',
        {
          command: 'npx',
          args: ['-y', '@anthropic-ai/mcp-server-filesystem', '/home'],
          enabled: true,
          prefix: 'mcp_fs_',
        },
        'global',
      );

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand(['list']);
    });
  });

  describe('OAuth authentication options', () => {
    it('adds server with --oauth flag', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'oauth-server',
        '--url',
        'https://api.example.com/mcp',
        '--oauth',
        '--client-id',
        'my-client-id',
      ]);

      const config = manager.get('mcp.servers.oauth-server') as MCPServerConfig;
      expect(config.transport).toBe('http');
      expect(config.url).toBe('https://api.example.com/mcp');
      expect(config.auth?.type).toBe('oauth');
      expect(config.auth?.oauth?.clientId).toBe('my-client-id');
    });

    it('adds server with --client-metadata-url', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'oauth-server',
        '--url',
        'https://api.example.com/mcp',
        '--client-metadata-url',
        'https://app.example.com/oauth/client.json',
      ]);

      const config = manager.get('mcp.servers.oauth-server') as MCPServerConfig;
      expect(config.auth?.type).toBe('oauth');
      expect(config.auth?.oauth?.clientMetadataUrl).toBe('https://app.example.com/oauth/client.json');
    });

    it('adds server with --auth-server override', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'oauth-server',
        '--url',
        'https://api.example.com/mcp',
        '--oauth',
        '--client-id',
        'my-client',
        '--auth-server',
        'https://auth.example.com',
      ]);

      const config = manager.get('mcp.servers.oauth-server') as MCPServerConfig;
      expect(config.auth?.oauth?.authorizationServer).toBe('https://auth.example.com');
    });

    it('adds server with --scopes', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'oauth-server',
        '--url',
        'https://api.example.com/mcp',
        '--oauth',
        '--client-id',
        'my-client',
        '--scopes',
        'read,write,admin',
      ]);

      const config = manager.get('mcp.servers.oauth-server') as MCPServerConfig;
      expect(config.auth?.oauth?.scopes).toEqual(['read', 'write', 'admin']);
    });

    it('adds server with --auth-token for bearer auth', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'bearer-server',
        '--url',
        'https://api.example.com/mcp',
        '--auth-token',
        'my-secret-token',
      ]);

      const config = manager.get('mcp.servers.bearer-server') as MCPServerConfig;
      expect(config.auth?.type).toBe('bearer');
      expect(config.auth?.token).toBe('my-secret-token');
    });

    it('adds server with explicit --auth-type', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'noauth-server',
        '--url',
        'https://api.example.com/mcp',
        '--auth-type',
        'none',
      ]);

      const config = manager.get('mcp.servers.noauth-server') as MCPServerConfig;
      expect(config.auth?.type).toBe('none');
    });
  });

  describe('auth command - add with auth options', () => {
    it('adds server with OAuth config using add command', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'auth-oauth-server',
        '--url',
        'https://api.example.com/mcp',
        '--oauth',
        '--client-id',
        'new-client-id',
        '--scopes',
        'files:read,files:write',
      ]);

      const config = manager.get('mcp.servers.auth-oauth-server') as MCPServerConfig;
      expect(config.auth?.type).toBe('oauth');
      expect(config.auth?.oauth?.clientId).toBe('new-client-id');
      expect(config.auth?.oauth?.scopes).toEqual(['files:read', 'files:write']);
    });

    it('adds server with bearer auth using add command', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'auth-bearer-server',
        '--url',
        'https://api.example.com/mcp',
        '--auth-token',
        'my-token',
      ]);

      const config = manager.get('mcp.servers.auth-bearer-server') as MCPServerConfig;
      expect(config.auth?.type).toBe('bearer');
      expect(config.auth?.token).toBe('my-token');
    });

    it('adds server with no auth using --auth-type none', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'auth-none-server',
        '--url',
        'https://api.example.com/mcp',
        '--auth-type',
        'none',
      ]);

      const config = manager.get('mcp.servers.auth-none-server') as MCPServerConfig;
      expect(config.auth?.type).toBe('none');
    });
  });

  describe('show command with auth info', () => {
    it('adds server with auth and shows in list', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'show-oauth-api',
        '--url',
        'https://api.example.com/mcp',
        '--oauth',
        '--client-id',
        'my-client',
      ]);

      const config = manager.get('mcp.servers.show-oauth-api') as MCPServerConfig;
      expect(config.auth?.type).toBe('oauth');
      expect(config.auth?.oauth?.clientId).toBe('my-client');
    });

    it('adds server with auth and verifies JSON has auth config', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand([
        'add',
        'show-oauth-json-api',
        '--url',
        'https://api.example.com/mcp',
        '--oauth',
        '--client-id',
        'my-client',
        '--scopes',
        'read,write',
      ]);

      const config = manager.get('mcp.servers.show-oauth-json-api') as MCPServerConfig;
      expect(config).toBeDefined();
      expect(config.auth).toBeDefined();
      expect(config.auth?.type).toBe('oauth');
      expect(config.auth?.oauth?.scopes).toEqual(['read', 'write']);
    });
  });

  describe('list command shows auth info', () => {
    it('shows auth type badge for servers', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      await manager.set(
        'mcp.servers.oauth-server',
        {
          transport: 'http',
          url: 'https://api.example.com/mcp',
          enabled: true,
          auth: { type: 'oauth', oauth: { clientId: 'client' } },
        },
        'global',
      );

      await manager.set(
        'mcp.servers.bearer-server',
        {
          transport: 'http',
          url: 'https://api2.example.com/mcp',
          enabled: true,
          auth: { type: 'bearer', token: 'token' },
        },
        'global',
      );

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand(['list']);
    });
  });
});
