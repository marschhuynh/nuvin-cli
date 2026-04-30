import { describe, it, expect } from 'vitest';
import { createLLM, getAvailableProviders, supportsGetModels } from '../llm-providers/llm-factory.js';

describe('Moonshot Provider', () => {
  it('should be available in provider list', () => {
    const providers = getAvailableProviders();
    expect(providers).toContain('moonshot');
  });

  it('should support getModels', () => {
    expect(supportsGetModels('moonshot')).toBe(true);
  });

  it('should create Moonshot LLM instance', () => {
    const llm = createLLM('moonshot', { apiKey: 'test-key' });
    expect(llm).toBeDefined();
    expect(llm).toHaveProperty('generateCompletion');
    expect(llm).toHaveProperty('streamCompletion');
    expect(llm).toHaveProperty('getModels');
  });

  it('should use correct base URL', () => {
    const llm = createLLM('moonshot', { apiKey: 'test-key' });
    expect((llm as any).apiUrl).toBe('https://api.moonshot.ai/v1');
  });

  it('should support custom apiUrl', () => {
    const llm = createLLM('moonshot', { 
      apiKey: 'test-key',
      apiUrl: 'https://custom.moonshot.url/v1'
    });
    expect((llm as any).apiUrl).toBe('https://custom.moonshot.url/v1');
  });

  it('should not enable prompt caching by default', () => {
    const llm = createLLM('moonshot', { apiKey: 'test-key' });
    expect((llm as any).enablePromptCaching).toBe(false);
  });
});
