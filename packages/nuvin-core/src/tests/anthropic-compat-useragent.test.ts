import { describe, it, expect, vi } from 'vitest';
import { GenericAnthropicLLM } from '../llm-providers/llm-anthropic-compat.js';

describe('GenericAnthropicLLM User-Agent', () => {
  it('should include User-Agent header when version is provided', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'msg-123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Test response' }],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      } as Response),
    );

    global.fetch = mockFetch;

    const llm = new GenericAnthropicLLM('https://api.anthropic.com/v1', {
      apiKey: 'test-key',
      version: '1.2.3',
    });

    await llm.generateCompletion({
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 100,
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;

    expect(headers).toBeDefined();
    expect(headers['User-Agent']).toBe('nuvin-cli/1.2.3');
  });

  it('should not include User-Agent header when version is not provided', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'msg-123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Test response' }],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      } as Response),
    );

    global.fetch = mockFetch;

    const llm = new GenericAnthropicLLM('https://api.anthropic.com/v1', {
      apiKey: 'test-key',
    });

    await llm.generateCompletion({
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 100,
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;

    expect(headers).toBeDefined();
    expect(headers['User-Agent']).toBeUndefined();
  });
});
