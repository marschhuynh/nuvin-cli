import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MemoryService } from '../source/services/MemoryService.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function removeTempDir(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe('MemoryService', () => {
  let globalDir: string;
  let projectDir: string;
  let service: MemoryService;

  beforeEach(() => {
    globalDir = makeTempDir('mem-global-');
    projectDir = makeTempDir('mem-project-');
    service = new MemoryService({ globalDir, projectDir });
  });

  afterEach(async () => {
    await removeTempDir(globalDir);
    await removeTempDir(projectDir);
  });

  // ── Initialization ───────────────────────────────────────────────────────

  it('initializes with empty memory', async () => {
    const all = await service.getAllMemories();
    expect(all).toHaveLength(0);
  });

  // ── addMemory ────────────────────────────────────────────────────────────

  it('adds a global memory entry', async () => {
    const entry = await service.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'User prefers TypeScript',
      tags: ['preferences', 'language'],
    });

    expect(entry.id).toMatch(/^mem_/);
    expect(entry.content).toBe('User prefers TypeScript');
    expect(entry.scope).toBe('global');
    expect(entry.type).toBe('semantic');
    expect(entry.source).toBe('explicit');
    expect(entry.tags).toEqual(['preferences', 'language']);
    expect(entry.accessCount).toBe(0);
    expect(entry.createdAt).toBeTruthy();
    expect(entry.updatedAt).toBeTruthy();
    expect(entry.lastAccessedAt).toBeTruthy();
  });

  it('adds a project memory entry', async () => {
    const entry = await service.addMemory({
      scope: 'project',
      type: 'episodic',
      source: 'extracted',
      content: 'Fixed bug in auth module last Tuesday',
      tags: ['bug', 'auth'],
    });

    expect(entry.id).toMatch(/^mem_/);
    expect(entry.scope).toBe('project');
    expect(entry.type).toBe('episodic');
    expect(entry.content).toBe('Fixed bug in auth module last Tuesday');
  });

  it('routes global memory to global store', async () => {
    await service.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'Global fact',
      tags: [],
    });

    // Project store should be empty; only global has the entry
    const globalStore = new (await import('../source/services/MemoryService.js')).MemoryService({
      globalDir,
      // no projectDir — forces fallback to global
    });
    const all = await globalStore.getAllMemories();
    expect(all).toHaveLength(1);
    expect(all[0].content).toBe('Global fact');
  });

  // ── getAllMemories ───────────────────────────────────────────────────────

  it('merges global and project memories in getAllMemories', async () => {
    await service.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'Global preference',
      tags: ['global'],
    });
    await service.addMemory({
      scope: 'project',
      type: 'episodic',
      source: 'extracted',
      content: 'Project experience',
      tags: ['project'],
    });

    const all = await service.getAllMemories();

    expect(all).toHaveLength(2);
    const scopes = all.map(e => e.scope);
    expect(scopes).toContain('global');
    expect(scopes).toContain('project');
  });

  it('returns only global memories when no project dir is configured', async () => {
    const globalOnlyService = new MemoryService({ globalDir });

    await globalOnlyService.addMemory({
      scope: 'global',
      type: 'procedural',
      source: 'explicit',
      content: 'Always use strict mode',
      tags: [],
    });

    const all = await globalOnlyService.getAllMemories();
    expect(all).toHaveLength(1);
    expect(all[0].scope).toBe('global');
  });

  // ── getMemoryPromptInjection ─────────────────────────────────────────────

  it('generates a formatted prompt injection string', async () => {
    await service.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'Prefers concise responses',
      tags: ['style'],
    });
    await service.addMemory({
      scope: 'project',
      type: 'episodic',
      source: 'extracted',
      content: 'Refactored API layer in sprint 3',
      tags: ['history'],
    });

    const injection = await service.getMemoryPromptInjection();

    expect(injection).toContain('## Facts & Preferences');
    expect(injection).toContain('Prefers concise responses');
    expect(injection).toContain('## Past Experiences');
    expect(injection).toContain('Refactored API layer in sprint 3');
  });

  it('returns empty string when no memories exist', async () => {
    const injection = await service.getMemoryPromptInjection();
    expect(injection).toBe('');
  });

  it('increments accessCount on entries after prompt injection', async () => {
    const entry = await service.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'Track access count',
      tags: [],
    });

    expect(entry.accessCount).toBe(0);

    await service.getMemoryPromptInjection();

    const all = await service.getAllMemories();
    const updated = all.find(e => e.id === entry.id);
    expect(updated?.accessCount).toBe(1);
  });

  it('respects the limit parameter in getMemoryPromptInjection', async () => {
    // Add 5 semantic memories
    for (let i = 0; i < 5; i++) {
      await service.addMemory({
        scope: 'global',
        type: 'semantic',
        source: 'explicit',
        content: `Fact number ${i}`,
        tags: [],
      });
    }

    // Limit to 2 entries
    const injection = await service.getMemoryPromptInjection(2);
    const bulletCount = (injection.match(/^- /gm) ?? []).length;
    expect(bulletCount).toBeLessThanOrEqual(2);
  });

  // ── deleteMemory ─────────────────────────────────────────────────────────

  it('deletes a memory by id', async () => {
    const entry = await service.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'To be deleted',
      tags: [],
    });

    const result = await service.deleteMemory(entry.id);
    expect(result).toBe(true);

    const all = await service.getAllMemories();
    expect(all.find(e => e.id === entry.id)).toBeUndefined();
  });

  it('deletes a project memory by id', async () => {
    const entry = await service.addMemory({
      scope: 'project',
      type: 'episodic',
      source: 'extracted',
      content: 'Project entry to delete',
      tags: [],
    });

    const result = await service.deleteMemory(entry.id);
    expect(result).toBe(true);

    const all = await service.getAllMemories();
    expect(all).toHaveLength(0);
  });

  it('returns false when deleting a non-existent id', async () => {
    const result = await service.deleteMemory('mem_nonexistent-id');
    expect(result).toBe(false);
  });

  // ── clearMemories ────────────────────────────────────────────────────────

  it('clears all memories when no scope is specified', async () => {
    await service.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'Global entry',
      tags: [],
    });
    await service.addMemory({
      scope: 'project',
      type: 'episodic',
      source: 'extracted',
      content: 'Project entry',
      tags: [],
    });

    await service.clearMemories();

    const all = await service.getAllMemories();
    expect(all).toHaveLength(0);
  });

  it('clears only global memories when scope is global', async () => {
    await service.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'Global entry',
      tags: [],
    });
    await service.addMemory({
      scope: 'project',
      type: 'episodic',
      source: 'extracted',
      content: 'Project entry',
      tags: [],
    });

    await service.clearMemories('global');

    const all = await service.getAllMemories();
    expect(all).toHaveLength(1);
    expect(all[0].scope).toBe('project');
  });

  it('clears only project memories when scope is project', async () => {
    await service.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'Global entry',
      tags: [],
    });
    await service.addMemory({
      scope: 'project',
      type: 'episodic',
      source: 'extracted',
      content: 'Project entry',
      tags: [],
    });

    await service.clearMemories('project');

    const all = await service.getAllMemories();
    expect(all).toHaveLength(1);
    expect(all[0].scope).toBe('global');
  });

  it('clearMemories(project) is a no-op when no project dir is configured', async () => {
    const globalOnlyService = new MemoryService({ globalDir });

    await globalOnlyService.addMemory({
      scope: 'global',
      type: 'semantic',
      source: 'explicit',
      content: 'Should survive',
      tags: [],
    });

    // Should not throw
    await globalOnlyService.clearMemories('project');

    const all = await globalOnlyService.getAllMemories();
    expect(all).toHaveLength(1);
  });
});
