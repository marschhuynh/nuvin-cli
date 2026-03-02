import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemoryEntryInput, MemoryScope, MemorySearchOptions, MemoryStorePort } from './types.js';

/**
 * JSON file-backed implementation of MemoryStorePort.
 *
 * Persists entries as a flat JSON array at `{dir}/memories.json`.
 * Lazy-loads from disk on first access; eagerly persists on every mutation.
 */
export class JsonFileMemoryStore implements MemoryStorePort {
  private entries: MemoryEntry[] = [];
  private initialized = false;
  private readonly filePath: string;

  constructor(dir: string) {
    // Resolve the file path synchronously — no IO yet
    this.filePath = `${dir}/memories.json`;
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.entries = await this.loadFromDisk();
    this.initialized = true;
  }

  private async loadFromDisk(): Promise<MemoryEntry[]> {
    try {
      const fs = await import('node:fs');
      if (!fs.existsSync(this.filePath)) return [];
      const text = fs.readFileSync(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(text);
      return Array.isArray(parsed) ? (parsed as MemoryEntry[]) : [];
    } catch {
      console.warn(`[JsonFileMemoryStore] Failed to load from ${this.filePath}`);
      return [];
    }
  }

  private async persist(): Promise<void> {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const dir = path.dirname(this.filePath);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[JsonFileMemoryStore] Failed to persist to ${this.filePath}`, err);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private now(): string {
    return new Date().toISOString();
  }

  private generateId(): string {
    return `mem_${randomUUID()}`;
  }

  // ── MemoryStorePort ────────────────────────────────────────────────────────

  async add(input: MemoryEntryInput): Promise<MemoryEntry> {
    await this.ensureInitialized();
    const timestamp = this.now();
    const topic = input.topic?.trim() || 'general-memory';
    const keywords = Array.isArray(input.keywords) ? input.keywords : input.tags;
    const entry: MemoryEntry = {
      ...input,
      topic,
      keywords: Array.isArray(keywords) ? keywords : [],
      id: this.generateId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      accessCount: 0,
      lastAccessedAt: timestamp,
    };
    this.entries.push(entry);
    await this.persist();
    return entry;
  }

  async update(
    id: string,
    updates: Partial<Pick<MemoryEntry, 'content' | 'tags'>>,
  ): Promise<MemoryEntry | null> {
    await this.ensureInitialized();
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return null;

    const existing = this.entries[index];
    const updated: MemoryEntry = {
      ...existing,
      ...(updates.content !== undefined && { content: updates.content }),
      ...(updates.tags !== undefined && { tags: updates.tags }),
      updatedAt: this.now(),
    };
    this.entries[index] = updated;
    await this.persist();
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;
    this.entries.splice(index, 1);
    await this.persist();
    return true;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    await this.ensureInitialized();
    return this.entries.find(e => e.id === id) ?? null;
  }

  async search(options: MemorySearchOptions = {}): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    let results = [...this.entries];

    if (options.type !== undefined) {
      results = results.filter(e => e.type === options.type);
    }
    if (options.scope !== undefined) {
      results = results.filter(e => e.scope === options.scope);
    }
    if (options.tags !== undefined && options.tags.length > 0) {
      const queryTags = options.tags;
      results = results.filter(e => queryTags.some(t => e.tags.includes(t)));
    }
    if (options.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async getAll(): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    return [...this.entries];
  }

  async recordAccess(id: string): Promise<void> {
    await this.ensureInitialized();
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return;

    this.entries[index] = {
      ...this.entries[index],
      accessCount: this.entries[index].accessCount + 1,
      lastAccessedAt: this.now(),
    };
    await this.persist();
  }

  async clear(scope?: MemoryScope): Promise<void> {
    await this.ensureInitialized();
    if (scope === undefined) {
      this.entries = [];
    } else {
      this.entries = this.entries.filter(e => e.scope !== scope);
    }
    await this.persist();
  }
}
