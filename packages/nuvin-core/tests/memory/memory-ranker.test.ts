import { describe, it, expect } from 'vitest';
import { rankMemories, formatMemoriesForPrompt } from '../../src/memory/memory-ranker.js';
import type { MemoryEntry } from '../../src/memory/types.js';

// ── Helper ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const now = new Date().toISOString();
  return {
    id: 'mem_test',
    content: 'Default memory content',
    type: 'semantic',
    scope: 'global',
    tags: [],
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    lastAccessedAt: now,
    source: 'explicit',
    ...overrides,
  };
}

// ── rankMemories ───────────────────────────────────────────────────────────

describe('rankMemories', () => {
  it('ranks recently accessed memories higher than old ones', () => {
    const recent = makeEntry({
      id: 'mem_recent',
      content: 'Recent memory',
      lastAccessedAt: new Date().toISOString(),
      accessCount: 1,
    });
    const old = makeEntry({
      id: 'mem_old',
      content: 'Old memory',
      // 30 days ago
      lastAccessedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      accessCount: 1,
    });

    const ranked = rankMemories([old, recent]);

    expect(ranked[0].id).toBe('mem_recent');
    expect(ranked[1].id).toBe('mem_old');
  });

  it('ranks frequently accessed memories higher than low-access ones', () => {
    const now = new Date().toISOString();
    const frequent = makeEntry({
      id: 'mem_frequent',
      content: 'Frequent memory',
      lastAccessedAt: now,
      accessCount: 50,
    });
    const infrequent = makeEntry({
      id: 'mem_infrequent',
      content: 'Infrequent memory',
      lastAccessedAt: now,
      accessCount: 1,
    });

    const ranked = rankMemories([infrequent, frequent]);

    expect(ranked[0].id).toBe('mem_frequent');
    expect(ranked[1].id).toBe('mem_infrequent');
  });

  it('ranks semantic memories higher than episodic given equal recency and access count', () => {
    const now = new Date().toISOString();
    const semantic = makeEntry({
      id: 'mem_semantic',
      type: 'semantic',
      lastAccessedAt: now,
      accessCount: 1,
    });
    const episodic = makeEntry({
      id: 'mem_episodic',
      type: 'episodic',
      lastAccessedAt: now,
      accessCount: 1,
    });

    const ranked = rankMemories([episodic, semantic]);

    expect(ranked[0].id).toBe('mem_semantic');
    expect(ranked[1].id).toBe('mem_episodic');
  });

  it('ranks episodic memories higher than procedural given equal recency and access count', () => {
    const now = new Date().toISOString();
    const episodic = makeEntry({
      id: 'mem_episodic',
      type: 'episodic',
      lastAccessedAt: now,
      accessCount: 1,
    });
    const procedural = makeEntry({
      id: 'mem_procedural',
      type: 'procedural',
      lastAccessedAt: now,
      accessCount: 1,
    });

    const ranked = rankMemories([procedural, episodic]);

    expect(ranked[0].id).toBe('mem_episodic');
    expect(ranked[1].id).toBe('mem_procedural');
  });

  it('respects the limit parameter', () => {
    const now = new Date().toISOString();
    const entries = [
      makeEntry({ id: 'mem_1', content: 'First' }),
      makeEntry({ id: 'mem_2', content: 'Second', lastAccessedAt: now }),
      makeEntry({ id: 'mem_3', content: 'Third' }),
      makeEntry({ id: 'mem_4', content: 'Fourth' }),
    ];

    const ranked = rankMemories(entries, 2);

    expect(ranked).toHaveLength(2);
  });

  it('returns all entries when limit is not provided', () => {
    const entries = [
      makeEntry({ id: 'mem_1' }),
      makeEntry({ id: 'mem_2' }),
      makeEntry({ id: 'mem_3' }),
    ];

    const ranked = rankMemories(entries);

    expect(ranked).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(rankMemories([])).toEqual([]);
  });
});

// ── formatMemoriesForPrompt ────────────────────────────────────────────────

describe('formatMemoriesForPrompt', () => {
  it('returns empty string for empty array', () => {
    expect(formatMemoriesForPrompt([])).toBe('');
  });

  it('groups entries by type with correct section headers', () => {
    const entries = [
      makeEntry({ id: 'mem_s1', type: 'semantic', content: 'Prefers TypeScript' }),
      makeEntry({ id: 'mem_e1', type: 'episodic', content: 'Worked on Project X' }),
      makeEntry({ id: 'mem_p1', type: 'procedural', content: 'Always run tests first' }),
    ];

    const output = formatMemoriesForPrompt(entries);

    expect(output).toContain('## Facts & Preferences');
    expect(output).toContain('## Past Experiences');
    expect(output).toContain('## Behavioral Notes');
  });

  it('formats each memory as a bullet point', () => {
    const entries = [
      makeEntry({ id: 'mem_s1', type: 'semantic', content: 'Prefers TypeScript' }),
      makeEntry({ id: 'mem_e1', type: 'episodic', content: 'Worked on Project X' }),
    ];

    const output = formatMemoriesForPrompt(entries);

    expect(output).toContain('- Prefers TypeScript');
    expect(output).toContain('- Worked on Project X');
  });

  it('places content under the correct section header', () => {
    const entries = [
      makeEntry({ id: 'mem_s1', type: 'semantic', content: 'Fact about user' }),
      makeEntry({ id: 'mem_p1', type: 'procedural', content: 'Behavioral rule' }),
    ];

    const output = formatMemoriesForPrompt(entries);

    const factsIdx = output.indexOf('## Facts & Preferences');
    const behaviorIdx = output.indexOf('## Behavioral Notes');
    const factBulletIdx = output.indexOf('- Fact about user');
    const behaviorBulletIdx = output.indexOf('- Behavioral rule');

    // Fact bullet appears after Facts header
    expect(factBulletIdx).toBeGreaterThan(factsIdx);
    // Behavioral bullet appears after Behavioral Notes header
    expect(behaviorBulletIdx).toBeGreaterThan(behaviorIdx);
    // Facts section comes before Behavioral Notes section
    expect(factsIdx).toBeLessThan(behaviorIdx);
  });

  it('orders sections: semantic, episodic, procedural', () => {
    const entries = [
      makeEntry({ id: 'mem_p1', type: 'procedural', content: 'Procedural note' }),
      makeEntry({ id: 'mem_e1', type: 'episodic', content: 'Past experience' }),
      makeEntry({ id: 'mem_s1', type: 'semantic', content: 'A fact' }),
    ];

    const output = formatMemoriesForPrompt(entries);

    const semanticIdx = output.indexOf('## Facts & Preferences');
    const episodicIdx = output.indexOf('## Past Experiences');
    const proceduralIdx = output.indexOf('## Behavioral Notes');

    expect(semanticIdx).toBeLessThan(episodicIdx);
    expect(episodicIdx).toBeLessThan(proceduralIdx);
  });

  it('omits sections with no entries', () => {
    const entries = [
      makeEntry({ id: 'mem_s1', type: 'semantic', content: 'A fact' }),
    ];

    const output = formatMemoriesForPrompt(entries);

    expect(output).toContain('## Facts & Preferences');
    expect(output).not.toContain('## Past Experiences');
    expect(output).not.toContain('## Behavioral Notes');
  });

  it('handles multiple entries in the same section', () => {
    const entries = [
      makeEntry({ id: 'mem_s1', type: 'semantic', content: 'First fact' }),
      makeEntry({ id: 'mem_s2', type: 'semantic', content: 'Second fact' }),
      makeEntry({ id: 'mem_s3', type: 'semantic', content: 'Third fact' }),
    ];

    const output = formatMemoriesForPrompt(entries);

    expect(output).toContain('- First fact');
    expect(output).toContain('- Second fact');
    expect(output).toContain('- Third fact');
    // Only one header
    expect(output.split('## Facts & Preferences')).toHaveLength(2);
  });
});
