import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigManager } from '../source/config/manager.js';
import { MCPCliHandler, type MCPServerConfig } from '../source/config/mcp-handler.js';

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
  },
  homedir: () => '/mock-home',
  tmpdir: () => '/mock-tmp',
}));

describe('MCPCliHandler', () => {
  beforeEach(async () => {
    ConfigManager.resetInstance();
    const fs = (await import('node:fs')) as typeof import('node:fs') & { __mockFs: Record<string, string> };
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

      await handler.handleMCPCommand(['add', 'filesystem', 'npx', '-y', '@anthropic-ai/mcp-server-filesystem', '/home']);

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

      await manager.set('mcp.servers.figma', {
        transport: 'http',
        url: 'http://127.0.0.1:3845/mcp',
        enabled: true,
        prefix: 'mcp_figma_',
      }, 'global');

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand(['list']);
    });

    it('lists stdio server', async () => {
      const testDir = '/test-dir';
      const manager = ConfigManager.getInstance();
      manager.globalDir = testDir;
      manager.localDir = testDir;

      await manager.set('mcp.servers.filesystem', {
        command: 'npx',
        args: ['-y', '@anthropic-ai/mcp-server-filesystem', '/home'],
        enabled: true,
        prefix: 'mcp_fs_',
      }, 'global');

      const handler = new MCPCliHandler();

      await handler.handleMCPCommand(['list']);
    });
  });
});
