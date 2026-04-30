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

describe('AnthropicAISDKLLM - Context Window Token Counting Fix', () => {
  let llm: AnthropicAISDKLLM;

  beforeEach(() => {
    llm = new AnthropicAISDKLLM({ apiKey: 'test-key' });
  });

  it('should correctly calculate total input tokens from user example', async () => {
    const { generateText } = await import('ai');

    vi.mocked(generateText).mockResolvedValue({
      text: 'Response',
      toolCalls: [],
      usage: {
        inputTokens: 4,
        outputTokens: 119,
        cachedInputTokens: 4571,
      } as any,
      finishReason: 'stop',
    } as any);

    const params: CompletionParams = {
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: 'Large cached system prompt' },
        { role: 'user', content: 'Question' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    const result = await llm.generateCompletion(params);

    expect(result.usage?.prompt_tokens).toBe(4575);
    expect(result.usage?.completion_tokens).toBe(119);
    expect(result.usage?.total_tokens).toBe(4694);
    expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(4571);
  });

  it('should correctly calculate when cache_read_input_tokens is used', async () => {
    const { generateText } = await import('ai');

    vi.mocked(generateText).mockResolvedValue({
      text: 'Response',
      toolCalls: [],
      usage: {
        inputTokens: 20,
        outputTokens: 100,
        cachedInputTokens: 6278,
      } as any,
      finishReason: 'stop',
    } as any);

    const params: CompletionParams = {
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: 'Cached system prompt' },
        { role: 'user', content: 'Follow-up question' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    const result = await llm.generateCompletion(params);

    expect(result.usage?.prompt_tokens).toBe(6298);
    expect(result.usage?.completion_tokens).toBe(100);
    expect(result.usage?.total_tokens).toBe(6398);
    expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(6278);
  });
});
