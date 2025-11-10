import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLLM } from '../llm-providers/llm-factory.js';
import type { CompletionParams } from '../ports.js';

describe('OpenRouterLLM Usage Tracking', () => {
  let llm: any;
  let mockTransport: any;

  beforeEach(() => {
    mockTransport = {
      postJson: vi.fn().mockResolvedValue({
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
      }),
      postStream: vi.fn(),
    };

    llm = createLLM('openrouter', { apiKey: 'test-key' });
    (llm as any).transport = mockTransport;
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

    const sentBody = mockTransport.postJson.mock.calls[0][1];
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
    (llm as any).transport = mockTransport;

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

    const sentBody = mockTransport.postJson.mock.calls[0][1];
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

    const sentBody = mockTransport.postJson.mock.calls[0][1];
    expect(sentBody.usage).toEqual({ include: false });
  });

  it('should include usage in streaming requests', async () => {
    mockTransport.postStream = vi.fn().mockResolvedValue({
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

    const sentBody = mockTransport.postStream.mock.calls[0][1];
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
