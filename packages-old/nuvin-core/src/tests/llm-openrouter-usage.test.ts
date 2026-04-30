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

describe('OpenRouterLLM Usage Tracking', () => {
  let llm: LLMPort;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransport.post = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'test response' } }],
        usage: {
          prompt_tokens: 194,
          completion_tokens: 2,
          total_tokens: 196,
          prompt_tokens_details: {
            cached_tokens: 150,
            audio_tokens: 0,
          },
          completion_tokens_details: {
            reasoning_tokens: 0,
          },
          cost: 0.95,
          cost_details: {
            upstream_inference_cost: 19,
          },
        },
      }),
    });
    mockTransport.get = vi.fn();
    llm = createLLM('openrouter', { apiKey: 'test-key' });
  });

  it('should automatically include usage: {include: true} by default', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];
    expect(sentBody.usage).toEqual({ include: true });
  });

  it('should return detailed usage information including cached tokens', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    const result = await llm.generateCompletion(params);

    expect(result.usage).toBeDefined();
    expect(result.usage?.prompt_tokens).toBe(194);
    expect(result.usage?.completion_tokens).toBe(2);
    expect(result.usage?.total_tokens).toBe(196);
    expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(150);
    expect(result.usage?.cost).toBe(0.95);
  });

  it('should respect includeUsage: false option', async () => {
    llm = createLLM('openrouter', { apiKey: 'test-key', includeUsage: false });

    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];
    expect(sentBody.usage).toBeUndefined();
  });

  it('should not override explicit usage parameter', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User' },
      ],
      temperature: 0.7,
      topP: 1,
      usage: { include: false },
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];
    expect(sentBody.usage).toEqual({ include: false });
  });

  it('should include usage in streaming requests', async () => {
    mockTransport.post = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"test"}}]}\n\n'),
              done: false,
            })
            .mockResolvedValueOnce({
              value: new TextEncoder().encode(
                'data: {"usage":{"prompt_tokens":194,"completion_tokens":2,"total_tokens":196,"prompt_tokens_details":{"cached_tokens":150}}}\n\n',
              ),
              done: false,
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      },
    });

    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    const result = await llm.streamCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];
    expect(sentBody.usage).toEqual({ include: true });

    expect(result.usage?.prompt_tokens).toBe(194);
    expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(150);
  });

  it('should show cache savings in usage response', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'Large system context that will be cached' },
        { role: 'user', content: 'Question' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    const result = await llm.generateCompletion(params);

    expect(result.usage?.prompt_tokens_details?.cached_tokens).toBeGreaterThan(0);
  });
});
