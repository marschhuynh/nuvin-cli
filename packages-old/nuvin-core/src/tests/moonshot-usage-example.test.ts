import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { CompletionParams, LLMPort } from '../ports.js';

// Type for mocked HttpTransport where methods are vi.fn() mocks
type MockedHttpTransport = {
  post: Mock;
  get: Mock;
};

// Create a shared mock transport that we can configure per test
const mockTransport: MockedHttpTransport = {
  post: vi.fn(),
  get: vi.fn(),
};

// Mock the transports module
vi.mock('../transports/index.js', () => ({
  FetchTransport: vi.fn().mockImplementation(() => mockTransport),
  createTransport: vi.fn().mockImplementation(() => mockTransport),
  RetryTransport: vi.fn().mockImplementation((inner: unknown) => inner),
  LLMErrorTransport: vi.fn().mockImplementation((inner: unknown) => inner),
}));

import { createLLM } from '../llm-providers/llm-factory.js';

describe('Moonshot Usage Example', () => {
  let llm: LLMPort;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransport.post = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '你好！我是 Moonshot AI。' } }],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      }),
    });
    mockTransport.get = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'moonshot-v1-8k', object: 'model' },
          { id: 'moonshot-v1-32k', object: 'model' },
          { id: 'moonshot-v1-128k', object: 'model' },
        ],
      }),
    });
    llm = createLLM('moonshot', { apiKey: 'sk-test-key' });
  });

  it('should demonstrate basic usage', async () => {
    const params: CompletionParams = {
      model: 'moonshot-v1-8k',
      messages: [{ role: 'user', content: '你好' }],
      temperature: 0.7,
      topP: 1,
    };

    const result = await llm.generateCompletion(params);

    expect(result.content).toBe('你好！我是 Moonshot AI。');
    expect(mockTransport.post).toHaveBeenCalledWith(
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
