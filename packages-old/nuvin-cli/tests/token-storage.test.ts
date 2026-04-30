import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileTokenStorage, MemoryTokenStorage } from '../source/services/TokenStorage.js';

describe('MemoryTokenStorage', () => {
  let storage: MemoryTokenStorage;

  beforeEach(() => {
    storage = new MemoryTokenStorage();
  });

  it('stores and retrieves tokens', async () => {
    const tokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      scope: 'read write',
    };

    await storage.set('test-key', tokens);
    const retrieved = await storage.get('test-key');

    expect(retrieved).toEqual(tokens);
  });

  it('returns null for non-existent key', async () => {
    const result = await storage.get('non-existent');
    expect(result).toBeNull();
  });

  it('deletes tokens', async () => {
    await storage.set('test-key', { accessToken: 'token' });
    await storage.delete('test-key');

    const result = await storage.get('test-key');
    expect(result).toBeNull();
  });

  it('lists all keys', async () => {
    await storage.set('key1', { accessToken: 'token1' });
    await storage.set('key2', { accessToken: 'token2' });

    const keys = await storage.list();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
  });

  it('clears all tokens', async () => {
    await storage.set('key1', { accessToken: 'token1' });
    await storage.set('key2', { accessToken: 'token2' });
    storage.clear();

    const keys = await storage.list();
    expect(keys).toHaveLength(0);
  });

  it('overwrites existing tokens', async () => {
    await storage.set('test-key', { accessToken: 'old-token' });
    await storage.set('test-key', { accessToken: 'new-token' });

    const result = await storage.get('test-key');
    expect(result?.accessToken).toBe('new-token');
  });
});

describe('FileTokenStorage', () => {
  let tempDir: string;
  let storage: FileTokenStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvin-token-test-'));
    storage = new FileTokenStorage(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('stores and retrieves tokens with encryption', async () => {
    const tokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      scope: 'read write',
      tokenType: 'Bearer',
    };

    await storage.set('test-key', tokens);
    const retrieved = await storage.get('test-key');

    expect(retrieved).toEqual(tokens);
  });

  it('returns null for non-existent key', async () => {
    const result = await storage.get('non-existent');
    expect(result).toBeNull();
  });

  it('deletes tokens', async () => {
    await storage.set('test-key', { accessToken: 'token' });
    await storage.delete('test-key');

    const result = await storage.get('test-key');
    expect(result).toBeNull();
  });

  it('lists all keys', async () => {
    await storage.set('key1', { accessToken: 'token1' });
    await storage.set('key2', { accessToken: 'token2' });

    const keys = await storage.list();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
  });

  it('persists tokens to file', async () => {
    const tokens = { accessToken: 'persistent-token' };
    await storage.set('persist-key', tokens);

    const newStorage = new FileTokenStorage(tempDir);
    const retrieved = await newStorage.get('persist-key');

    expect(retrieved?.accessToken).toBe('persistent-token');
  });

  it('creates config directory if not exists', async () => {
    const nonExistentDir = path.join(tempDir, 'nested', 'dir');
    const nestedStorage = new FileTokenStorage(nonExistentDir);

    await nestedStorage.set('test-key', { accessToken: 'token' });

    expect(fs.existsSync(nonExistentDir)).toBe(true);
  });

  it('handles corrupted token file gracefully', async () => {
    const storePath = path.join(tempDir, '.tokens.json');
    fs.writeFileSync(storePath, 'invalid json content', { mode: 0o600 });

    const result = await storage.get('any-key');
    expect(result).toBeNull();
  });

  it('sets restrictive file permissions', async () => {
    await storage.set('test-key', { accessToken: 'token' });

    const storePath = path.join(tempDir, '.tokens.json');
    const stats = fs.statSync(storePath);
    const mode = stats.mode & 0o777;

    expect(mode).toBe(0o600);
  });

  it('handles concurrent writes', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(storage.set(`key-${i}`, { accessToken: `token-${i}` }));
    }

    await Promise.all(promises);

    for (let i = 0; i < 10; i++) {
      const result = await storage.get(`key-${i}`);
      expect(result?.accessToken).toBe(`token-${i}`);
    }
  });

  it('clears all tokens', async () => {
    await storage.set('key1', { accessToken: 'token1' });
    await storage.set('key2', { accessToken: 'token2' });
    await storage.clear();

    const keys = await storage.list();
    expect(keys).toHaveLength(0);
  });

  it('encrypts tokens in storage file', async () => {
    const tokens = { accessToken: 'secret-token-12345' };
    await storage.set('test-key', tokens);

    const storePath = path.join(tempDir, '.tokens.json');
    const fileContent = fs.readFileSync(storePath, 'utf8');

    expect(fileContent).not.toContain('secret-token-12345');
    expect(fileContent).toContain('iv');
    expect(fileContent).toContain('data');
    expect(fileContent).toContain('tag');
  });
});
