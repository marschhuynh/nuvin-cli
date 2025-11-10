import { describe, it, expect, vi } from 'vitest';
import { createLLM } from '../llm-providers/llm-factory.js';
import type { CompletionParams } from '../ports.js';

describe('Moonshot Usage Example', () => {
  it('should demonstrate basic usage', async () => {
    const llm = createLLM('moonshot', { apiKey: 'sk-test-key' });

    const mockTransport = {
      postJson: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '你好！我是 Moonshot AI。' } }],
          usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
        }),
      }),
      postStream: vi.fn(),
      get: vi.fn(),
    };

    (llm as any).transport = mockTransport;

    const params: CompletionParams = {
      model: 'moonshot-v1-8k',
      messages: [{ role: 'user', content: '你好' }],
      temperature: 0.7,
    };

    const result = await llm.generateCompletion(params);

    expect(result.content).toBe('你好！我是 Moonshot AI。');
    expect(mockTransport.postJson).toHaveBeenCalledWith(
      '/chat/completions',
      expect.objectContaining({
        model: 'moonshot-v1-8k',
        messages: [{ role: 'user', content: '你好' }],
        stream: false,
      }),
      undefined,
      undefined
    );
  });

  it('should demonstrate getModels usage', async () => {
    const llm = createLLM('moonshot', { apiKey: 'sk-test-key' });

    const mockTransport = {
      get: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'moonshot-v1-8k', object: 'model' },
            { id: 'moonshot-v1-32k', object: 'model' },
            { id: 'moonshot-v1-128k', object: 'model' },
          ],
        }),
      }),
      postJson: vi.fn(),
      postStream: vi.fn(),
    };

    vi.spyOn(llm as any, 'createTransport').mockReturnValue(mockTransport);

    if ('getModels' in llm && typeof llm.getModels === 'function') {
      const models = await llm.getModels();
      
      expect(models).toHaveLength(3);
      expect(models[0].id).toBe('moonshot-v1-8k');
      expect(models[1].id).toBe('moonshot-v1-32k');
      expect(models[2].id).toBe('moonshot-v1-128k');
      expect(mockTransport.get).toHaveBeenCalledWith('/models', undefined, undefined);
    }
  });
});
