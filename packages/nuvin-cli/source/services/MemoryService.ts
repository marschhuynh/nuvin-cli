import { JsonFileMemoryStore, rankMemories, formatMemoriesForPrompt } from '@nuvin/nuvin-core';
import type { MemoryEntry, MemoryScope, MemoryStorePort } from '@nuvin/nuvin-core';

// ── Config ─────────────────────────────────────────────────────────────────

interface MemoryServiceConfig {
  globalDir: string;
  projectDir?: string;
  maxInjectionTokens?: number;
}

// ── Service ────────────────────────────────────────────────────────────────

/**
 * Orchestrates dual-scope (global + project) memory across two JsonFileMemoryStore
 * instances. Global memories persist across all sessions; project memories are
 * scoped to the current working directory.
 *
 * Prompt injection selects a ranked subset of entries (by recency, frequency,
 * and type weight) and records access on every retrieved entry.
 */
export class MemoryService {
  private readonly globalStore: MemoryStorePort;
  private readonly projectStore: MemoryStorePort | null;
  private readonly maxInjectionTokens: number;

  constructor(config: MemoryServiceConfig) {
    this.globalStore = new JsonFileMemoryStore(config.globalDir);
    this.projectStore = config.projectDir ? new JsonFileMemoryStore(config.projectDir) : null;
    this.maxInjectionTokens = config.maxInjectionTokens ?? 2000;
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Persists a new memory entry. Project-scoped entries are routed to the
   * project store when one is configured; all others go to the global store.
   */
  async addMemory(
    input: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>,
  ): Promise<MemoryEntry> {
    const store = input.scope === 'project' && this.projectStore ? this.projectStore : this.globalStore;
    return store.add(input);
  }

  /**
   * Deletes an entry by id. Searches the global store first, then the project
   * store. Returns true if the entry was found and removed, false otherwise.
   */
  async deleteMemory(id: string): Promise<boolean> {
    const globalResult = await this.globalStore.delete(id);
    if (globalResult) return true;
    if (this.projectStore) {
      return this.projectStore.delete(id);
    }
    return false;
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Returns all entries from both stores, global entries first.
   */
  async getAllMemories(): Promise<MemoryEntry[]> {
    const global = await this.globalStore.getAll();
    const project = this.projectStore ? await this.projectStore.getAll() : [];
    return [...global, ...project];
  }

  /**
   * Builds a ranked, token-budget-aware markdown block ready for system prompt
   * injection. Entries are scored by recency, access frequency, and type weight.
   * Each selected entry has its accessCount incremented for future ranking.
   *
   * @param limit - Override the default entry limit derived from maxInjectionTokens.
   */
  async getMemoryPromptInjection(limit?: number): Promise<string> {
    const all = await this.getAllMemories();
    if (all.length === 0) return '';

    const maxEntries = limit ?? Math.floor(this.maxInjectionTokens / 25);
    const ranked = rankMemories(all, maxEntries);

    for (const entry of ranked) {
      const store = entry.scope === 'project' && this.projectStore ? this.projectStore : this.globalStore;
      await store.recordAccess(entry.id);
    }

    return formatMemoriesForPrompt(ranked);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Clears stored memories. When scope is omitted both stores are cleared.
   * When scope is 'global' only the global store is cleared.
   * When scope is 'project' only the project store is cleared (no-op if none configured).
   */
  async clearMemories(scope?: MemoryScope): Promise<void> {
    if (!scope || scope === 'global') {
      await this.globalStore.clear();
    }
    if ((!scope || scope === 'project') && this.projectStore) {
      await this.projectStore.clear();
    }
  }
}
