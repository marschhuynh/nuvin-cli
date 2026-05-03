type CacheEntry = {
  content: string;
  result: string;
  timestamp: number;
};

class MarkdownCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxAge = 10 * 60 * 1000;
  private readonly maxSize = 1000;

  get(content: string, configHash: string): string | null {
    const key = this.generateKey(content, configHash);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    entry.timestamp = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  set(content: string, configHash: string, result: string): void {
    const key = this.generateKey(content, configHash);

    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      content,
      result,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private generateKey(content: string, configHash: string): string {
    let hash = 5381;
    for (let index = 0; index < content.length; index++) {
      hash = ((hash << 5) + hash) ^ content.charCodeAt(index);
      hash = hash >>> 0;
    }
    return `${configHash}:${content.length}:${hash}`;
  }
}

export const markdownCache = new MarkdownCache();
