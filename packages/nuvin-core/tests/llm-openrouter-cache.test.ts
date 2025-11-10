import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLLM } from '../llm-providers/llm-factory.js';
import type { CompletionParams } from '../ports.js';

describe('OpenRouterLLM Prompt Caching', () => {
  let llm: any;
  let mockTransport: any;

  beforeEach(() => {
    mockTransport = {
      postJson: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test response' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      }),
      postStream: vi.fn(),
    };

    llm = createLLM('openrouter', { apiKey: 'test-key' });
    (llm as any).transport = mockTransport;
  });

  it('should add cache_control to last content part of first 2 system messages', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'You are a helpful assistant.' },
            { type: 'text', text: 'Follow these guidelines...' },
          ],
        },
        {
          role: 'system',
          content: [{ type: 'text', text: 'Additional context here.' }],
        },
        {
          role: 'system',
          content: [{ type: 'text', text: 'Third system message (no cache).' }],
        },
        { role: 'user', content: 'Hello' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];

    expect(sentBody.messages[0].content[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[2].content[0].cache_control).toBeUndefined();
  });

  it('should add cache_control to last 2 user/assistant messages', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: [{ type: 'text', text: 'First user message' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'First assistant response' }] },
        { role: 'user', content: [{ type: 'text', text: 'Second user message' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Second assistant response' }] },
        { role: 'user', content: [{ type: 'text', text: 'Third user message' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];
    const messages = sentBody.messages;

    expect(messages[1].content[0].cache_control).toBeUndefined();
    expect(messages[2].content[0].cache_control).toBeUndefined();
    expect(messages[3].content[0].cache_control).toBeUndefined();

    expect(messages[4].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(messages[5].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('should handle single user message caching', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: [{ type: 'text', text: 'Only user message' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];

    expect(sentBody.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('should respect enablePromptCaching: false', async () => {
    llm = createLLM('openrouter', { apiKey: 'test-key', enablePromptCaching: false });
    (llm as any).transport = mockTransport;

    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        {
          role: 'system',
          content: [{ type: 'text', text: 'System prompt' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'User message' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];

    expect(sentBody.messages[0].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[1].content[0].cache_control).toBeUndefined();
  });

  it('should handle string content without crashing', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System prompt as string' },
        { role: 'user', content: 'User message as string' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await expect(llm.generateCompletion(params)).resolves.toBeDefined();
  });

  it('should work with Gemini models using cache_control', async () => {
    const params: CompletionParams = {
      model: 'google/gemini-2.5-pro',
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'You are a historian.' },
            { type: 'text', text: 'HUGE TEXT BODY HERE' },
          ],
        },
        { role: 'user', content: [{ type: 'text', text: 'What triggered the collapse?' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];

    expect(sentBody.messages[0].content[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('should apply caching in streamCompletion', async () => {
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
            .mockResolvedValueOnce({ done: true }),
        }),
      },
    });

    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        {
          role: 'system',
          content: [{ type: 'text', text: 'System prompt' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'User message' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.streamCompletion(params);

    const sentBody = mockTransport.postStream.mock.calls[0][1];

    expect(sentBody.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('should not mutate original params', async () => {
    const originalMessages = [
      {
        role: 'system' as const,
        content: [{ type: 'text' as const, text: 'System prompt' }],
      },
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'User message' }],
      },
    ];

    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: originalMessages,
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    expect((originalMessages[0].content as any)[0].cache_control).toBeUndefined();
    expect((originalMessages[1].content as any)[0].cache_control).toBeUndefined();
  });

  it('should convert string content to array with cache_control', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System prompt as string' },
        { role: 'user', content: 'First user message' },
        { role: 'assistant', content: 'First assistant response' },
        { role: 'user', content: 'Second user message' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];
    
    expect(sentBody.messages[0].content).toEqual([
      { type: 'text', text: 'System prompt as string', cache_control: { type: 'ephemeral' } }
    ]);
    
    expect(sentBody.messages[1].content).toBe('First user message');
    expect(sentBody.messages[2].content).toEqual([
      { type: 'text', text: 'First assistant response', cache_control: { type: 'ephemeral' } }
    ]);
    expect(sentBody.messages[3].content).toEqual([
      { type: 'text', text: 'Second user message', cache_control: { type: 'ephemeral' } }
    ]);
  });
});
