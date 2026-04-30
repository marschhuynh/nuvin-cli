import { describe, it, expect } from 'vitest';
import { createLLM, getAvailableProviders, supportsGetModels } from '../llm-providers/llm-factory.js';
import type { LLMPort } from '../ports.js';

describe('LLM Factory', () => {
  describe('getAvailableProviders', () => {
    it('should return list of available providers', () => {
      const providers = getAvailableProviders();
      expect(providers).toContain('deepinfra');
      expect(providers).toContain('openrouter');
      expect(providers).toContain('zai');
    });
  });

  describe('supportsGetModels', () => {
    it('should return true for providers that support getModels', () => {
      expect(supportsGetModels('deepinfra')).toBe(true);
      expect(supportsGetModels('openrouter')).toBe(true);
    });

    it('should return false for providers that do not support getModels', () => {
      expect(supportsGetModels('zai')).toBe(false);
    });
  });

  describe('createLLM', () => {
    it('should create LLM instance for deepinfra', () => {
      const llm = createLLM('deepinfra', { apiKey: 'test-key' });
      expect(llm).toBeDefined();
      expect(llm).toHaveProperty('generateCompletion');
      expect(llm).toHaveProperty('streamCompletion');
    });

    it('should create LLM instance for openrouter with prompt caching enabled', () => {
      const llm = createLLM('openrouter', { apiKey: 'test-key' });
      expect(llm).toBeDefined();
      expect((llm as any).enablePromptCaching).toBe(true);
    });

    it('should create LLM instance for zai', () => {
      const llm = createLLM('zai', { apiKey: 'test-key' });
      expect(llm).toBeDefined();
    });

    it('should throw error for unknown provider', () => {
      expect(() => createLLM('unknown', { apiKey: 'test-key' })).toThrow('Unknown LLM provider');
    });

    it('should support getModels for deepinfra', async () => {
      const llm = createLLM('deepinfra', { apiKey: 'test-key' });
      expect(llm).toHaveProperty('getModels');
    });

    it('should support custom apiUrl', () => {
      const llm = createLLM('deepinfra', { 
        apiKey: 'test-key',
        apiUrl: 'https://custom.api.url'
      });
      expect((llm as any).apiUrl).toBe('https://custom.api.url');
    });

    it('should override config options with provided options', () => {
      const llm = createLLM('openrouter', { 
        apiKey: 'test-key',
        enablePromptCaching: false
      });
      expect((llm as any).enablePromptCaching).toBe(false);
    });
  });
});
