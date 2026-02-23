# Agent Memory System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a cross-session long-term memory system to Nuvin CLI so the agent remembers user preferences, project facts, and learned behaviors across conversations — without requiring vector databases or external services.

**Architecture:** A file-based memory store (`~/.nuvin/memory/`) separate from session history. Three memory types — semantic (facts/preferences), episodic (past experience summaries), and procedural (prompt refinements) — stored as JSON collections. Memories are extracted in the background after each conversation turn via a lightweight LLM call, and injected into the system prompt at the start of each turn. The agent also gets a `memory_save` tool for explicit hot-path memory creation. The system uses the existing `MemoryPort` pattern and config infrastructure.

**Tech Stack:** TypeScript, Vitest, `@nuvin/nuvin-core` MemoryPort, JSON file persistence, existing LLM providers.

---

## Research Summary

### The Problem

Today, Nuvin CLI has **short-term memory only** — conversation history within a single session. Each new session starts from zero. The agent doesn't remember:
- User preferences (coding style, preferred tools, naming conventions)
- Project facts (tech stack, architecture decisions, team conventions)
- What worked in past sessions (successful debugging approaches, deployment patterns)

The existing auto-summary feature compresses context within a session, but nothing persists *across* sessions as structured, retrievable knowledge.

### Industry Consensus on Memory Types

The field has converged on four memory types, drawn from the CoALA framework (Princeton, 2023) and validated by every major framework (LangChain, Letta/MemGPT, Mem0, OpenAI):

| Memory Type | What It Stores | Human Analogy | Nuvin Equivalent |
|---|---|---|---|
| **Working Memory** | Current conversation context | What you're thinking about right now | ✅ Already exists (session history + context window) |
| **Semantic Memory** | Facts, preferences, knowledge | Things you learned in school | ❌ **Needs implementation** |
| **Episodic Memory** | Past experiences, interaction logs | Remembering your first day at work | ❌ **Needs implementation** |
| **Procedural Memory** | Behavioral rules, system instructions | Knowing how to ride a bike | ❌ **Needs implementation** |

### Why Bigger Context Windows Don't Solve This

- **No persistence**: Close the session and everything is gone
- **No importance weighting**: Every token gets equal weight; no salience filtering
- **Performance degrades before limits**: Models become unreliable well before advertised context limits (Liu et al., "Lost in the Middle", 2023)
- **Cost scales linearly**: Paying per token for mostly irrelevant noise
- **No consolidation**: Raw contradictory inputs stored without deduplication or conflict resolution

### Storage Approaches in the Wild

| Approach | Used By | Pros | Cons |
|---|---|---|---|
| **Vector DB** | Mem0, LangChain | Semantic similarity search | Requires external service, heavy dependency |
| **Knowledge Graph** | Zep/Graphiti | Relationship-aware retrieval | Complex schema management |
| **Structured JSON** | Claude Code (CLAUDE.md), Cursor (memory banks) | Simple, portable, no dependencies | Limited to keyword/exact match |
| **Hybrid** | Production systems | Best of both worlds | Highest complexity |

### Design Decision: File-Based JSON Collections

For a CLI tool, the right trade-off is **structured JSON files** with optional semantic ranking via the existing LLM:

1. **Zero external dependencies** — No vector DB, no graph DB, no services to run
2. **Portable** — Memory files travel with the user's home directory
3. **Inspectable** — Users can read, edit, and delete memories directly
4. **Git-friendly** — Project-scoped memories can be committed to repos (like `.cursorrules`)
5. **LLM-as-ranker** — When memory collection grows large, use the LLM itself to rank relevance rather than embedding-based search

### Memory Formation Strategies

| Strategy | When | Pros | Cons |
|---|---|---|---|
| **Hot path** (agent decides) | During conversation via tool call | Immediate, transparent to user | Adds latency, agent must multitask |
| **Background** (post-turn extraction) | After each conversation turn | No latency hit, higher recall | Delayed availability |
| **Hybrid** | Both | Best coverage | Most complex |

**Our approach:** Hybrid — background extraction after each turn + explicit `memory_save` tool for the agent to save critical facts immediately.

### Memory Operations

Every memory system needs four operations:
1. **ADD** — Store a new fact
2. **UPDATE** — Modify existing memory when new info complements/corrects it
3. **DELETE** — Remove when contradicted or user requests
4. **SKIP** — Ignore irrelevant/duplicate information

### Memory Scoping

Memories should be scoped at two levels:
1. **Global** (`~/.nuvin/memory/`) — User preferences, general knowledge, cross-project facts
2. **Project** (`.nuvin/memory/`) — Project-specific facts, architecture, conventions, team preferences

Project memories override global memories when they conflict.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ System Prompt Construction                          │
│ ┌─────────────┐ ┌────────────┐ ┌─────────────────┐ │
│ │ Base Prompt  │ │ Memories   │ │ Session Context │ │
│ │ (agent       │ │ (injected  │ │ (conversation   │ │
│ │  template)   │ │  from store│ │  history)       │ │
│ └─────────────┘ └────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Memory Store (MemoryStore)                          │
│                                                     │
│  Global (~/.nuvin/memory/)                          │
│  ├── semantic.json   (facts, preferences)           │
│  ├── episodic.json   (experience summaries)         │
│  └── procedural.json (behavioral rules)             │
│                                                     │
│  Project (.nuvin/memory/)                           │
│  ├── semantic.json                                  │
│  ├── episodic.json                                  │
│  └── procedural.json                                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Memory Pipeline                                     │
│                                                     │
│  ┌──────────┐   ┌─────────────┐   ┌──────────────┐ │
│  │ Extract  │──▶│ Consolidate │──▶│ Persist      │ │
│  │ (LLM     │   │ (dedupe,    │   │ (write JSON) │ │
│  │  call)   │   │  merge,     │   │              │ │
│  │          │   │  conflict)  │   │              │ │
│  └──────────┘   └─────────────┘   └──────────────┘ │
└─────────────────────────────────────────────────────┘
```

### File Format

Each memory file is a JSON array of `MemoryEntry` objects:

```json
[
  {
    "id": "mem_abc123",
    "content": "User prefers 2-space indentation and single quotes in TypeScript",
    "type": "semantic",
    "scope": "global",
    "tags": ["preference", "typescript", "formatting"],
    "createdAt": "2026-02-20T10:30:00Z",
    "updatedAt": "2026-02-20T10:30:00Z",
    "accessCount": 3,
    "lastAccessedAt": "2026-02-23T14:00:00Z",
    "source": "extracted"
  }
]
```

### Memory Injection Budget

To avoid overwhelming the context window, memories are injected with a **token budget**:
- Default: 2000 tokens (~50-80 memories)
- Configurable via `memory.maxInjectionTokens` in config
- Memories ranked by: recency × access frequency × type weight
- Semantic memories weighted highest (0.6), episodic (0.3), procedural (0.1)

---

## Implementation Plan

### Task 1: Define Memory Types and MemoryStore Interface (nuvin-core)

**Files:**
- Create: `packages/nuvin-core/src/memory/types.ts`
- Create: `packages/nuvin-core/src/memory/memory-store.ts`
- Test: `packages/nuvin-core/tests/memory/memory-store.test.ts`

**Step 1: Create the memory types**

```typescript
// packages/nuvin-core/src/memory/types.ts

export type MemoryType = 'semantic' | 'episodic' | 'procedural';
export type MemoryScope = 'global' | 'project';
export type MemorySource = 'extracted' | 'explicit' | 'imported';

export interface MemoryEntry {
  id: string;
  content: string;
  type: MemoryType;
  scope: MemoryScope;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
  source: MemorySource;
}

export interface MemorySearchOptions {
  type?: MemoryType;
  scope?: MemoryScope;
  tags?: string[];
  limit?: number;
}

export interface MemoryStorePort {
  add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>): Promise<MemoryEntry>;
  update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'tags'>>): Promise<MemoryEntry | null>;
  delete(id: string): Promise<boolean>;
  get(id: string): Promise<MemoryEntry | null>;
  search(options?: MemorySearchOptions): Promise<MemoryEntry[]>;
  getAll(): Promise<MemoryEntry[]>;
  recordAccess(id: string): Promise<void>;
  clear(scope?: MemoryScope): Promise<void>;
}
```

**Step 2: Write failing tests for MemoryStore**

```typescript
// packages/nuvin-core/tests/memory/memory-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { JsonFileMemoryStore } from '../../src/memory/memory-store.js';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

describe('JsonFileMemoryStore', () => {
  let store: JsonFileMemoryStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nuvin-memory-test-'));
    store = new JsonFileMemoryStore(tempDir);
  });

  it('should add a memory entry', async () => {
    const entry = await store.add({
      content: 'User prefers TypeScript',
      type: 'semantic',
      scope: 'global',
      tags: ['preference', 'language'],
      source: 'extracted',
    });

    expect(entry.id).toMatch(/^mem_/);
    expect(entry.content).toBe('User prefers TypeScript');
    expect(entry.type).toBe('semantic');
    expect(entry.accessCount).toBe(0);
    expect(entry.createdAt).toBeDefined();
  });

  it('should persist and reload memories across instances', async () => {
    await store.add({
      content: 'User prefers dark mode',
      type: 'semantic',
      scope: 'global',
      tags: ['preference'],
      source: 'explicit',
    });

    const store2 = new JsonFileMemoryStore(tempDir);
    const all = await store2.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.content).toBe('User prefers dark mode');
  });

  it('should update a memory entry', async () => {
    const entry = await store.add({
      content: 'User likes Python',
      type: 'semantic',
      scope: 'global',
      tags: ['preference'],
      source: 'extracted',
    });

    const updated = await store.update(entry.id, { content: 'User prefers TypeScript over Python' });
    expect(updated?.content).toBe('User prefers TypeScript over Python');
    expect(updated?.updatedAt).not.toBe(entry.createdAt);
  });

  it('should delete a memory entry', async () => {
    const entry = await store.add({
      content: 'Temporary fact',
      type: 'semantic',
      scope: 'global',
      tags: [],
      source: 'extracted',
    });

    const deleted = await store.delete(entry.id);
    expect(deleted).toBe(true);

    const result = await store.get(entry.id);
    expect(result).toBeNull();
  });

  it('should search by type', async () => {
    await store.add({ content: 'Fact 1', type: 'semantic', scope: 'global', tags: [], source: 'extracted' });
    await store.add({ content: 'Experience 1', type: 'episodic', scope: 'global', tags: [], source: 'extracted' });
    await store.add({ content: 'Rule 1', type: 'procedural', scope: 'global', tags: [], source: 'extracted' });

    const semantic = await store.search({ type: 'semantic' });
    expect(semantic).toHaveLength(1);
    expect(semantic[0]!.content).toBe('Fact 1');
  });

  it('should search by tags', async () => {
    await store.add({ content: 'TS preference', type: 'semantic', scope: 'global', tags: ['typescript', 'preference'], source: 'extracted' });
    await store.add({ content: 'Python fact', type: 'semantic', scope: 'global', tags: ['python'], source: 'extracted' });

    const results = await store.search({ tags: ['typescript'] });
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe('TS preference');
  });

  it('should record access and update counts', async () => {
    const entry = await store.add({ content: 'A fact', type: 'semantic', scope: 'global', tags: [], source: 'extracted' });

    await store.recordAccess(entry.id);
    await store.recordAccess(entry.id);

    const updated = await store.get(entry.id);
    expect(updated?.accessCount).toBe(2);
    expect(updated?.lastAccessedAt).toBeDefined();
  });

  it('should respect search limit', async () => {
    for (let i = 0; i < 10; i++) {
      await store.add({ content: `Fact ${i}`, type: 'semantic', scope: 'global', tags: [], source: 'extracted' });
    }

    const results = await store.search({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('should clear memories by scope', async () => {
    await store.add({ content: 'Global fact', type: 'semantic', scope: 'global', tags: [], source: 'extracted' });
    await store.add({ content: 'Project fact', type: 'semantic', scope: 'project', tags: [], source: 'extracted' });

    await store.clear('global');

    const all = await store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.scope).toBe('project');
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `cd packages/nuvin-core && pnpm exec vitest run tests/memory/memory-store.test.ts`

Expected: FAIL — modules don't exist yet.

**Step 4: Implement JsonFileMemoryStore**

```typescript
// packages/nuvin-core/src/memory/memory-store.ts
import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemorySearchOptions, MemoryStorePort, MemoryScope } from './types.js';

export class JsonFileMemoryStore implements MemoryStorePort {
  private entries: MemoryEntry[] = [];
  private loaded = false;
  private filePath: string;

  constructor(private dir: string) {
    const path = require('node:path');
    this.filePath = path.join(dir, 'memories.json');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      this.filePath = path.join(this.dir, 'memories.json');
      if (fs.existsSync(this.filePath)) {
        const text = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(text);
        this.entries = Array.isArray(data) ? data : [];
      }
    } catch {
      this.entries = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
  }

  async add(input: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>): Promise<MemoryEntry> {
    await this.ensureLoaded();
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      ...input,
      id: `mem_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    };
    this.entries.push(entry);
    await this.persist();
    return entry;
  }

  async update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'tags'>>): Promise<MemoryEntry | null> {
    await this.ensureLoaded();
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    this.entries[idx] = {
      ...this.entries[idx]!,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.persist();
    return this.entries[idx]!;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    await this.persist();
    return true;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    await this.ensureLoaded();
    return this.entries.find((e) => e.id === id) ?? null;
  }

  async search(options: MemorySearchOptions = {}): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    let results = [...this.entries];

    if (options.type) {
      results = results.filter((e) => e.type === options.type);
    }
    if (options.scope) {
      results = results.filter((e) => e.scope === options.scope);
    }
    if (options.tags && options.tags.length > 0) {
      results = results.filter((e) => options.tags!.some((t) => e.tags.includes(t)));
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }
    return results;
  }

  async getAll(): Promise<MemoryEntry[]> {
    await this.ensureLoaded();
    return [...this.entries];
  }

  async recordAccess(id: string): Promise<void> {
    await this.ensureLoaded();
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      entry.accessCount += 1;
      entry.lastAccessedAt = new Date().toISOString();
      await this.persist();
    }
  }

  async clear(scope?: MemoryScope): Promise<void> {
    await this.ensureLoaded();
    if (scope) {
      this.entries = this.entries.filter((e) => e.scope !== scope);
    } else {
      this.entries = [];
    }
    await this.persist();
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/nuvin-core && pnpm exec vitest run tests/memory/memory-store.test.ts`

Expected: PASS

**Step 6: Export from package index**

Add to `packages/nuvin-core/src/index.ts`:
```typescript
export * from './memory/types.js';
export { JsonFileMemoryStore } from './memory/memory-store.js';
```

**Step 7: Commit**

```bash
git add packages/nuvin-core/src/memory/ packages/nuvin-core/tests/memory/
git commit -m "feat(core): add MemoryStore with JSON file persistence for long-term memory"
```

---

### Task 2: Implement Memory Ranking and Injection (nuvin-core)

**Files:**
- Create: `packages/nuvin-core/src/memory/memory-ranker.ts`
- Test: `packages/nuvin-core/tests/memory/memory-ranker.test.ts`

**Step 1: Write failing tests for memory ranking**

```typescript
// packages/nuvin-core/tests/memory/memory-ranker.test.ts
import { describe, it, expect } from 'vitest';
import { rankMemories, formatMemoriesForPrompt } from '../../src/memory/memory-ranker.js';
import type { MemoryEntry } from '../../src/memory/types.js';

function makeEntry(overrides: Partial<MemoryEntry> & { content: string }): MemoryEntry {
  const now = new Date().toISOString();
  return {
    id: `mem_${Math.random().toString(36).slice(2, 8)}`,
    type: 'semantic',
    scope: 'global',
    tags: [],
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    lastAccessedAt: now,
    source: 'extracted',
    ...overrides,
  };
}

describe('rankMemories', () => {
  it('should rank recently accessed memories higher', () => {
    const old = makeEntry({ content: 'Old fact', lastAccessedAt: '2026-01-01T00:00:00Z' });
    const recent = makeEntry({ content: 'Recent fact', lastAccessedAt: '2026-02-23T00:00:00Z' });

    const ranked = rankMemories([old, recent]);
    expect(ranked[0]!.content).toBe('Recent fact');
  });

  it('should rank frequently accessed memories higher', () => {
    const lowAccess = makeEntry({ content: 'Low access', accessCount: 1, lastAccessedAt: '2026-02-23T00:00:00Z' });
    const highAccess = makeEntry({ content: 'High access', accessCount: 50, lastAccessedAt: '2026-02-23T00:00:00Z' });

    const ranked = rankMemories([lowAccess, highAccess]);
    expect(ranked[0]!.content).toBe('High access');
  });

  it('should weight semantic memories higher than episodic', () => {
    const episodic = makeEntry({ content: 'An experience', type: 'episodic', accessCount: 10, lastAccessedAt: '2026-02-23T00:00:00Z' });
    const semantic = makeEntry({ content: 'A fact', type: 'semantic', accessCount: 10, lastAccessedAt: '2026-02-23T00:00:00Z' });

    const ranked = rankMemories([episodic, semantic]);
    expect(ranked[0]!.content).toBe('A fact');
  });

  it('should respect limit parameter', () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry({ content: `Fact ${i}` }));
    const ranked = rankMemories(entries, 5);
    expect(ranked).toHaveLength(5);
  });
});

describe('formatMemoriesForPrompt', () => {
  it('should format memories grouped by type', () => {
    const entries = [
      makeEntry({ content: 'User prefers dark mode', type: 'semantic' }),
      makeEntry({ content: 'Last session debugged auth module', type: 'episodic' }),
      makeEntry({ content: 'Always use concise responses', type: 'procedural' }),
    ];

    const result = formatMemoriesForPrompt(entries);
    expect(result).toContain('## Facts & Preferences');
    expect(result).toContain('User prefers dark mode');
    expect(result).toContain('## Past Experiences');
    expect(result).toContain('Last session debugged auth module');
    expect(result).toContain('## Behavioral Notes');
    expect(result).toContain('Always use concise responses');
  });

  it('should return empty string for empty memories', () => {
    expect(formatMemoriesForPrompt([])).toBe('');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/nuvin-core && pnpm exec vitest run tests/memory/memory-ranker.test.ts`

Expected: FAIL

**Step 3: Implement memory ranker**

```typescript
// packages/nuvin-core/src/memory/memory-ranker.ts
import type { MemoryEntry, MemoryType } from './types.js';

const TYPE_WEIGHTS: Record<MemoryType, number> = {
  semantic: 0.6,
  episodic: 0.3,
  procedural: 0.1,
};

const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function computeScore(entry: MemoryEntry): number {
  const now = Date.now();
  const lastAccess = new Date(entry.lastAccessedAt).getTime();
  const ageMs = Math.max(now - lastAccess, 1);

  const recencyScore = Math.exp(-ageMs / RECENCY_HALF_LIFE_MS);
  const frequencyScore = Math.log2(entry.accessCount + 1) / 10; // normalize
  const typeWeight = TYPE_WEIGHTS[entry.type] ?? 0.3;

  return (recencyScore * 0.5 + frequencyScore * 0.3 + typeWeight * 0.2);
}

export function rankMemories(entries: MemoryEntry[], limit?: number): MemoryEntry[] {
  const scored = entries.map((entry) => ({ entry, score: computeScore(entry) }));
  scored.sort((a, b) => b.score - a.score);

  const results = scored.map((s) => s.entry);
  return limit ? results.slice(0, limit) : results;
}

const SECTION_HEADERS: Record<MemoryType, string> = {
  semantic: '## Facts & Preferences',
  episodic: '## Past Experiences',
  procedural: '## Behavioral Notes',
};

const SECTION_ORDER: MemoryType[] = ['semantic', 'episodic', 'procedural'];

export function formatMemoriesForPrompt(entries: MemoryEntry[]): string {
  if (entries.length === 0) return '';

  const grouped = new Map<MemoryType, MemoryEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.type) ?? [];
    list.push(entry);
    grouped.set(entry.type, list);
  }

  const sections: string[] = [];
  for (const type of SECTION_ORDER) {
    const items = grouped.get(type);
    if (!items || items.length === 0) continue;

    const header = SECTION_HEADERS[type];
    const lines = items.map((e) => `- ${e.content}`).join('\n');
    sections.push(`${header}\n${lines}`);
  }

  return sections.join('\n\n');
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/nuvin-core && pnpm exec vitest run tests/memory/memory-ranker.test.ts`

Expected: PASS

**Step 5: Export from package**

Add to `packages/nuvin-core/src/index.ts`:
```typescript
export { rankMemories, formatMemoriesForPrompt } from './memory/memory-ranker.js';
```

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/memory/memory-ranker.ts packages/nuvin-core/tests/memory/memory-ranker.test.ts
git commit -m "feat(core): add memory ranking and prompt formatting for injection"
```

---

### Task 3: Implement Background Memory Extraction (nuvin-core)

**Files:**
- Create: `packages/nuvin-core/src/memory/memory-extractor.ts`
- Test: `packages/nuvin-core/tests/memory/memory-extractor.test.ts`

**Step 1: Write failing tests for memory extraction**

```typescript
// packages/nuvin-core/tests/memory/memory-extractor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MemoryExtractor } from '../../src/memory/memory-extractor.js';
import type { Message } from '../../src/ports.js';

describe('MemoryExtractor', () => {
  it('should build extraction prompt from messages', () => {
    const extractor = new MemoryExtractor();

    const messages: Message[] = [
      { id: '1', role: 'user', content: 'I prefer using Vitest over Jest for testing', timestamp: new Date().toISOString() },
      { id: '2', role: 'assistant', content: 'Noted! I\'ll use Vitest for any test files.', timestamp: new Date().toISOString() },
    ];

    const prompt = extractor.buildExtractionPrompt(messages);
    expect(prompt).toContain('Vitest');
    expect(prompt).toContain('semantic');
    expect(prompt).toContain('episodic');
    expect(prompt).toContain('procedural');
  });

  it('should parse extraction response into memory candidates', () => {
    const extractor = new MemoryExtractor();

    const llmResponse = JSON.stringify([
      { content: 'User prefers Vitest over Jest', type: 'semantic', tags: ['testing', 'preference'] },
      { content: 'Successfully configured Vitest in a TypeScript project', type: 'episodic', tags: ['testing', 'setup'] },
    ]);

    const candidates = extractor.parseExtractionResponse(llmResponse);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.content).toBe('User prefers Vitest over Jest');
    expect(candidates[0]!.type).toBe('semantic');
    expect(candidates[1]!.type).toBe('episodic');
  });

  it('should return empty array for unparseable response', () => {
    const extractor = new MemoryExtractor();
    const candidates = extractor.parseExtractionResponse('not json at all');
    expect(candidates).toEqual([]);
  });

  it('should return empty array for empty messages', () => {
    const extractor = new MemoryExtractor();
    const prompt = extractor.buildExtractionPrompt([]);
    expect(prompt).toBe('');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/nuvin-core && pnpm exec vitest run tests/memory/memory-extractor.test.ts`

Expected: FAIL

**Step 3: Implement MemoryExtractor**

```typescript
// packages/nuvin-core/src/memory/memory-extractor.ts
import type { Message } from '../ports.js';
import type { MemoryType } from './types.js';

export interface MemoryCandidate {
  content: string;
  type: MemoryType;
  tags: string[];
}

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system. Analyze the conversation and extract noteworthy information that should be remembered across sessions.

Extract memories in these categories:
- **semantic**: Facts, preferences, technical choices, project details, user characteristics
- **episodic**: Summaries of significant actions taken, problems solved, approaches that worked or failed
- **procedural**: Communication preferences, workflow rules, behavioral patterns learned from feedback

Rules:
- Only extract information worth remembering long-term
- Be concise — each memory should be one clear sentence
- Include relevant tags for categorization
- Skip small talk, transient reasoning, and one-time instructions
- If nothing is worth remembering, return an empty array

Respond with ONLY a JSON array:
[{"content": "...", "type": "semantic|episodic|procedural", "tags": ["..."]}]`;

export class MemoryExtractor {
  buildExtractionPrompt(messages: Message[]): string {
    if (messages.length === 0) return '';

    const conversationText = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n');

    return `${EXTRACTION_SYSTEM_PROMPT}\n\n---\nConversation:\n${conversationText}`;
  }

  parseExtractionResponse(response: string): MemoryCandidate[] {
    try {
      // Extract JSON array from response (may be wrapped in markdown code blocks)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (item: unknown): item is { content: string; type: string; tags: string[] } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as Record<string, unknown>).content === 'string' &&
            typeof (item as Record<string, unknown>).type === 'string' &&
            ['semantic', 'episodic', 'procedural'].includes((item as Record<string, unknown>).type as string),
        )
        .map((item) => ({
          content: item.content,
          type: item.type as MemoryType,
          tags: Array.isArray(item.tags) ? item.tags.filter((t: unknown) => typeof t === 'string') : [],
        }));
    } catch {
      return [];
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/nuvin-core && pnpm exec vitest run tests/memory/memory-extractor.test.ts`

Expected: PASS

**Step 5: Export from package**

Add to `packages/nuvin-core/src/index.ts`:
```typescript
export { MemoryExtractor } from './memory/memory-extractor.js';
export type { MemoryCandidate } from './memory/memory-extractor.js';
```

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/memory/memory-extractor.ts packages/nuvin-core/tests/memory/memory-extractor.test.ts
git commit -m "feat(core): add background memory extraction via LLM prompting"
```

---

### Task 4: Add Memory Config and CLI Config Integration

**Files:**
- Modify: `packages/nuvin-cli/source/config/types.ts`

**Step 1: Add memory settings to CLIConfig**

In `packages/nuvin-cli/source/config/types.ts`, add the `MemorySettings` interface and add it to `CLIConfig`:

```typescript
export interface MemorySettings {
  /** Enable/disable long-term memory (default: true) */
  enabled?: boolean;
  /** Maximum tokens to inject from memory into system prompt (default: 2000) */
  maxInjectionTokens?: number;
  /** Enable background memory extraction after each turn (default: true) */
  backgroundExtraction?: boolean;
  /** Enable the memory_save tool for explicit agent memory creation (default: true) */
  saveTool?: boolean;
}
```

Add to `CLIConfig`:
```typescript
export interface CLIConfig {
  // ... existing fields ...
  /** Long-term memory configuration */
  memory?: MemorySettings;
  // ...
}
```

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/config/types.ts
git commit -m "feat(cli): add memory settings to CLIConfig"
```

---

### Task 5: Create MemoryService in CLI (Orchestration Layer)

**Files:**
- Create: `packages/nuvin-cli/source/services/MemoryService.ts`
- Test: `packages/nuvin-cli/tests/memory-service.test.ts`

**Step 1: Write failing tests for MemoryService**

```typescript
// packages/nuvin-cli/tests/memory-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryService } from '../source/services/MemoryService.js';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

describe('MemoryService', () => {
  let service: MemoryService;
  let globalDir: string;
  let projectDir: string;

  beforeEach(() => {
    globalDir = mkdtempSync(join(tmpdir(), 'nuvin-mem-global-'));
    projectDir = mkdtempSync(join(tmpdir(), 'nuvin-mem-project-'));
    service = new MemoryService({ globalDir, projectDir });
  });

  it('should initialize with empty memory', async () => {
    const memories = await service.getAllMemories();
    expect(memories).toEqual([]);
  });

  it('should add global memory', async () => {
    await service.addMemory({
      content: 'User prefers 2-space indent',
      type: 'semantic',
      scope: 'global',
      tags: ['formatting'],
      source: 'extracted',
    });

    const memories = await service.getAllMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0]!.scope).toBe('global');
  });

  it('should add project memory', async () => {
    await service.addMemory({
      content: 'Project uses React 19',
      type: 'semantic',
      scope: 'project',
      tags: ['stack'],
      source: 'extracted',
    });

    const memories = await service.getAllMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0]!.scope).toBe('project');
  });

  it('should merge global and project memories', async () => {
    await service.addMemory({ content: 'Global fact', type: 'semantic', scope: 'global', tags: [], source: 'extracted' });
    await service.addMemory({ content: 'Project fact', type: 'semantic', scope: 'project', tags: [], source: 'extracted' });

    const all = await service.getAllMemories();
    expect(all).toHaveLength(2);
  });

  it('should generate formatted prompt injection', async () => {
    await service.addMemory({ content: 'User prefers dark mode', type: 'semantic', scope: 'global', tags: [], source: 'extracted' });
    await service.addMemory({ content: 'Fixed auth bug last session', type: 'episodic', scope: 'project', tags: [], source: 'extracted' });

    const prompt = await service.getMemoryPromptInjection();
    expect(prompt).toContain('User prefers dark mode');
    expect(prompt).toContain('Fixed auth bug last session');
  });

  it('should return empty prompt when no memories exist', async () => {
    const prompt = await service.getMemoryPromptInjection();
    expect(prompt).toBe('');
  });

  it('should delete a memory by id', async () => {
    const entry = await service.addMemory({
      content: 'Temporary',
      type: 'semantic',
      scope: 'global',
      tags: [],
      source: 'explicit',
    });

    await service.deleteMemory(entry.id);
    const all = await service.getAllMemories();
    expect(all).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/nuvin-cli && pnpm exec vitest run tests/memory-service.test.ts`

Expected: FAIL

**Step 3: Implement MemoryService**

```typescript
// packages/nuvin-cli/source/services/MemoryService.ts
import { JsonFileMemoryStore, rankMemories, formatMemoriesForPrompt } from '@nuvin/nuvin-core';
import type { MemoryEntry, MemoryScope, MemoryStorePort } from '@nuvin/nuvin-core';

interface MemoryServiceConfig {
  globalDir: string;
  projectDir?: string;
  maxInjectionTokens?: number;
}

export class MemoryService {
  private globalStore: MemoryStorePort;
  private projectStore: MemoryStorePort | null;
  private maxInjectionTokens: number;

  constructor(config: MemoryServiceConfig) {
    this.globalStore = new JsonFileMemoryStore(config.globalDir);
    this.projectStore = config.projectDir ? new JsonFileMemoryStore(config.projectDir) : null;
    this.maxInjectionTokens = config.maxInjectionTokens ?? 2000;
  }

  async addMemory(
    input: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>,
  ): Promise<MemoryEntry> {
    const store = input.scope === 'project' && this.projectStore ? this.projectStore : this.globalStore;
    return store.add(input);
  }

  async deleteMemory(id: string): Promise<boolean> {
    // Try both stores
    const globalResult = await this.globalStore.delete(id);
    if (globalResult) return true;
    if (this.projectStore) {
      return this.projectStore.delete(id);
    }
    return false;
  }

  async getAllMemories(): Promise<MemoryEntry[]> {
    const global = await this.globalStore.getAll();
    const project = this.projectStore ? await this.projectStore.getAll() : [];
    return [...global, ...project];
  }

  async getMemoryPromptInjection(limit?: number): Promise<string> {
    const all = await this.getAllMemories();
    if (all.length === 0) return '';

    const maxEntries = limit ?? Math.floor(this.maxInjectionTokens / 25); // ~25 tokens per memory
    const ranked = rankMemories(all, maxEntries);

    // Record access for injected memories
    for (const entry of ranked) {
      const store = entry.scope === 'project' && this.projectStore ? this.projectStore : this.globalStore;
      await store.recordAccess(entry.id);
    }

    return formatMemoriesForPrompt(ranked);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/nuvin-cli && pnpm exec vitest run tests/memory-service.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/services/MemoryService.ts packages/nuvin-cli/tests/memory-service.test.ts
git commit -m "feat(cli): add MemoryService for dual-scope memory management"
```

---

### Task 6: Integrate Memory Injection into OrchestratorManager

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`

This task wires the MemoryService into the orchestrator so memories are injected into the system prompt before each LLM call.

**Step 1: Add MemoryService initialization to OrchestratorManager**

In `OrchestratorManager.ts`, add a `memoryService` property and initialize it during `init()`:

```typescript
import { MemoryService } from './MemoryService.js';

// In the class:
private memoryService: MemoryService | null = null;

// In init() or initializePersistedSession(), after session directory is resolved:
private initializeMemoryService(config: CLIConfig): void {
  const memoryConfig = config.memory;
  if (memoryConfig?.enabled === false) return;

  const path = require('node:path');
  const homeDir = require('node:os').homedir();
  const profile = this.currentProfile ?? 'default';

  const globalDir = path.join(homeDir, `.nuvin${profile !== 'default' ? `-${profile}` : ''}`, 'memory');
  const projectDir = path.join(process.cwd(), '.nuvin', 'memory');

  this.memoryService = new MemoryService({
    globalDir,
    projectDir,
    maxInjectionTokens: memoryConfig?.maxInjectionTokens,
  });
}
```

**Step 2: Inject memories into system prompt**

Find where the system prompt / agent config is constructed before sending to the orchestrator. Add memory injection:

```typescript
// Before the orchestrator.send() call, augment the system prompt:
private async getMemoryAugmentedPrompt(basePrompt: string): Promise<string> {
  if (!this.memoryService) return basePrompt;

  const memoryBlock = await this.memoryService.getMemoryPromptInjection();
  if (!memoryBlock) return basePrompt;

  return `${basePrompt}\n\n## Long-Term Memory\nThe following information was remembered from previous sessions:\n\n${memoryBlock}`;
}
```

**Step 3: Wire into send() flow**

In the `send()` method, before calling `this.orchestrator.send()`, call `getMemoryAugmentedPrompt()` to modify the system prompt in the agent config overrides.

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "feat(cli): inject long-term memories into agent system prompt"
```

---

### Task 7: Implement Background Memory Extraction Post-Turn

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`

**Step 1: Add background extraction after each send()**

After a successful `send()` call and metadata update, trigger background memory extraction:

```typescript
private async extractMemoriesInBackground(
  conversationId: string,
  provider: string,
  model: string,
): Promise<void> {
  if (!this.memoryService) return;
  const config = this.getCurrentConfig();
  if (config.memory?.backgroundExtraction === false) return;

  try {
    // Get the last few messages from this turn (last user + assistant pair)
    const messages = await this.conversationStore?.getConversation(conversationId);
    if (!messages || messages.messages.length < 2) return;

    // Take the last 10 messages for context
    const recentMessages = messages.messages.slice(-10);

    const extractor = new MemoryExtractor();
    const prompt = extractor.buildExtractionPrompt(recentMessages);
    if (!prompt) return;

    // Use the small model for extraction (cheaper + faster)
    const smallModel = config.providers?.[provider]?.smallModel ?? model;
    const llm = this.llmFactory?.createLLM(provider, smallModel);
    if (!llm) return;

    const response = await llm.generateCompletion([
      { role: 'user', content: prompt },
    ]);

    const responseText = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const candidates = extractor.parseExtractionResponse(responseText);

    // Determine scope: if in a git repo or project dir, use project scope
    const scope: MemoryScope = config.memory?.defaultScope ?? 'global';

    for (const candidate of candidates) {
      await this.memoryService.addMemory({
        content: candidate.content,
        type: candidate.type,
        scope,
        tags: candidate.tags,
        source: 'extracted',
      });
    }
  } catch {
    // Background extraction should never break the main flow
  }
}
```

**Step 2: Call extraction after send() completes**

In `send()`, after the metadata update and context window check, add:

```typescript
// Fire and forget — don't block the response
this.extractMemoriesInBackground(conversationId, currentConfig.provider, currentConfig.model).catch(() => {});
```

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "feat(cli): add background memory extraction after each conversation turn"
```

---

### Task 8: Add `/memory` Slash Command

**Files:**
- Create: `packages/nuvin-cli/source/modules/commands/definitions/memory-command.ts`
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/index.ts`

**Step 1: Create the memory command**

```typescript
// packages/nuvin-cli/source/modules/commands/definitions/memory-command.ts
import type { FunctionCommand } from '../types.js';

export const memoryCommand: FunctionCommand = {
  id: '/memory',
  description: 'View, add, or clear long-term memories',
  type: 'function',
  usage: '/memory [list|add|clear|stats] [args]',
  handler: async (ctx) => {
    const { args, orchestratorManager } = ctx;
    const memoryService = orchestratorManager?.getMemoryService?.();

    if (!memoryService) {
      ctx.eventBus.emit('ui:line', { text: '⚠ Memory system is not enabled. Set memory.enabled: true in config.', type: 'warning' });
      return;
    }

    const [subcommand, ...rest] = (args ?? '').trim().split(/\s+/);

    switch (subcommand) {
      case 'list':
      case '': {
        const memories = await memoryService.getAllMemories();
        if (memories.length === 0) {
          ctx.eventBus.emit('ui:line', { text: 'No memories stored yet.', type: 'info' });
          return;
        }

        const grouped = { semantic: [] as string[], episodic: [] as string[], procedural: [] as string[] };
        for (const m of memories) {
          grouped[m.type].push(`  [${m.id}] ${m.content} (${m.scope}, accessed ${m.accessCount}x)`);
        }

        let output = `📝 Long-term memories (${memories.length} total):\n`;
        if (grouped.semantic.length) output += `\nFacts & Preferences:\n${grouped.semantic.join('\n')}`;
        if (grouped.episodic.length) output += `\nPast Experiences:\n${grouped.episodic.join('\n')}`;
        if (grouped.procedural.length) output += `\nBehavioral Notes:\n${grouped.procedural.join('\n')}`;

        ctx.eventBus.emit('ui:line', { text: output, type: 'info' });
        break;
      }

      case 'add': {
        const content = rest.join(' ');
        if (!content) {
          ctx.eventBus.emit('ui:line', { text: 'Usage: /memory add <content to remember>', type: 'warning' });
          return;
        }
        const entry = await memoryService.addMemory({
          content,
          type: 'semantic',
          scope: 'global',
          tags: [],
          source: 'explicit',
        });
        ctx.eventBus.emit('ui:line', { text: `✅ Memory saved: ${entry.id}`, type: 'info' });
        break;
      }

      case 'clear': {
        const scope = rest[0] as 'global' | 'project' | undefined;
        const memories = await memoryService.getAllMemories();
        const count = scope ? memories.filter((m) => m.scope === scope).length : memories.length;

        await memoryService.clearMemories(scope);
        ctx.eventBus.emit('ui:line', { text: `🗑 Cleared ${count} ${scope ?? 'all'} memories.`, type: 'info' });
        break;
      }

      case 'stats': {
        const memories = await memoryService.getAllMemories();
        const semantic = memories.filter((m) => m.type === 'semantic').length;
        const episodic = memories.filter((m) => m.type === 'episodic').length;
        const procedural = memories.filter((m) => m.type === 'procedural').length;
        const global = memories.filter((m) => m.scope === 'global').length;
        const project = memories.filter((m) => m.scope === 'project').length;

        ctx.eventBus.emit('ui:line', {
          text: `📊 Memory Stats:\n  Total: ${memories.length}\n  Semantic: ${semantic} | Episodic: ${episodic} | Procedural: ${procedural}\n  Global: ${global} | Project: ${project}`,
          type: 'info',
        });
        break;
      }

      default:
        ctx.eventBus.emit('ui:line', { text: 'Usage: /memory [list|add|clear|stats]', type: 'warning' });
    }
  },
};
```

**Step 2: Register in command definitions index**

In `packages/nuvin-cli/source/modules/commands/definitions/index.ts`, import and register:

```typescript
import { memoryCommand } from './memory-command.js';
// ... in the registration block:
registry.register(memoryCommand);
```

**Step 3: Add `getMemoryService()` accessor to OrchestratorManager**

```typescript
getMemoryService(): MemoryService | null {
  return this.memoryService;
}
```

**Step 4: Add `clearMemories` method to MemoryService**

```typescript
async clearMemories(scope?: MemoryScope): Promise<void> {
  if (!scope || scope === 'global') {
    await this.globalStore.clear();
  }
  if ((!scope || scope === 'project') && this.projectStore) {
    await this.projectStore.clear();
  }
}
```

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/modules/commands/definitions/memory-command.ts
git commit -m "feat(cli): add /memory slash command for viewing and managing memories"
```

---

### Task 9: Add `memory_save` Tool for Hot-Path Memory Creation

**Files:**
- Create: `packages/nuvin-core/src/tools/memory-save-tool.ts`
- Modify: `packages/nuvin-core/src/tools.ts` (register in ToolRegistry)

**Step 1: Implement the memory_save tool**

```typescript
// packages/nuvin-core/src/tools/memory-save-tool.ts
import type { ToolDefinition } from '../ports.js';

export const memorySaveToolDefinition: ToolDefinition = {
  name: 'memory_save',
  description:
    'Save important information to long-term memory so it persists across sessions. ' +
    'Use this to remember user preferences, project facts, coding conventions, or ' +
    'lessons learned. Memories are automatically categorized and will be available in future sessions.',
  parameters: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description: 'The information to remember. Should be a clear, concise statement of fact or preference.',
      },
      type: {
        type: 'string',
        enum: ['semantic', 'episodic', 'procedural'],
        description:
          'Memory type: "semantic" for facts/preferences, "episodic" for experience summaries, "procedural" for behavioral rules.',
      },
      scope: {
        type: 'string',
        enum: ['global', 'project'],
        description:
          'Memory scope: "global" for cross-project knowledge, "project" for project-specific facts.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization (e.g., ["typescript", "preference"]).',
      },
    },
    required: ['content', 'type', 'scope'],
  },
};

export interface MemorySaveToolInput {
  content: string;
  type: 'semantic' | 'episodic' | 'procedural';
  scope: 'global' | 'project';
  tags?: string[];
}
```

**Step 2: Register in ToolRegistry**

In `packages/nuvin-core/src/tools.ts`, add `memory_save` to the tool registry. The actual execution handler will be wired from the CLI layer via a callback (similar to how `assign_task` works via `setOrchestrator`).

Add a `setMemoryHandler` method:

```typescript
private memoryHandler: ((input: MemorySaveToolInput) => Promise<string>) | null = null;

setMemoryHandler(handler: (input: MemorySaveToolInput) => Promise<string>): void {
  this.memoryHandler = handler;
}
```

In the tool execution logic, handle `memory_save`:

```typescript
if (call.name === 'memory_save' && this.memoryHandler) {
  const result = await this.memoryHandler(call.arguments as MemorySaveToolInput);
  return { role: 'tool', content: result, tool_call_id: call.id, name: call.name };
}
```

**Step 3: Wire memory handler from OrchestratorManager**

In `OrchestratorManager.ts`, after creating the tool registry, set the memory handler:

```typescript
toolRegistry.setMemoryHandler(async (input) => {
  if (!this.memoryService) return 'Memory system is not enabled.';
  const entry = await this.memoryService.addMemory({
    content: input.content,
    type: input.type,
    scope: input.scope,
    tags: input.tags ?? [],
    source: 'explicit',
  });
  return `Memory saved with ID ${entry.id}: "${entry.content}"`;
});
```

**Step 4: Conditionally include tool based on config**

In `OrchestratorManager.ts`, when building the enabled tools list, conditionally include `memory_save`:

```typescript
if (config.memory?.saveTool !== false && config.memory?.enabled !== false) {
  enabledTools.push('memory_save');
}
```

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/tools/memory-save-tool.ts packages/nuvin-core/src/tools.ts
git commit -m "feat(core): add memory_save tool for explicit hot-path memory creation"
```

---

### Task 10: Add Memory Instructions to Agent System Prompt

**Files:**
- Modify: Agent template/system prompt in `packages/nuvin-core/` (wherever the base system prompt is defined)

**Step 1: Add memory usage instructions to the agent's system prompt**

Add a section that instructs the agent on when and how to use the `memory_save` tool:

```
## Long-Term Memory

You have access to a long-term memory system that persists across sessions.

**Reading memories:** Relevant memories from previous sessions are automatically included above under "Long-Term Memory". Use them to provide continuity.

**Saving memories:** Use the `memory_save` tool to explicitly save important information:
- User preferences (coding style, tool choices, communication preferences)
- Project facts (tech stack, architecture decisions, conventions)
- Lessons learned (debugging approaches that worked, common pitfalls)

**When to save:**
- When the user explicitly states a preference or convention
- When you discover a project-specific pattern (e.g., naming conventions, file structure)
- When a debugging approach successfully resolves an issue
- When the user corrects your behavior (save as procedural memory)

**When NOT to save:**
- Transient task details (one-time file edits, temporary variables)
- Information already in the project's README, config files, or documentation
- Duplicate facts already in your memory
```

**Step 2: Commit**

```bash
git commit -m "feat(core): add memory usage instructions to agent system prompt"
```

---

### Task 11: Full Integration Test and Verification

**Files:**
- No new files — verification only

**Step 1: Build core package**

Run: `cd packages/nuvin-core && pnpm build`

Expected: BUILD SUCCESS

**Step 2: Build CLI package**

Run: `cd packages/nuvin-cli && pnpm build`

Expected: BUILD SUCCESS (or `SKIP_TYPE_CHECK=1 pnpm build`)

**Step 3: Run core tests**

Run: `cd packages/nuvin-core && pnpm test`

Expected: All tests PASS

**Step 4: Run CLI tests**

Run: `cd packages/nuvin-cli && pnpm test`

Expected: All tests PASS

**Step 5: LSP diagnostics on modified files**

Check for type errors in all modified/created files.

**Step 6: Smoke test with dev CLI**

Run: `pnpm run:dev`

Manual checks:
1. Start a session, mention a preference ("I prefer Vitest over Jest")
2. End the session
3. Run `/memory list` — verify extraction occurred
4. Start a new session — verify memory is injected into system prompt
5. Run `/memory stats` — verify counts
6. Run `/memory add "Always use pnpm"` — verify explicit save
7. Run `/memory clear project` — verify scoped clear

**Step 7: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete long-term memory system integration"
```

---

## Future Enhancements (Out of Scope)

These are documented for future consideration but are **not part of this plan**:

1. **Memory Consolidation** — Periodically merge similar memories, resolve contradictions, and prune stale entries via an LLM pass (sleep-time computation pattern)
2. **Semantic Search** — Use embeddings for similarity-based memory retrieval instead of LLM-as-ranker (requires embedding model dependency)
3. **Memory Import/Export** — Export memories as YAML/JSON for sharing across machines or teams
4. **Memory Visualization** — TUI component showing memory graph with access patterns
5. **Selective Forgetting** — Decay function that gradually reduces salience of unused memories
6. **Team Memories** — Shared memory files committed to git repos (like `.cursorrules`)
7. **Memory Conflict Resolution** — When new facts contradict existing memories, use LLM to resolve
8. **Per-Agent Memory** — Sub-agents maintaining their own long-term memory scopes
