import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JsonFileMemoryStore } from '../../src/memory/memory-store.js';
import type { MemoryEntry } from '../../src/memory/types.js';

describe('JsonFileMemoryStore', () => {
  let tempDir: string;
  let store: JsonFileMemoryStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-store-test-'));
    store = new JsonFileMemoryStore(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('add', () => {
    it('should add a memory entry with correct defaults', async () => {
      const entry = await store.add({
        content: 'The user prefers TypeScript strict mode',
        type: 'semantic',
        scope: 'global',
        tags: ['preferences', 'typescript'],
        source: 'explicit',
      });

      expect(entry.id).toMatch(/^mem_/);
      expect(entry.content).toBe('The user prefers TypeScript strict mode');
      expect(entry.type).toBe('semantic');
      expect(entry.scope).toBe('global');
      expect(entry.tags).toEqual(['preferences', 'typescript']);
      expect(entry.source).toBe('explicit');
      expect(entry.accessCount).toBe(0);
      expect(entry.createdAt).toBeTruthy();
      expect(entry.updatedAt).toBeTruthy();
      expect(entry.lastAccessedAt).toBeTruthy();
      expect(entry.createdAt).toBe(entry.updatedAt);
    });

    it('should assign a unique ID using mem_ prefix', async () => {
      const a = await store.add({ content: 'A', type: 'episodic', scope: 'project', tags: [], source: 'extracted' });
      const b = await store.add({ content: 'B', type: 'episodic', scope: 'project', tags: [], source: 'extracted' });

      expect(a.id).toMatch(/^mem_/);
      expect(b.id).toMatch(/^mem_/);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('persistence', () => {
    it('should persist entries to disk and reload across instances', async () => {
      await store.add({
        content: 'Persisted memory',
        type: 'semantic',
        scope: 'global',
        tags: ['test'],
        source: 'explicit',
      });

      // Create a new store pointing at the same directory — simulates restart
      const store2 = new JsonFileMemoryStore(tempDir);
      const entries = await store2.getAll();

      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe('Persisted memory');
    });

    it('should write a memories.json file to the given directory', async () => {
      await store.add({ content: 'file check', type: 'procedural', scope: 'global', tags: [], source: 'imported' });

      expect(fs.existsSync(path.join(tempDir, 'memories.json'))).toBe(true);
    });
  });

  describe('get', () => {
    it('should retrieve a specific entry by id', async () => {
      const added = await store.add({
        content: 'Specific entry',
        type: 'semantic',
        scope: 'global',
        tags: [],
        source: 'explicit',
      });

      const found = await store.get(added.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(added.id);
      expect(found?.content).toBe('Specific entry');
    });

    it('should return null for unknown id', async () => {
      const result = await store.get('mem_nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update content of an existing entry', async () => {
      const entry = await store.add({
        content: 'Original content',
        type: 'semantic',
        scope: 'global',
        tags: ['old'],
        source: 'explicit',
      });

      // Small delay so the clock advances before the update timestamp is captured
      await new Promise(r => setTimeout(r, 2));
      const updated = await store.update(entry.id, { content: 'Updated content', tags: ['new', 'updated'] });

      expect(updated).not.toBeNull();
      expect(updated?.content).toBe('Updated content');
      expect(updated?.tags).toEqual(['new', 'updated']);
      // updatedAt should differ from createdAt after update
      expect(updated?.updatedAt).not.toBe(entry.createdAt);
    });

    it('should update only provided fields', async () => {
      const entry = await store.add({
        content: 'Original',
        type: 'semantic',
        scope: 'global',
        tags: ['keep'],
        source: 'explicit',
      });

      const updated = await store.update(entry.id, { content: 'Changed' });
      expect(updated?.content).toBe('Changed');
      expect(updated?.tags).toEqual(['keep']);
    });

    it('should return null for unknown id', async () => {
      const result = await store.update('mem_ghost', { content: 'nope' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing entry and return true', async () => {
      const entry = await store.add({
        content: 'To be deleted',
        type: 'episodic',
        scope: 'project',
        tags: [],
        source: 'extracted',
      });

      const deleted = await store.delete(entry.id);
      expect(deleted).toBe(true);

      const found = await store.get(entry.id);
      expect(found).toBeNull();
    });

    it('should return false for unknown id', async () => {
      const result = await store.delete('mem_ghost');
      expect(result).toBe(false);
    });
  });

  describe('search', () => {
    let entries: MemoryEntry[];

    beforeEach(async () => {
      entries = await Promise.all([
        store.add({ content: 'TS pref', type: 'semantic', scope: 'global', tags: ['typescript', 'prefs'], source: 'explicit' }),
        store.add({ content: 'Past event', type: 'episodic', scope: 'project', tags: ['event'], source: 'extracted' }),
        store.add({ content: 'How to build', type: 'procedural', scope: 'global', tags: ['build', 'typescript'], source: 'imported' }),
        store.add({ content: 'Another semantic', type: 'semantic', scope: 'project', tags: ['misc'], source: 'explicit' }),
      ]);
    });

    it('should return all entries when no options given', async () => {
      const results = await store.search();
      expect(results).toHaveLength(4);
    });

    it('should filter by type', async () => {
      const results = await store.search({ type: 'semantic' });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.type === 'semantic')).toBe(true);
    });

    it('should filter by scope', async () => {
      const results = await store.search({ scope: 'project' });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.scope === 'project')).toBe(true);
    });

    it('should filter by tags (any-match)', async () => {
      const results = await store.search({ tags: ['typescript'] });
      expect(results).toHaveLength(2);
    });

    it('should respect the limit option', async () => {
      const results = await store.search({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should combine type and scope filters', async () => {
      const results = await store.search({ type: 'semantic', scope: 'global' });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('TS pref');
    });
  });

  describe('recordAccess', () => {
    it('should increment accessCount and update lastAccessedAt', async () => {
      const entry = await store.add({
        content: 'Accessed entry',
        type: 'semantic',
        scope: 'global',
        tags: [],
        source: 'explicit',
      });

      expect(entry.accessCount).toBe(0);

      // Small delay to ensure timestamp differs
      await new Promise(r => setTimeout(r, 2));
      await store.recordAccess(entry.id);

      const updated = await store.get(entry.id);
      expect(updated?.accessCount).toBe(1);
      expect(updated?.lastAccessedAt).not.toBe(entry.lastAccessedAt);
    });

    it('should increment accessCount on each call', async () => {
      const entry = await store.add({
        content: 'Multi access',
        type: 'semantic',
        scope: 'global',
        tags: [],
        source: 'explicit',
      });

      await store.recordAccess(entry.id);
      await store.recordAccess(entry.id);
      await store.recordAccess(entry.id);

      const updated = await store.get(entry.id);
      expect(updated?.accessCount).toBe(3);
    });

    it('should be a no-op for unknown id', async () => {
      await expect(store.recordAccess('mem_ghost')).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      await store.add({ content: 'G1', type: 'semantic', scope: 'global', tags: [], source: 'explicit' });
      await store.add({ content: 'G2', type: 'episodic', scope: 'global', tags: [], source: 'explicit' });
      await store.add({ content: 'P1', type: 'semantic', scope: 'project', tags: [], source: 'explicit' });
    });

    it('should clear all entries when no scope given', async () => {
      await store.clear();
      const all = await store.getAll();
      expect(all).toHaveLength(0);
    });

    it('should clear only global entries when scope is global', async () => {
      await store.clear('global');
      const all = await store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].scope).toBe('project');
    });

    it('should clear only project entries when scope is project', async () => {
      await store.clear('project');
      const all = await store.getAll();
      expect(all).toHaveLength(2);
      expect(all.every(e => e.scope === 'global')).toBe(true);
    });
  });

  describe('getAll', () => {
    it('should return empty array when store is empty', async () => {
      const result = await store.getAll();
      expect(result).toEqual([]);
    });

    it('should return all entries in insertion order', async () => {
      await store.add({ content: 'First', type: 'semantic', scope: 'global', tags: [], source: 'explicit' });
      await store.add({ content: 'Second', type: 'episodic', scope: 'global', tags: [], source: 'extracted' });

      const result = await store.getAll();
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('First');
      expect(result[1].content).toBe('Second');
    });
  });
});
