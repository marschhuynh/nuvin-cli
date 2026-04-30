import type { ModelLimits, ModelInfo } from '@nuvin/nuvin-core';
import { getFallbackLimits } from '@nuvin/nuvin-core';

export class ModelLimitsCache {
  private cache: Map<string, ModelLimits> = new Map();
  private fetchPromises: Map<string, Promise<void>> = new Map();

  async getLimit(
    provider: string,
    model: string,
    fetchModels?: () => Promise<ModelInfo[] | undefined>,
  ): Promise<ModelLimits | null> {
    const key = `${provider}:${model}`;

    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    if (fetchModels) {
      const providerKey = provider;
      if (!this.fetchPromises.has(providerKey)) {
        const fetchPromise = this.fetchAndCacheModels(provider, fetchModels);
        this.fetchPromises.set(providerKey, fetchPromise);
      }

      try {
        await this.fetchPromises.get(providerKey);
        const fetched = this.cache.get(key);
        if (fetched) {
          return fetched;
        }
      } catch {
        // Fallback to static mapping on error
      }
    }

    const fallback = getFallbackLimits(provider, model);
    if (fallback) {
      this.cache.set(key, fallback);
    }
    return fallback;
  }

  private async fetchAndCacheModels(
    provider: string,
    fetchModels: () => Promise<ModelInfo[] | undefined>,
  ): Promise<void> {
    try {
      const models = await fetchModels();
      if (models) {
        for (const m of models) {
          if (m.limits) {
            this.cache.set(`${provider}:${m.id}`, m.limits);
          }
        }
      }
    } catch {
      // Silently fail, will fallback to static limits
    }
  }

  has(provider: string, model: string): boolean {
    return this.cache.has(`${provider}:${model}`);
  }

  set(provider: string, model: string, limits: ModelLimits): void {
    this.cache.set(`${provider}:${model}`, limits);
  }

  clear(): void {
    this.cache.clear();
    this.fetchPromises.clear();
  }
}

export const modelLimitsCache = new ModelLimitsCache();
