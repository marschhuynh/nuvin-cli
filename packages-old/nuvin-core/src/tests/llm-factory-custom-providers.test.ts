import { describe, it, expect } from 'vitest';
import {
  createLLM,
  getAvailableProviders,
  supportsGetModels,
  type CustomProviderDefinition,
} from '../llm-providers/llm-factory.js';

describe('LLM Factory - Custom Providers', () => {
  const customProviders: Record<string, CustomProviderDefinition> = {
    'custom-provider': {
      type: 'openai-compat',
      baseUrl: 'https://custom.ai/v1',
      models: ['model-1', 'model-2', 'model-3'],
    },
    'custom-with-endpoint': {
      type: 'openai-compat',
      baseUrl: 'https://endpoint.ai/api',
      models: '/custom/models',
    },
    'custom-with-objects': {
      type: 'openai-compat',
      baseUrl: 'https://objects.ai/v1',
      models: [
        { id: 'model-a', name: 'Model A', context_length: 128000 },
        { id: 'model-b', name: 'Model B', context_length: 200000 },
      ],
    },
    'custom-no-models': {
      type: 'openai-compat',
      baseUrl: 'https://nomodels.ai/v1',
      models: false,
    },
  };

  describe('getAvailableProviders', () => {
    it('should return built-in providers when no custom providers', () => {
      const providers = getAvailableProviders();
      expect(providers).toContain('deepinfra');
      expect(providers).toContain('openrouter');
      expect(providers).toContain('zai');
      expect(providers).toContain('moonshot');
    });

    it('should include custom providers in available list', () => {
      const providers = getAvailableProviders(customProviders);
      expect(providers).toContain('deepinfra');
      expect(providers).toContain('custom-provider');
      expect(providers).toContain('custom-with-endpoint');
      expect(providers).toContain('custom-with-objects');
      expect(providers).toContain('custom-no-models');
    });

    it('should override built-in provider with custom one', () => {
      const overrideProviders: Record<string, CustomProviderDefinition> = {
        openrouter: {
          type: 'openai-compat',
          baseUrl: 'https://custom-openrouter.ai/v1',
          models: true,
        },
      };
      const providers = getAvailableProviders(overrideProviders);
      expect(providers).toContain('openrouter');
    });
  });

  describe('supportsGetModels', () => {
    it('should return true for custom provider with model list', () => {
      expect(supportsGetModels('custom-provider', customProviders)).toBe(true);
    });

    it('should return true for custom provider with endpoint', () => {
      expect(supportsGetModels('custom-with-endpoint', customProviders)).toBe(true);
    });

    it('should return true for custom provider with model objects', () => {
      expect(supportsGetModels('custom-with-objects', customProviders)).toBe(true);
    });

    it('should return false for custom provider with models=false', () => {
      expect(supportsGetModels('custom-no-models', customProviders)).toBe(false);
    });

    it('should return false for unknown provider', () => {
      expect(supportsGetModels('unknown-provider', customProviders)).toBe(false);
    });
  });

  describe('createLLM', () => {
    it('should create LLM instance for custom provider', () => {
      const llm = createLLM('custom-provider', { apiKey: 'test-key' }, customProviders);
      expect(llm).toBeDefined();
      expect(llm).toHaveProperty('generateCompletion');
      expect(llm).toHaveProperty('streamCompletion');
      expect(llm).toHaveProperty('getModels');
    });

    it('should create LLM with correct baseUrl', () => {
      const llm = createLLM('custom-provider', { apiKey: 'test-key' }, customProviders);
      expect((llm as any).apiUrl).toBe('https://custom.ai/v1');
    });

    it('should create LLM for custom provider without model support', () => {
      const llm = createLLM('custom-no-models', { apiKey: 'test-key' }, customProviders);
      expect(llm).toBeDefined();
    });

    it('should throw error for unknown provider', () => {
      expect(() => createLLM('unknown', { apiKey: 'test-key' }, customProviders)).toThrow('Unknown LLM provider');
    });

    it('should prefer custom provider over built-in with same name', () => {
      const overrideProviders: Record<string, CustomProviderDefinition> = {
        openrouter: {
          type: 'openai-compat',
          baseUrl: 'https://custom-openrouter.ai/v1',
          models: ['custom-model'],
        },
      };
      const llm = createLLM('openrouter', { apiKey: 'test-key' }, overrideProviders);
      expect((llm as any).apiUrl).toBe('https://custom-openrouter.ai/v1');
    });

    it('should still create built-in providers when custom providers exist', () => {
      const llm = createLLM('deepinfra', { apiKey: 'test-key' }, customProviders);
      expect(llm).toBeDefined();
      expect((llm as any).apiUrl).toBe('https://api.deepinfra.com/v1/openai');
    });

    it('should skip custom provider without baseUrl', () => {
      const invalidProviders: Record<string, CustomProviderDefinition> = {
        'invalid-provider': {
          type: 'openai-compat',
          models: ['model-1'],
        } as CustomProviderDefinition,
      };
      const providers = getAvailableProviders(invalidProviders);
      expect(providers).not.toContain('invalid-provider');
    });
  });

  describe('getModels with custom providers', () => {
    it('should return pre-defined model list', async () => {
      const llm = createLLM('custom-provider', { apiKey: 'test-key' }, customProviders);
      const models = await llm.getModels();
      expect(models).toHaveLength(3);
      expect(models[0]).toEqual({ id: 'model-1', name: 'model-1' });
      expect(models[1]).toEqual({ id: 'model-2', name: 'model-2' });
      expect(models[2]).toEqual({ id: 'model-3', name: 'model-3' });
    });

    it('should return model objects with normalized limits when configured', async () => {
      const llm = createLLM('custom-with-objects', { apiKey: 'test-key' }, customProviders);
      const models = await llm.getModels();
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({ id: 'model-a', name: 'Model A', limits: { contextWindow: 128000 } });
      expect(models[1]).toEqual({ id: 'model-b', name: 'Model B', limits: { contextWindow: 200000 } });
    });

    it('should throw error when models=false', async () => {
      const llm = createLLM('custom-no-models', { apiKey: 'test-key' }, customProviders);
      await expect(llm.getModels()).rejects.toThrow('Provider does not support getModels');
    });

    it('should deduplicate models with the same ID in custom array', async () => {
      const providersWithDuplicates: Record<string, CustomProviderDefinition> = {
        'custom-with-dupes': {
          type: 'openai-compat',
          baseUrl: 'https://dupes.ai/v1',
          models: [
            { id: 'model-a', name: 'Model A', context_length: 128000 },
            { id: 'model-b', name: 'Model B', context_length: 200000 },
            { id: 'model-a', name: 'Model A Duplicate', context_length: 64000 },
          ],
        },
      };

      const llm = createLLM('custom-with-dupes', { apiKey: 'test-key' }, providersWithDuplicates);
      const models = await llm.getModels();

      expect(models).toHaveLength(2);
      const modelIds = models.map((m) => m.id);
      expect(modelIds).toEqual(['model-a', 'model-b']);
      expect(new Set(modelIds).size).toBe(2);

      const modelA = models.find((m) => m.id === 'model-a');
      expect(modelA?.name).toBe('Model A');
      expect(modelA?.limits?.contextWindow).toBe(128000);
    });

    it('should support explicit limits object in model config', async () => {
      const providersWithExplicitLimits: Record<string, CustomProviderDefinition> = {
        'custom-explicit-limits': {
          type: 'openai-compat',
          baseUrl: 'https://explicit-limits.ai/v1',
          models: [
            {
              id: 'model-x',
              name: 'Model X',
              limits: { contextWindow: 200000, maxOutput: 16000 },
            },
            {
              id: 'model-y',
              name: 'Model Y',
              limits: { contextWindow: 128000 },
            },
          ],
        },
      };

      const llm = createLLM('custom-explicit-limits', { apiKey: 'test-key' }, providersWithExplicitLimits);
      const models = await llm.getModels();

      expect(models).toHaveLength(2);

      const modelX = models.find((m) => m.id === 'model-x');
      expect(modelX?.name).toBe('Model X');
      expect(modelX?.limits?.contextWindow).toBe(200000);
      expect(modelX?.limits?.maxOutput).toBe(16000);

      const modelY = models.find((m) => m.id === 'model-y');
      expect(modelY?.name).toBe('Model Y');
      expect(modelY?.limits?.contextWindow).toBe(128000);
      expect(modelY?.limits?.maxOutput).toBeUndefined();
    });
  });
});
