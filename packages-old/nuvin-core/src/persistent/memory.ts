import type { MemoryPort, MemoryPersistence, MemorySnapshot } from '../ports.js';

export class InMemoryMemory<T = unknown> implements MemoryPort<T> {
  private store = new Map<string, T[]>();

  async get(key: string): Promise<T[]> {
    return this.store.get(key) ?? [];
  }

  async set(key: string, items: T[]): Promise<void> {
    this.store.set(key, [...items]);
  }

  async append(key: string, items: T[]): Promise<void> {
    const existing = this.store.get(key) ?? [];
    this.store.set(key, [...existing, ...items]);
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

  async exportSnapshot(): Promise<MemorySnapshot<T>> {
    const snap: MemorySnapshot<T> = {};
    for (const [k, v] of this.store.entries()) snap[k] = [...v];
    return snap;
  }

  async importSnapshot(snapshot: MemorySnapshot<T>): Promise<void> {
    this.store.clear();
    for (const [k, v] of Object.entries(snapshot)) this.store.set(k, [...v]);
  }
}

export class JsonFileMemoryPersistence<T = unknown> implements MemoryPersistence<T> {
  constructor(private filename: string = 'history.json') {}

  async load(): Promise<MemorySnapshot<T>> {
    try {
      const fs = await import('node:fs');
      if (!fs.existsSync(this.filename)) return {};
      const text = fs.readFileSync(this.filename, 'utf-8');
      const data = JSON.parse(text);
      return typeof data === 'object' && data ? (data as MemorySnapshot<T>) : {};
    } catch {
      console.warn(`Failed to load memory from ${this.filename}`);
      return {};
    }
  }

  async save(snapshot: MemorySnapshot<T>): Promise<void> {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const dir = path.dirname(this.filename);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filename, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`Failed to save memory to ${this.filename}`, err);
      // ignore
    }
  }
}

export class PersistedMemory<T = unknown> implements MemoryPort<T> {
  private inner = new InMemoryMemory<T>();
  private initialized = false;

  constructor(private persistence: MemoryPersistence<T>) {}

  private async ensureInitialized() {
    if (this.initialized) return;
    const snap = await this.persistence.load();
    if (snap && typeof snap === 'object') await this.inner.importSnapshot(snap);
    this.initialized = true;
  }

  private async save() {
    const snap = await this.inner.exportSnapshot();
    await this.persistence.save(snap);
  }

  async get(key: string): Promise<T[]> {
    await this.ensureInitialized();
    return this.inner.get(key);
  }
  async set(key: string, items: T[]): Promise<void> {
    await this.ensureInitialized();
    await this.inner.set(key, items);
    await this.save();
  }
  async append(key: string, items: T[]): Promise<void> {
    await this.ensureInitialized();
    await this.inner.append(key, items);
    await this.save();
  }
  async delete(key: string): Promise<void> {
    await this.ensureInitialized();
    await this.inner.delete(key);
    await this.save();
  }
  async keys(): Promise<string[]> {
    await this.ensureInitialized();
    return this.inner.keys();
  }
  async clear(): Promise<void> {
    await this.ensureInitialized();
    await this.inner.clear();
    await this.save();
  }
  async exportSnapshot(): Promise<MemorySnapshot<T>> {
    await this.ensureInitialized();
    return this.inner.exportSnapshot();
  }
  async importSnapshot(snapshot: MemorySnapshot<T>): Promise<void> {
    await this.ensureInitialized();
    await this.inner.importSnapshot(snapshot);
    await this.save();
  }
}
