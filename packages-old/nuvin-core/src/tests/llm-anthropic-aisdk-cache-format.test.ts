import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicAISDKLLM } from '../llm-providers/llm-anthropic-aisdk';
import type { CompletionParams } from '../ports.js';

describe('Anthropic Cache Control Format Verification', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should send cache_control in correct Anthropic API format for system messages', async () => {
    const responseBody = JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Test response' }],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 50,
        output_tokens: 10,
      },
    });

    // Mock fetch to capture the actual request sent to Anthropic
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => JSON.parse(responseBody),
      text: async () => responseBody,
    });

    global.fetch = mockFetch as any;

    const llm = new AnthropicAISDKLLM({
      apiKey: 'sk-test-key',
    });

    const params: CompletionParams = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'system', content: 'First system message' },
        { role: 'system', content: 'Second system message' },
        { role: 'user', content: 'Hello' },
      ],
      maxTokens: 100,
    };

    await llm.generateCompletion(params);

    // Verify fetch was called
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Extract the request body
    const [url, requestInit] = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body as string);

    // Verify system array exists
    expect(requestBody.system).toBeDefined();
    expect(Array.isArray(requestBody.system)).toBe(true);
    expect(requestBody.system.length).toBeGreaterThanOrEqual(3);

    // Check first system message (Claude Code identifier)
    expect(requestBody.system[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('You are Claude Code'),
      cache_control: {
        type: 'ephemeral',
      },
    });

    // Check second system message (first user-provided)
    expect(requestBody.system[1]).toMatchObject({
      type: 'text',
      text: 'First system message',
      cache_control: {
        type: 'ephemeral',
      },
    });

    // Check third system message (second user-provided)
    expect(requestBody.system[2]).toMatchObject({
      type: 'text',
      text: 'Second system message',
      cache_control: {
        type: 'ephemeral',
      },
    });
  });

  it('should send cache_control on last 2 user/assistant messages', async () => {
    const responseBody = JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Test response' }],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 50,
        output_tokens: 10,
      },
    });

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => JSON.parse(responseBody),
      text: async () => responseBody,
    });

    global.fetch = mockFetch as any;

    const llm = new AnthropicAISDKLLM({
      apiKey: 'sk-test-key',
    });

    const params: CompletionParams = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'assistant', content: 'Response 2' },
        { role: 'user', content: 'Message 3' },
      ],
      maxTokens: 100,
    };

    await llm.generateCompletion(params);

    // Extract the request body
    const [url, requestInit] = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body as string);

    // Verify messages array
    expect(requestBody.messages).toBeDefined();
    expect(Array.isArray(requestBody.messages)).toBe(true);
    expect(requestBody.messages.length).toBe(5);

    // First 3 messages should NOT have cache_control in their content
    expect(requestBody.messages[0].content[0].cache_control).toBeUndefined();
    expect(requestBody.messages[1].content[0].cache_control).toBeUndefined();
    expect(requestBody.messages[2].content[0].cache_control).toBeUndefined();

    // Last 2 messages should have cache_control in their content
    expect(requestBody.messages[3].content[0].cache_control).toMatchObject({
      type: 'ephemeral',
    });
    expect(requestBody.messages[4].content[0].cache_control).toMatchObject({
      type: 'ephemeral',
    });
  });

  it('should send tool_use with input parameter correctly', async () => {
    const responseBody = JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Test response' }],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 50,
        output_tokens: 10,
      },
    });

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => JSON.parse(responseBody),
      text: async () => responseBody,
    });

    global.fetch = mockFetch as any;

    const llm = new AnthropicAISDKLLM({
      apiKey: 'sk-test-key',
    });

    const params: CompletionParams = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'toolu_01NWZ71X2Zkzx14U1Q4pKX4W',
              type: 'function',
              function: {
                name: 'bash_tool',
                arguments: JSON.stringify({
                  action: 'exec',
                  cmd: 'echo hello',
                }),
              },
            },
          ],
        },
      ],
      maxTokens: 100,
    };

    await llm.generateCompletion(params);

    // Extract the request body
    const [url, requestInit] = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body as string);

    // Verify the assistant message with tool_use
    expect(requestBody.messages).toBeDefined();
    expect(requestBody.messages.length).toBe(2);

    const assistantMessage = requestBody.messages[1];
    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.content).toBeDefined();
    expect(Array.isArray(assistantMessage.content)).toBe(true);

    // Find the tool_use in content
    const toolUse = assistantMessage.content.find((c: any) => c.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect(toolUse).toMatchObject({
      type: 'tool_use',
      id: 'toolu_01NWZ71X2Zkzx14U1Q4pKX4W',
      name: 'bash_tool',
      input: {
        action: 'exec',
        cmd: 'echo hello',
      },
    });
  });

  it('should filter out assistant messages with empty content except final message', async () => {
    const responseBody = JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Test response' }],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 50,
        output_tokens: 10,
      },
    });

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => JSON.parse(responseBody),
      text: async () => responseBody,
    });

    global.fetch = mockFetch as any;

    const llm = new AnthropicAISDKLLM({
      apiKey: 'sk-test-key',
    });

    const params: CompletionParams = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'First message' },
        {
          role: 'assistant',
          content: '', // Empty content
          tool_calls: [
            {
              id: 'toolu_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: JSON.stringify({ city: 'NYC' }),
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'toolu_123',
          name: 'get_weather',
          content: '{"temp": 72}',
        },
        {
          role: 'assistant',
          content: '', // Empty content after tool result
        },
        { role: 'user', content: 'Next message' },
      ],
      maxTokens: 100,
    };

    await llm.generateCompletion(params);

    // Extract the request body
    const [url, requestInit] = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body as string);

    // Verify messages
    expect(requestBody.messages).toBeDefined();
    expect(Array.isArray(requestBody.messages)).toBe(true);

    // Assistant messages with empty content in the middle should be filtered out
    // Only the final assistant message can have empty content
    for (let i = 0; i < requestBody.messages.length - 1; i++) {
      const msg = requestBody.messages[i];
      if (msg.role === 'assistant') {
        expect(msg.content.length).toBeGreaterThan(0);
      }
    }

    // Final message (if assistant) can have empty content
    const lastMessage = requestBody.messages[requestBody.messages.length - 1];
    if (lastMessage.role === 'assistant') {
      // Can be empty or non-empty, both are valid
      expect(Array.isArray(lastMessage.content)).toBe(true);
    }
  });
});
