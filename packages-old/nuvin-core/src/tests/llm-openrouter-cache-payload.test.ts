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

describe('OpenRouterLLM Cache Payload Format', () => {
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

  it('should show exact payload format for string content messages', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content:
            "Hey! I'm Nuvin, your CLI assistant for software engineering. I'm here to help you with code changes, refactoring, testing, debugging, and other development tasks in this nuvin-cli project.\n\nWhat can I help you with?",
        },
        { role: 'user', content: 'tell me about this project' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];

    expect(sentBody.messages[0].content).toEqual([
      {
        type: 'text',
        text: 'You are a helpful assistant.',
        cache_control: { type: 'ephemeral' },
      },
    ]);

    expect(sentBody.messages[1].content).toBe('hi');

    expect(sentBody.messages[2].content).toEqual([
      {
        type: 'text',
        text: "Hey! I'm Nuvin, your CLI assistant for software engineering. I'm here to help you with code changes, refactoring, testing, debugging, and other development tasks in this nuvin-cli project.\n\nWhat can I help you with?",
        cache_control: { type: 'ephemeral' },
      },
    ]);

    expect(sentBody.messages[3].content).toEqual([
      {
        type: 'text',
        text: 'tell me about this project',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });

  it('should show payload for conversation with system + multiple turns', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'System context here' },
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' },
        { role: 'assistant', content: 'Second response' },
        { role: 'user', content: 'Third message' },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.post.mock.calls[0][1];

    expect(sentBody.messages[0].content).toEqual([
      { type: 'text', text: 'System context here', cache_control: { type: 'ephemeral' } },
    ]);
    expect(sentBody.messages[1].content).toBe('First message');
    expect(sentBody.messages[2].content).toBe('First response');
    expect(sentBody.messages[3].content).toBe('Second message');
    expect(sentBody.messages[4].content).toEqual([
      { type: 'text', text: 'Second response', cache_control: { type: 'ephemeral' } },
    ]);
    expect(sentBody.messages[5].content).toEqual([
      { type: 'text', text: 'Third message', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('should preserve original format when caching is disabled', async () => {
    llm = createLLM('openrouter', { apiKey: 'test-key', enablePromptCaching: false });

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

    expect(sentBody.messages[0].content).toBe('System');
    expect(sentBody.messages[1].content).toBe('User');
  });
});
