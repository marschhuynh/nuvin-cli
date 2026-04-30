import type { MetadataPort, MemoryPort } from '../ports.js';

export class MemoryPortMetadataAdapter<T> implements MetadataPort<T> {
  constructor(
    private memory: MemoryPort<unknown>,
    private prefix: string = '__metadata__',
  ) {}

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<T | null> {
    const items = await this.memory.get(this.getKey(key));
    return items.length > 0 ? (items[0] as T) : null;
  }

  async set(key: string, metadata: T): Promise<void> {
    await this.memory.set(this.getKey(key), [metadata] as unknown[]);
  }

  async delete(key: string): Promise<void> {
    await this.memory.delete(this.getKey(key));
  }

  async keys(): Promise<string[]> {
    const allKeys = await this.memory.keys();
    return allKeys.filter((k) => k.startsWith(this.prefix)).map((k) => k.slice(this.prefix.length));
  }

  async clear(): Promise<void> {
    const metadataKeys = await this.keys();
    await Promise.all(metadataKeys.map((k) => this.delete(k)));
  }

  async exportSnapshot(): Promise<Record<string, T>> {
    const keys = await this.keys();
    const snapshot: Record<string, T> = {};

    for (const key of keys) {
      const metadata = await this.get(key);
      if (metadata !== null) {
        snapshot[key] = metadata;
      }
    }

    return snapshot;
  }

  async importSnapshot(snapshot: Record<string, T>): Promise<void> {
    for (const [key, metadata] of Object.entries(snapshot)) {
      await this.set(key, metadata);
    }
  }
}

export class InMemoryMetadata<T> implements MetadataPort<T> {
  private store = new Map<string, T>();

  async get(key: string): Promise<T | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, metadata: T): Promise<void> {
    this.store.set(key, metadata);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async exportSnapshot(): Promise<Record<string, T>> {
    const snapshot: Record<string, T> = {};
    for (const [k, v] of this.store.entries()) {
      snapshot[k] = v;
    }
    return snapshot;
  }

  async importSnapshot(snapshot: Record<string, T>): Promise<void> {
    this.store.clear();
    for (const [k, v] of Object.entries(snapshot)) {
      this.store.set(k, v);
    }
  }
}
