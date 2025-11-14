import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseLLM } from '../llm-providers/base-llm';
import type { HttpTransport } from '../transports/index.js';
import type { CompletionParams } from '../ports.js';

// Mock transport implementation
const createMockTransport = (): HttpTransport => ({
  postJson: vi.fn(),
  postStream: vi.fn(),
});

// Concrete implementation for testing
class TestLLM extends BaseLLM {
  public mockTransport: HttpTransport;

  constructor(apiUrl: string) {
    super(apiUrl);
    this.mockTransport = createMockTransport();
  }

  protected createTransport(): HttpTransport {
    return this.mockTransport;
  }
}

describe('BaseLLM', () => {
  let llm: TestLLM;
  const apiUrl = 'https://api.example.com';

  beforeEach(() => {
    llm = new TestLLM(apiUrl);
  });

  describe('constructor', () => {
    it('should initialize with apiUrl', () => {
      expect(llm['apiUrl']).toBe(apiUrl);
    });

    it('should lazy-load transport on first use', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      await llm.generateCompletion({ model: 'test', messages: [] });

      expect(llm.mockTransport.postJson).toHaveBeenCalled();
    });
  });

  describe('generateCompletion', () => {
    it('should successfully generate completion', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Hello, world!' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      };

      const result = await llm.generateCompletion(params);

      expect(result.content).toBe('Hello, world!');
      expect(result.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
      expect(llm.mockTransport.postJson).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.7,
          stream: false,
        }),
        undefined,
        undefined,
      );
    });

    it('should pass maxTokens and topP correctly', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
        maxTokens: 100,
        topP: 0.9,
      };

      await llm.generateCompletion(params);

      expect(llm.mockTransport.postJson).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          max_tokens: 100,
          top_p: 0.9,
        }),
        undefined,
        undefined,
      );
    });

    it('should include tools when provided', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
                    },
                  ],
                },
              },
            ],
          }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
        tools,
      };

      const result = await llm.generateCompletion(params);

      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0].function.name).toBe('get_weather');
      expect(llm.mockTransport.postJson).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          tools,
        }),
        undefined,
        undefined,
      );
    });

    it('should include tool_choice when tools are provided', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'test_function',
            description: 'Test',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
        tools,
        tool_choice: 'auto',
      };

      await llm.generateCompletion(params);

      expect(llm.mockTransport.postJson).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          tools,
          tool_choice: 'auto',
        }),
        undefined,
        undefined,
      );
    });

    it('should not include tools when empty', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
        tools: [],
      };

      await llm.generateCompletion(params);

      expect(llm.mockTransport.postJson).toHaveBeenCalledWith(
        '/chat/completions',
        expect.not.objectContaining({
          tools: expect.anything(),
        }),
        undefined,
        undefined,
      );
    });

    it('should include reasoning parameter when provided', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
        reasoning: { effort: 'high' },
      };

      await llm.generateCompletion(params);

      expect(llm.mockTransport.postJson).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          reasoning: { effort: 'high' },
        }),
        undefined,
        undefined,
      );
    });

    it('should pass AbortSignal to transport', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const abortController = new AbortController();
      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      await llm.generateCompletion(params, abortController.signal);

      expect(llm.mockTransport.postJson).toHaveBeenCalledWith(
        '/chat/completions',
        expect.anything(),
        undefined,
        abortController.signal,
      );
    });

    it('should throw error on non-OK response with text', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request: Invalid model'),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'invalid',
        messages: [],
      };

      await expect(llm.generateCompletion(params)).rejects.toThrow('Bad Request: Invalid model');
    });

    it('should throw error on non-OK response without text', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      await expect(llm.generateCompletion(params)).rejects.toThrow('LLM error 500');
    });

    it('should handle usage data with input/output token names', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'test' } }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.generateCompletion(params);

      expect(result.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });

    it('should handle missing usage data', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] }),
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postJson).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.generateCompletion(params);

      expect(result.usage).toBeUndefined();
    });
  });

  describe('streamCompletion', () => {
    const createMockStreamResponse = (chunks: string[]) => {
      const encoder = new TextEncoder();
      const encodedChunks = chunks.map((chunk) => encoder.encode(chunk));

      let currentIndex = 0;
      const reader = {
        read: vi.fn(async () => {
          if (currentIndex >= encodedChunks.length) {
            return { done: true, value: undefined };
          }
          return { done: false, value: encodedChunks[currentIndex++] };
        }),
      };

      return {
        ok: true,
        body: { getReader: () => reader },
        text: () => Promise.resolve(''),
      };
    };

    it('should successfully stream completion', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('Hello world');
      expect(llm.mockTransport.postStream).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'gpt-4',
          stream: true,
        }),
        { Accept: 'text/event-stream' },
        undefined,
      );
    });

    it('should call onChunk handler for each chunk', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onChunk = vi.fn();
      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      await llm.streamCompletion(params, { onChunk });

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onChunk).toHaveBeenNthCalledWith(2, ' world');
    });

    it('should handle tool call deltas', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":""}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\""}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"NYC\\"}"}}]}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onToolCallDelta = vi.fn();
      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params, { onToolCallDelta });

      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0].function.name).toBe('get_weather');
      expect(result.tool_calls?.[0].function.arguments).toBe('{"city":"NYC"}');
      expect(onToolCallDelta).toHaveBeenCalledTimes(3);
    });

    it('should handle usage data in streaming response', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"test"}}]}',
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });

    it('should pass maxTokens and topP correctly in streaming', async () => {
      const chunks = ['data: {"choices":[{"delta":{"content":"test"}}]}', 'data: [DONE]'];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
        maxTokens: 100,
        topP: 0.9,
      };

      await llm.streamCompletion(params);

      expect(llm.mockTransport.postStream).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          max_tokens: 100,
          stream: true,
        }),
        { Accept: 'text/event-stream' },
        undefined,
      );
    });

    it('should include tools and tool_choice in streaming', async () => {
      const chunks = ['data: {"choices":[{"delta":{"content":"test"}}]}', 'data: [DONE]'];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'test_function',
            description: 'Test',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
        tools,
        tool_choice: 'required',
      };

      await llm.streamCompletion(params);

      expect(llm.mockTransport.postStream).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          tools,
          tool_choice: 'required',
          stream: true,
        }),
        { Accept: 'text/event-stream' },
        undefined,
      );
    });

    it('should include reasoning parameter in streaming', async () => {
      const chunks = ['data: {"choices":[{"delta":{"content":"test"}}]}', 'data: [DONE]'];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
        reasoning: { effort: 'medium' },
      };

      await llm.streamCompletion(params);

      expect(llm.mockTransport.postStream).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          reasoning: { effort: 'medium' },
          stream: true,
        }),
        { Accept: 'text/event-stream' },
        undefined,
      );
    });

    it('should pass AbortSignal to transport in streaming', async () => {
      const chunks = ['data: {"choices":[{"delta":{"content":"test"}}]}', 'data: [DONE]'];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const abortController = new AbortController();
      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      await llm.streamCompletion(params, {}, abortController.signal);

      expect(llm.mockTransport.postStream).toHaveBeenCalledWith(
        '/chat/completions',
        expect.anything(),
        { Accept: 'text/event-stream' },
        abortController.signal,
      );
    });

    it('should throw error on non-OK response in streaming', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      };
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      await expect(llm.streamCompletion(params)).rejects.toThrow('Unauthorized');
    });

    it('should handle missing reader gracefully', async () => {
      const mockResponse = {
        ok: true,
        body: null,
        text: () => Promise.resolve(''),
      };
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('');
    });

    it('should ignore invalid JSON events', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: invalid json',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('Hello world');
    });

    it('should handle multiple tool calls with different indices', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"func1","arguments":"{\\"a\\":1}"}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"func2","arguments":"{\\"b\\":2}"}}]}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.tool_calls).toHaveLength(2);
      expect(result.tool_calls?.[0].function.name).toBe('func1');
      expect(result.tool_calls?.[1].function.name).toBe('func2');
    });

    it('should handle events split across multiple reads', async () => {
      const chunks = [
        'data: {"choices":[{"delta',
        '":{"content":"Hel',
        'lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('Hello world');
    });

    it('should not include empty tool_calls array', async () => {
      const chunks = ['data: {"choices":[{"delta":{"content":"test"}}]}', 'data: [DONE]'];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.tool_calls).toBeUndefined();
    });

    it('should handle tool calls without explicit id', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"test","arguments":"{\\"x\\":1}"}}]}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.tool_calls?.[0].id).toBe('0');
    });

    it('should skip empty or whitespace-only content', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":""}}]}',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onChunk = vi.fn();
      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      await llm.streamCompletion(params, { onChunk });

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(onChunk).toHaveBeenCalledWith('Hello');
    });

    it('should remove leading newlines from streamed content', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"\\n"}}]}',
        'data: {"choices":[{"delta":{"content":"\\n"}}]}',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('Hello world');
    });

    it('should not remove newlines from middle or end of streamed content', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"\\n"}}]}',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":"\\n"}}]}',
        'data: {"choices":[{"delta":{"content":"world"}}]}',
        'data: {"choices":[{"delta":{"content":"\\n"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('Hello\nworld\n');
    });

    it('should handle content with only leading newlines', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"\\n"}}]}',
        'data: {"choices":[{"delta":{"content":"\\n"}}]}',
        'data: {"choices":[{"delta":{"content":"\\n"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('');
    });

    it('should handle real-world GLM streaming with leading newlines and reasoning', async () => {
      // Based on real streaming data from /Users/marsch/.nuvin-cli/sse.txt
      const chunks = [
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","content":"\\n"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"The"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" user"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" just"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" said"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" \\\""}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"hi"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"\\",", "}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" which"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" is"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" a"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" simple"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" greeting"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"."}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" I"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" should"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" respond"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" with"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" a"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" brief"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" greeting"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" back"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":","}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" following"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" the"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" instructions"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" to"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" keep"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" responses"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" concise"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" and"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":" direct"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"."}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","content":"\\n"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"delta":{"role":"assistant","content":"!"}}]}',
        'data: {"id":"20251001154016c72e2da818044216","created":1759304416,"model":"glm-4.5","choices":[{"index":0,"finish_reason":"stop","delta":{"role":"assistant","content":""}}],"usage":{"prompt_tokens":6042,"completion_tokens":39,"total_tokens":6081,"prompt_tokens_details":{"cached_tokens":43}}}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'glm-4.5',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      // Leading newlines should be removed
      expect(result.content).toBe('Hi!');
      // Usage should be captured from final chunk
      expect(result.usage).toMatchObject({
        prompt_tokens: 6042,
        completion_tokens: 39,
        total_tokens: 6081,
      });
    });

    it('should handle real-world GLM streaming with leading newlines without reasoning', async () => {
      // Based on real streaming data from /Users/marsch/.nuvin-cli/sse-2.txt
      const chunks = [
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"\\n"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"\\n"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"!"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" What"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" can"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" I"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" help"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" you"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" with"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" today"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"?"}}]}',
        'data: {"id":"202510011555579dfc7aaf218c4cad","created":1759305357,"model":"glm-4.6","choices":[{"index":0,"finish_reason":"stop","delta":{"role":"assistant","content":""}}],"usage":{"prompt_tokens":6074,"completion_tokens":15,"total_tokens":6089,"prompt_tokens_details":{"cached_tokens":43}}}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const params: CompletionParams = {
        model: 'glm-4.6',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      // Leading newlines should be removed
      expect(result.content).toBe('Hello! What can I help you with today?');
      // Usage should be captured from final chunk
      expect(result.usage).toMatchObject({
        prompt_tokens: 6074,
        completion_tokens: 15,
        total_tokens: 6089,
      });
    });

    it('should handle real-world streaming with multiple sequential tool calls at same index', async () => {
      // Real streaming data from Claude with multiple tool calls using index 0
      const chunks = [
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"name":"file_read"},"id":"tooluse_1","index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":""},"index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"{\\"path"},"index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"\\":\\""},"index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"file1.ts\\"}"},"index":0,"type":"function"}]}}]}',
        // Second tool call starts - new ID but same index
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"name":"dir_ls"},"id":"tooluse_2","index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":""},"index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"{\\"path\\":\\""},"index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"dir1\\"}"},"index":0,"type":"function"}]}}]}',
        // Third tool call starts - another new ID but same index
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"name":"file_read"},"id":"tooluse_3","index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":""},"index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"arguments":"{\\"path\\":\\"file2.json\\"}"},"index":0,"type":"function"}]}}]}',
        'data: {"choices":[{"finish_reason":"tool_calls","index":0,"delta":{"content":null}}],"usage":{"completion_tokens":195,"prompt_tokens":9020,"total_tokens":9215}}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onToolCallDelta = vi.fn();
      const params: CompletionParams = {
        model: 'claude-sonnet-4.5',
        messages: [],
      };

      const result = await llm.streamCompletion(params, { onToolCallDelta });

      // Should properly track 3 separate tool calls by their IDs
      expect(result.tool_calls).toHaveLength(3);

      // First tool call
      expect(result.tool_calls?.[0].id).toBe('tooluse_1');
      expect(result.tool_calls?.[0].function.name).toBe('file_read');
      expect(result.tool_calls?.[0].function.arguments).toBe('{"path":"file1.ts"}');

      // Second tool call
      expect(result.tool_calls?.[1].id).toBe('tooluse_2');
      expect(result.tool_calls?.[1].function.name).toBe('dir_ls');
      expect(result.tool_calls?.[1].function.arguments).toBe('{"path":"dir1"}');

      // Third tool call
      expect(result.tool_calls?.[2].id).toBe('tooluse_3');
      expect(result.tool_calls?.[2].function.name).toBe('file_read');
      expect(result.tool_calls?.[2].function.arguments).toBe('{"path":"file2.json"}');

      expect(result.usage).toEqual({
        prompt_tokens: 9020,
        completion_tokens: 195,
        total_tokens: 9215,
      });
      expect(onToolCallDelta).toHaveBeenCalled();
    });

    it('should strip leading newlines from first chunk only', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"\\n\\nHello"}}]}',
        'data: {"choices":[{"delta":{"content":"\\n world"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onChunk = vi.fn();
      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params, { onChunk });

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onChunk).toHaveBeenNthCalledWith(2, '\n world');
      expect(result.content).toBe('Hello\n world');
    });

    it('should not strip newlines from middle chunks', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"First"}}]}',
        'data: {"choices":[{"delta":{"content":"\\n\\nSecond"}}]}',
        'data: {"choices":[{"delta":{"content":"\\nThird"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onChunk = vi.fn();
      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params, { onChunk });

      expect(onChunk).toHaveBeenCalledTimes(3);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'First');
      expect(onChunk).toHaveBeenNthCalledWith(2, '\n\nSecond');
      expect(onChunk).toHaveBeenNthCalledWith(3, '\nThird');
      expect(result.content).toBe('First\n\nSecond\nThird');
    });

    it('should skip chunk if first chunk contains only newlines', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"\\n\\n"}}]}',
        'data: {"choices":[{"delta":{"content":"Content"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onChunk = vi.fn();
      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params, { onChunk });

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(onChunk).toHaveBeenCalledWith('Content');
      expect(result.content).toBe('Content');
    });

    it('should emit stream_finish when finish_reason and usage arrive in separate chunks (OpenRouter pattern)', async () => {
      // Real OpenRouter streaming pattern where finish_reason and usage are in different chunks
      const chunks = [
        'data: {"id":"gen-123","provider":"Minimax","model":"minimax/minimax-m2:free","choices":[{"index":0,"delta":{"role":"assistant","content":"The user"},"finish_reason":null}]}',
        'data: {"id":"gen-123","provider":"Minimax","model":"minimax/minimax-m2:free","choices":[{"index":0,"delta":{"role":"assistant","content":" wants me to help"},"finish_reason":null}]}',
        'data: {"id":"gen-123","provider":"Minimax","model":"minimax/minimax-m2:free","choices":[{"index":0,"delta":{"role":"assistant","content":"I\'ll help you review the latest commit.\\n"},"finish_reason":null}]}',
        // Chunk with finish_reason but NO usage
        'data: {"id":"gen-123","provider":"Minimax","model":"minimax/minimax-m2:free","choices":[{"index":0,"delta":{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"bash_tool","arguments":"{\\"cmd\\": \\"pwd\\"}"}}]},"finish_reason":"tool_calls"}]}',
        // Chunk with usage but finish_reason is null
        'data: {"id":"gen-123","provider":"Minimax","model":"minimax/minimax-m2:free","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],"usage":{"prompt_tokens":2978,"completion_tokens":121,"total_tokens":3099,"completion_tokens_details":{"reasoning_tokens":55}}}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onChunk = vi.fn();
      const onStreamFinish = vi.fn();
      const onToolCallDelta = vi.fn();

      const params: CompletionParams = {
        model: 'minimax/minimax-m2:free',
        messages: [],
      };

      const result = await llm.streamCompletion(params, { onChunk, onStreamFinish, onToolCallDelta });

      // Verify content chunks were emitted
      expect(onChunk).toHaveBeenCalledWith('The user');
      expect(onChunk).toHaveBeenCalledWith(' wants me to help');
      expect(onChunk).toHaveBeenCalledWith('I\'ll help you review the latest commit.\n');

      // Verify stream_finish was emitted with both finish_reason and usage
      expect(onStreamFinish).toHaveBeenCalledTimes(1);
      expect(onStreamFinish).toHaveBeenCalledWith('tool_calls', {
        prompt_tokens: 2978,
        completion_tokens: 121,
        total_tokens: 3099,
        completion_tokens_details: {
          reasoning_tokens: 55,
        },
      });

      // Verify tool calls were processed
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0].function.name).toBe('bash_tool');

      // Verify usage in result
      expect(result.usage).toEqual({
        prompt_tokens: 2978,
        completion_tokens: 121,
        total_tokens: 3099,
        completion_tokens_details: {
          reasoning_tokens: 55,
        },
      });
    });

    it('should NOT emit stream_finish if finish_reason never appears', async () => {
      // Edge case: usage arrives but no finish_reason was ever sent
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":""},"finish_reason":null}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onChunk = vi.fn();
      const onStreamFinish = vi.fn();

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params, { onChunk, onStreamFinish });

      // Verify content was emitted
      expect(result.content).toBe('Hello world');
      expect(result.usage).toBeDefined();

      // onStreamFinish should NOT be called since finish_reason never appeared
      expect(onStreamFinish).not.toHaveBeenCalled();

      // Instead, fallback to chunk event with usage
      expect(onChunk).toHaveBeenCalledWith('', {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });

    it('should emit stream_finish when finish_reason and usage arrive in same chunk', async () => {
      // Standard pattern where both finish_reason and usage are in the same chunk
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello world"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

      const onStreamFinish = vi.fn();

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
      };

      const result = await llm.streamCompletion(params, { onStreamFinish });

      // Verify stream_finish was emitted
      expect(onStreamFinish).toHaveBeenCalledTimes(1);
      expect(onStreamFinish).toHaveBeenCalledWith('stop', {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });

      expect(result.content).toBe('Hello world');
    });
  });
});
