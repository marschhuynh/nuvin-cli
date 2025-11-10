import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLLM } from '../llm-providers/llm-factory.js';
import type { CompletionParams } from '../ports.js';

describe('OpenRouterLLM Prompt Caching Edge Cases', () => {
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
    };

    llm = createLLM('openrouter', { apiKey: 'test-key' });
    (llm as any).transport = mockTransport;
  });

  it('should match OpenRouter docs example: system message with multiple parts', async () => {
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

    const sentBody = mockTransport.postJson.mock.calls[0][1];
    
    expect(sentBody.messages[0].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[0].content[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('should match OpenRouter docs example: user message caching', async () => {
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

    const sentBody = mockTransport.postJson.mock.calls[0][1];
    
    expect(sentBody.messages[0].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[0].content[1].cache_control).toBeUndefined();
    expect(sentBody.messages[0].content[2].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('should cache only last part of each message', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
            { type: 'text', text: 'Part 3' },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'User part 1' },
            { type: 'text', text: 'User part 2' },
          ],
        },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];
    
    expect(sentBody.messages[0].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[0].content[1].cache_control).toBeUndefined();
    expect(sentBody.messages[0].content[2].cache_control).toEqual({ type: 'ephemeral' });
    
    expect(sentBody.messages[1].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[1].content[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('should handle conversation with multiple turns', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'System' }] },
        { role: 'user', content: [{ type: 'text', text: 'First question' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'First answer' }] },
        { role: 'user', content: [{ type: 'text', text: 'Second question' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Second answer' }] },
        { role: 'user', content: [{ type: 'text', text: 'Third question' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];
    
    expect(sentBody.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[1].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[2].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[3].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[4].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[5].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('should not cache image parts', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
          ],
        },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];
    
    expect(sentBody.messages[0].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[0].content[1].cache_control).toBeUndefined();
  });

  it('should handle empty content arrays', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: [] },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await expect(llm.generateCompletion(params)).resolves.toBeDefined();
  });

  it('should handle multiple system messages correctly', async () => {
    const params: CompletionParams = {
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'System 1' }] },
        { role: 'system', content: [{ type: 'text', text: 'System 2' }] },
        { role: 'system', content: [{ type: 'text', text: 'System 3' }] },
        { role: 'system', content: [{ type: 'text', text: 'System 4' }] },
        { role: 'user', content: [{ type: 'text', text: 'Question' }] },
      ],
      temperature: 0.7,
      topP: 1,
    };

    await llm.generateCompletion(params);

    const sentBody = mockTransport.postJson.mock.calls[0][1];
    
    expect(sentBody.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.messages[2].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[3].content[0].cache_control).toBeUndefined();
    expect(sentBody.messages[4].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});
