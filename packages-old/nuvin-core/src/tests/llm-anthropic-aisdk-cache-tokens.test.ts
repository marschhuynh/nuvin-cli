import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicAISDKLLM } from '../llm-providers/llm-anthropic-aisdk.js';
import type { CompletionParams } from '../ports.js';

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn()),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  jsonSchema: vi.fn((params) => params),
  APICallError: {
    isInstance: vi.fn(() => false),
  },
}));

describe('AnthropicAISDKLLM Cache Token Mapping', () => {
  let llm: AnthropicAISDKLLM;

  beforeEach(() => {
    llm = new AnthropicAISDKLLM({ apiKey: 'test-key' });
  });

  it('should calculate prompt_tokens as inputTokens + cachedInputTokens in non-streaming', async () => {
    const { generateText } = await import('ai');

    vi.mocked(generateText).mockResolvedValue({
      text: 'Response',
      toolCalls: [],
      usage: {
        inputTokens: 200,
        outputTokens: 50,
        cachedInputTokens: 150,
      } as any,
      finishReason: 'stop',
    } as any);

    const params: CompletionParams = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'system', content: 'System with cache' },
        { role: 'user', content: 'Question' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    const result = await llm.generateCompletion(params);

    expect(result.usage).toMatchObject({
      prompt_tokens: 350,
      completion_tokens: 50,
      total_tokens: 400,
      prompt_tokens_details: {
        cached_tokens: 150,
      },
    });
  });

  it('should calculate prompt_tokens as inputTokens + cachedInputTokens in streaming', async () => {
    const { streamText } = await import('ai');

    const mockTextStream = (async function* () {
      yield 'Response';
    })();

    vi.mocked(streamText).mockReturnValue({
      textStream: mockTextStream,
      toolCalls: Promise.resolve([]),
      usage: Promise.resolve({
        inputTokens: 200,
        outputTokens: 50,
        cachedInputTokens: 150,
      } as any),
      finishReason: Promise.resolve('stop'),
    } as any);

    const params: CompletionParams = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'system', content: 'System with cache' },
        { role: 'user', content: 'Question' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    const onStreamFinish = vi.fn();
    const result = await llm.streamCompletion(params, { onStreamFinish });

    expect(result.usage).toMatchObject({
      prompt_tokens: 350,
      completion_tokens: 50,
      total_tokens: 400,
      prompt_tokens_details: {
        cached_tokens: 150,
      },
    });

    expect(onStreamFinish).toHaveBeenCalledWith(
      'stop',
      expect.objectContaining({
        prompt_tokens: 350,
        completion_tokens: 50,
        total_tokens: 400,
        prompt_tokens_details: {
          cached_tokens: 150,
        },
      }),
    );
  });

  it('should handle zero cached tokens', async () => {
    const { generateText } = await import('ai');

    vi.mocked(generateText).mockResolvedValue({
      text: 'Response',
      toolCalls: [],
      usage: {
        inputTokens: 200,
        outputTokens: 50,
        cachedInputTokens: 0,
      } as any,
      finishReason: 'stop',
    } as any);

    const params: CompletionParams = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Question' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    const result = await llm.generateCompletion(params);

    expect(result.usage).toMatchObject({
      prompt_tokens: 200,
      completion_tokens: 50,
      total_tokens: 250,
      prompt_tokens_details: {
        cached_tokens: 0,
      },
    });
  });

  it('should handle missing cachedInputTokens field', async () => {
    const { generateText } = await import('ai');

    vi.mocked(generateText).mockResolvedValue({
      text: 'Response',
      toolCalls: [],
      usage: {
        inputTokens: 200,
        outputTokens: 50,
      } as any,
      finishReason: 'stop',
    } as any);

    const params: CompletionParams = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Question' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    const result = await llm.generateCompletion(params);

    expect(result.usage).toMatchObject({
      prompt_tokens: 200,
      completion_tokens: 50,
      total_tokens: 250,
      prompt_tokens_details: {
        cached_tokens: 0,
      },
    });
  });
});
