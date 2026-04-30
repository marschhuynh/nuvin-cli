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

describe('OpenRouterLLM Prompt Caching - Verification Against Docs', () => {
  let llm: LLMPort;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransport.post = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'test response' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });
    mockTransport.get = vi.fn();
    llm = createLLM('openrouter', { apiKey: 'test-key' });
  });

  it('VERIFICATION: Anthropic system message caching example from docs', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'You are a historian studying the fall of the Roman Empire. You know the following book very well:',
            },
            {
              type: 'text',
              text: 'HUGE TEXT BODY',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What triggered the collapse?',
            },
          ],
        },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];

    expect(sentBody.messages[0].content[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('VERIFICATION: Anthropic user message caching example from docs', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Given the book below:',
            },
            {
              type: 'text',
              text: 'HUGE TEXT BODY',
            },
            {
              type: 'text',
              text: 'Name all the characters in the above book',
            },
          ],
        },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];

    expect(sentBody.messages[0].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[0].content[1].cache_control).toBeUndefined();
    expect(sentBody.messages[0].content[2].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('VERIFICATION: Gemini system message caching example from docs', async () => {
    const params: CompletionParams = {
      model: 'google/gemini-2.5-pro',
      messages: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'You are a historian studying the fall of the Roman Empire. Below is an extensive reference book:',
            },
            {
              type: 'text',
              text: 'HUGE TEXT BODY HERE',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What triggered the collapse?',
            },
          ],
        },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];

    expect(sentBody.messages[0].content[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('VERIFICATION: Gemini user message caching example from docs', async () => {
    const params: CompletionParams = {
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Based on the book text below:',
            },
            {
              type: 'text',
              text: 'HUGE TEXT BODY HERE',
            },
            {
              type: 'text',
              text: 'List all main characters mentioned in the text above.',
            },
          ],
        },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];

    expect(sentBody.messages[0].content[2].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('VERIFICATION: Cache control placement rules', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'Sys 1' }] },
        { role: 'system', content: [{ type: 'text', text: 'Sys 2' }] },
        { role: 'system', content: [{ type: 'text', text: 'Sys 3' }] },
        { role: 'user', content: [{ type: 'text', text: 'User 1' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Assistant 1' }] },
        { role: 'user', content: [{ type: 'text', text: 'User 2' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Assistant 2' }] },
        { role: 'user', content: [{ type: 'text', text: 'User 3' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];

    expect(sentBody.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[2].content[0].cache_control).toBeUndefined();

    expect(sentBody.messages[3].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[4].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[5].content[0].cache_control).toBeUndefined();

    expect(sentBody.messages[6].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[7].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('VERIFICATION: Original params remain unchanged', async () => {
    const originalContent = [{ type: 'text' as const, text: 'Original text' }];
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: originalContent },
        { role: 'user', content: 'User message' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    expect((originalContent[0] as { cache_control?: unknown }).cache_control).toBeUndefined();
    expect(params.messages[0].content).toBe(originalContent);
  });

  it('VERIFICATION: Works with both streaming and non-streaming', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'System' }] },
        { role: 'user', content: [{ type: 'text', text: 'User' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    // First test non-streaming (uses the beforeEach mock which has json())
    await llm.generateCompletion(params);
    const nonStreamBody = mockTransport.post.mock.calls[0][1];

    // Now set up streaming mock
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
            .mockResolvedValueOnce({ done: true }),
        }),
      },
    });

    await llm.streamCompletion(params);
    const streamBody = mockTransport.post.mock.calls[0][1];

    expect(nonStreamBody.messages[0].content[0].cache_control).toEqual(streamBody.messages[0].content[0].cache_control);
    expect(nonStreamBody.messages[1].content[0].cache_control).toEqual(streamBody.messages[1].content[0].cache_control);
  });
});
