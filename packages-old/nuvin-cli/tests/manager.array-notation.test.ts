import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigManager } from '../source/config/manager.js';

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

describe('ConfigManager Array Notation', () => {
  beforeEach(async () => {
    ConfigManager.resetInstance();
    const fs = (await import('node:fs')) as typeof import('node:fs') & { __mockFs: Record<string, string> };
    const mockFs = fs.__mockFs;
    for (const key in mockFs) {
      delete mockFs[key];
    }
  });

  it('should set array element with array notation', async () => {
    const testDir = '/test-dir';
    const manager = ConfigManager.getInstance();
    manager.globalDir = testDir;
    manager.localDir = testDir;

    await manager.set('providers.openrouter.auth[0].api-key', 'sk-or-xxx', 'global');

    const config = manager.getConfig();
    expect(config.providers?.openrouter?.auth).toBeDefined();
    expect(Array.isArray(config.providers?.openrouter?.auth)).toBe(true);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion for dynamic config
    expect((config.providers?.openrouter?.auth as any[])[0]).toEqual({ 'api-key': 'sk-or-xxx' });
  });

  it('should handle multiple array elements', async () => {
    const testDir = '/test-dir';
    const manager = ConfigManager.getInstance();
    manager.globalDir = testDir;
    manager.localDir = testDir;

    await manager.set('providers.openrouter.auth[0].type', 'api-key', 'global');
    await manager.set('providers.openrouter.auth[0].api-key', 'sk-or-xxx', 'global');

    const config = manager.getConfig();
    // biome-ignore lint/suspicious/noExplicitAny: test assertion for dynamic config
    const auth = config.providers?.openrouter?.auth as any[];

    expect(auth).toBeDefined();
    expect(Array.isArray(auth)).toBe(true);
    expect(auth[0]).toEqual({ type: 'api-key', 'api-key': 'sk-or-xxx' });
  });
});
