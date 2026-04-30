import { describe, it, expect } from 'vitest';
import { createLLM, getAvailableProviders, supportsGetModels } from '../llm-providers/llm-factory.js';
import { GenericAnthropicLLM } from '../llm-providers/llm-anthropic-compat.js';

describe('MiniMax Provider', () => {
  it('should be available in provider list', () => {
    const providers = getAvailableProviders();
    expect(providers).toContain('minimax');
  });

  it('should support getModels', () => {
    expect(supportsGetModels('minimax')).toBe(true);
  });

  it('should create MiniMax LLM instance as GenericAnthropicLLM', () => {
    const llm = createLLM('minimax', { apiKey: 'test-key' });
    expect(llm).toBeDefined();
    expect(llm).toBeInstanceOf(GenericAnthropicLLM);
    expect(llm).toHaveProperty('generateCompletion');
    expect(llm).toHaveProperty('streamCompletion');
    expect(llm).toHaveProperty('getModels');
  });

  it('should use correct base URL', () => {
    const llm = createLLM('minimax', { apiKey: 'test-key' });
    expect((llm as any).apiUrl).toBe('https://api.minimax.io/anthropic/v1');
  });

  it('should support custom apiUrl', () => {
    const llm = createLLM('minimax', {
      apiKey: 'test-key',
      apiUrl: 'https://custom.minimax.url/v1'
    });
    expect((llm as any).apiUrl).toBe('https://custom.minimax.url/v1');
  });

  it('should not enable prompt caching by default', () => {
    const llm = createLLM('minimax', { apiKey: 'test-key' });
    expect((llm as any).enablePromptCaching).toBe(false);
  });

  it('should return models with limits from config', async () => {
    const llm = createLLM('minimax', { apiKey: 'test-key' });
    const models = await llm.getModels();

    expect(models.length).toBeGreaterThan(0);

    const m21 = models.find(m => m.id === 'MiniMax-M2.1');
    expect(m21).toBeDefined();
    expect(m21?.name).toBe('MiniMax M2.1');
    expect(m21?.limits?.contextWindow).toBe(200000);
    expect(m21?.limits?.maxOutput).toBe(16000);
  });
});
