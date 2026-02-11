import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GithubLLM } from '../llm-providers/llm-github';
import type { HttpTransport } from '../transports/index.js';
import { LLMErrorTransport } from '../transports/index.js';
import {
  transformToResponsesInput,
  transformToolsToResponsesFormat,
  transformFromResponsesOutput,
  transformResponsesUsage,
  buildResponsesRequestBody,
} from '../llm-providers/responses-api-transform';
import type { ChatMessage, CompletionParams, ResponseParams } from '../ports.js';

class TestGithubLLM extends GithubLLM {
  public mockTransport: HttpTransport;

  constructor(opts: Record<string, unknown> = {}) {
    super(opts);
    this.mockTransport = {
      get: vi.fn(),
      post: vi.fn(),
    };
  }

  protected createTransport(): HttpTransport {
    return new LLMErrorTransport(this.mockTransport);
  }

  public setModelEndpoints(model: string, endpoints: string[]): void {
    (this as unknown as { modelEndpointCache: Map<string, string[]> }).modelEndpointCache.set(model, endpoints);
  }
}

describe('Responses API Transform', () => {
  describe('transformToResponsesInput', () => {
    it('should extract system messages as instructions', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];

      const result = transformToResponsesInput(messages);

      expect(result.instructions).toBe('You are a helpful assistant.');
      expect(result.input).toHaveLength(1);
      expect(result.input[0]).toEqual({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello' }],
      });
    });

    it('should handle multiple system messages', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'First instruction' },
        { role: 'system', content: 'Second instruction' },
        { role: 'user', content: 'Hello' },
      ];

      const result = transformToResponsesInput(messages);

      expect(result.instructions).toBe('First instruction\n\nSecond instruction');
    });

    it('should transform user messages with text content', () => {
      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello, world!' }];

      const result = transformToResponsesInput(messages);

      expect(result.input).toHaveLength(1);
      expect(result.input[0]).toEqual({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello, world!' }],
      });
    });

    it('should transform assistant messages', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = transformToResponsesInput(messages);

      expect(result.input).toHaveLength(2);
      expect(result.input[1]).toEqual({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hi there!' }],
      });
    });

    it('should transform tool results as function_call_output', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'tool',
          content: '{"temperature": 72}',
          tool_call_id: 'call_123',
        },
      ];

      const result = transformToResponsesInput(messages);

      expect(result.input).toHaveLength(2);
      expect(result.input[1]).toEqual({
        type: 'function_call_output',
        call_id: 'call_123',
        output: '{"temperature": 72}',
      });
    });

    it('should transform assistant tool_calls as function_call', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Run ls command' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_abc123',
              type: 'function',
              function: {
                name: 'bash_tool',
                arguments: '{"cmd": "ls -la"}',
              },
            },
          ],
        },
        {
          role: 'tool',
          content: 'file1.txt\nfile2.txt',
          tool_call_id: 'call_abc123',
        },
      ];

      const result = transformToResponsesInput(messages);

      expect(result.input).toHaveLength(3);
      expect(result.input[0]).toEqual({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Run ls command' }],
      });
      expect(result.input[1]).toEqual({
        type: 'function_call',
        call_id: 'call_abc123',
        name: 'bash_tool',
        arguments: '{"cmd": "ls -la"}',
      });
      expect(result.input[2]).toEqual({
        type: 'function_call_output',
        call_id: 'call_abc123',
        output: 'file1.txt\nfile2.txt',
      });
    });

    it('should handle assistant message with both content and tool_calls', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Check files' },
        {
          role: 'assistant',
          content: 'Let me check the files for you.',
          tool_calls: [
            {
              id: 'call_xyz',
              type: 'function',
              function: {
                name: 'bash_tool',
                arguments: '{"cmd": "ls"}',
              },
            },
          ],
        },
      ];

      const result = transformToResponsesInput(messages);

      expect(result.input).toHaveLength(3);
      expect(result.input[1]).toEqual({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Let me check the files for you.' }],
      });
      expect(result.input[2]).toEqual({
        type: 'function_call',
        call_id: 'call_xyz',
        name: 'bash_tool',
        arguments: '{"cmd": "ls"}',
      });
    });

    it('should handle image content parts', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
          ],
        },
      ];

      const result = transformToResponsesInput(messages);

      expect(result.input).toHaveLength(1);
      expect(result.input[0]).toEqual({
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'What is in this image?' },
          { type: 'input_image', image_url: 'data:image/png;base64,abc123' },
        ],
      });
    });
  });

  describe('transformToolsToResponsesFormat', () => {
    it('should transform tools to responses format', () => {
      const tools: CompletionParams['tools'] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the weather',
            parameters: {
              type: 'object',
              properties: { location: { type: 'string' } },
            },
          },
        },
      ];

      const result = transformToolsToResponsesFormat(tools);

      expect(result).toEqual([
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get the weather',
          parameters: {
            type: 'object',
            properties: { location: { type: 'string' } },
          },
        },
      ]);
    });

    it('should return undefined for empty tools', () => {
      expect(transformToolsToResponsesFormat([])).toBeUndefined();
      expect(transformToolsToResponsesFormat(undefined)).toBeUndefined();
    });
  });

  describe('transformResponsesUsage', () => {
    it('should transform usage data', () => {
      const usage = {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      };

      const result = transformResponsesUsage(usage);

      expect(result).toEqual({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      });
    });

    it('should calculate total tokens if not provided', () => {
      const usage = {
        input_tokens: 100,
        output_tokens: 50,
      };

      const result = transformResponsesUsage(usage);

      expect(result.total_tokens).toBe(150);
    });

    it('should include reasoning tokens if present', () => {
      const usage = {
        input_tokens: 100,
        output_tokens: 50,
        output_tokens_details: { reasoning_tokens: 20 },
      };

      const result = transformResponsesUsage(usage);

      expect(result.completion_tokens_details).toEqual({ reasoning_tokens: 20 });
    });

    it('should include cached tokens if present', () => {
      const usage = {
        input_tokens: 100,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 30 },
      };

      const result = transformResponsesUsage(usage);

      expect(result.prompt_tokens_details).toEqual({ cached_tokens: 30 });
    });

    it('should include both cached and reasoning tokens if present', () => {
      const usage = {
        input_tokens: 100,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 30 },
        output_tokens_details: { reasoning_tokens: 20 },
      };

      const result = transformResponsesUsage(usage);

      expect(result.prompt_tokens_details).toEqual({ cached_tokens: 30 });
      expect(result.completion_tokens_details).toEqual({ reasoning_tokens: 20 });
    });
  });

  describe('transformFromResponsesOutput', () => {
    it('should transform message output', () => {
      const response = {
        id: 'resp_123',
        object: 'response' as const,
        status: 'completed' as const,
        output: [
          {
            type: 'message' as const,
            role: 'assistant' as const,
            content: [{ type: 'output_text' as const, text: 'Hello!' }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = transformFromResponsesOutput(response);

      expect(result.content).toBe('Hello!');
      expect(result.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });

    it('should use output_text fallback', () => {
      const response = {
        id: 'resp_123',
        object: 'response' as const,
        status: 'completed' as const,
        output: [],
        output_text: 'Fallback text',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = transformFromResponsesOutput(response);

      expect(result.content).toBe('Fallback text');
    });

    it('should transform function call output', () => {
      const response = {
        id: 'resp_123',
        object: 'response' as const,
        status: 'completed' as const,
        output: [
          {
            type: 'function_call' as const,
            name: 'get_weather',
            call_id: 'call_456',
            arguments: '{"location": "NYC"}',
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = transformFromResponsesOutput(response);

      expect(result.tool_calls).toEqual([
        {
          id: 'call_456',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "NYC"}',
          },
        },
      ]);
    });
  });

  describe('buildResponsesRequestBody', () => {
    it('should build complete request body', () => {
      const params: CompletionParams = {
        model: 'gpt-5.1-codex',
        messages: [
          { role: 'system', content: 'Be helpful' },
          { role: 'user', content: 'Hello' },
        ],
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 1000,
        tools: [
          {
            type: 'function',
            function: {
              name: 'test',
              description: 'Test function',
              parameters: {},
            },
          },
        ],
      };

      const result = buildResponsesRequestBody(params, true);

      expect(result).toEqual({
        model: 'gpt-5.1-codex',
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello' }] }],
        instructions: 'Be helpful',
        max_output_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
        tools: [{ type: 'function', name: 'test', description: 'Test function', parameters: {} }],
        store: true,
        stream: true,
      });
    });

    it('should allow overriding store when explicitly provided', () => {
      const params: ResponseParams = {
        model: 'gpt-5.1-codex',
        messages: [{ role: 'user', content: 'Hello' }],
        store: false,
      };

      const result = buildResponsesRequestBody(params, false);

      expect(result.store).toBe(false);
    });
  });
});

describe('GithubLLM Responses API Integration', () => {
  let llm: TestGithubLLM;

  beforeEach(() => {
    llm = new TestGithubLLM({ apiKey: 'test-key' });
  });

  it('should use responses API when model only supports /responses', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    const mockResponse = {
      id: 'resp_123',
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello from responses API!' }],
        },
      ],
      usage: { input_tokens: 20, output_tokens: 10 },
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    const result = await llm.generateCompletion({
      model: 'gpt-5.1-codex',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      topP: 0.9,
    });

    expect(llm.mockTransport.post).toHaveBeenCalledWith(
      '/responses',
      expect.objectContaining({
        model: 'gpt-5.1-codex',
        input: expect.any(Array),
      }),
      undefined,
      undefined,
    );

    expect(result.content).toBe('Hello from responses API!');
    expect(result.usage).toEqual({
      prompt_tokens: 20,
      completion_tokens: 10,
      total_tokens: 30,
    });
  });

  it('should use chat completions when model supports it', async () => {
    llm.setModelEndpoints('gpt-4o', ['/chat/completions', '/responses']);

    const mockResponse = {
      choices: [{ message: { content: 'Hello from chat completions!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    const result = await llm.generateCompletion({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      topP: 0.9,
    });

    expect(llm.mockTransport.post).toHaveBeenCalledWith('/chat/completions', expect.any(Object), undefined, undefined);

    expect(result.content).toBe('Hello from chat completions!');
  });

  it('should handle streaming with responses API', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    const chunks = [
      'event: response.output_text.delta\ndata: {"delta": "Hello"}\n\n',
      'event: response.output_text.delta\ndata: {"delta": " world"}\n\n',
      'event: response.completed\ndata: {"response": {"id": "resp_123", "status": "completed", "output": [], "usage": {"input_tokens": 10, "output_tokens": 5}}}\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          const chunk = chunks[chunkIndex++];
          return Promise.resolve({ value: new TextEncoder().encode(chunk), done: false });
        }
        return Promise.resolve({ value: undefined, done: true });
      }),
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const receivedChunks: string[] = [];
    const result = await llm.streamCompletion(
      {
        model: 'gpt-5.1-codex',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        topP: 0.9,
      },
      {
        onChunk: (delta) => receivedChunks.push(delta),
      },
    );

    expect(llm.mockTransport.post).toHaveBeenCalledWith(
      '/responses',
      expect.objectContaining({ stream: true }),
      { Accept: 'text/event-stream' },
      undefined,
    );

    expect(receivedChunks).toEqual(['Hello', ' world']);
    expect(result.content).toBe('Hello world');
  });

  it('should handle tool calls in responses API streaming', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    const chunks = [
      'event: response.output_item.added\ndata: {"item": {"type": "function_call", "name": "get_weather", "call_id": "call_123", "arguments": ""}}\n\n',
      'event: response.function_call_arguments.delta\ndata: {"call_id": "call_123", "delta": "{\\"loc"}\n\n',
      'event: response.function_call_arguments.delta\ndata: {"call_id": "call_123", "delta": "ation\\": \\"NYC\\"}"}\n\n',
      'event: response.function_call_arguments.done\ndata: {"call_id": "call_123", "arguments": "{\\"location\\": \\"NYC\\"}"}\n\n',
      'event: response.completed\ndata: {"response": {"id": "resp_123", "status": "completed", "output": [], "usage": {"input_tokens": 10, "output_tokens": 5}}}\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          const chunk = chunks[chunkIndex++];
          return Promise.resolve({ value: new TextEncoder().encode(chunk), done: false });
        }
        return Promise.resolve({ value: undefined, done: true });
      }),
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const toolCallDeltas: unknown[] = [];
    const result = await llm.streamCompletion(
      {
        model: 'gpt-5.1-codex',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        temperature: 0.7,
        topP: 0.9,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: { location: { type: 'string' } } },
            },
          },
        ],
      },
      {
        onToolCallDelta: (tc) => toolCallDeltas.push({ ...tc }),
      },
    );

    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls?.[0]).toEqual({
      id: 'call_123',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"location": "NYC"}',
      },
    });
  });

  it('should cache model endpoints from getModels', async () => {
    const mockModelsResponse = {
      data: [
        {
          id: 'gpt-5.1-codex',
          name: 'GPT 5.1 Codex',
          supported_endpoints: ['/responses'],
          capabilities: { family: 'gpt-5', type: 'chat' },
        },
        {
          id: 'gpt-4o',
          name: 'GPT 4o',
          supported_endpoints: ['/chat/completions', '/responses'],
          capabilities: { family: 'gpt-4o', type: 'chat' },
        },
      ],
    };

    vi.mocked(llm.mockTransport.get).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockModelsResponse),
      text: () => Promise.resolve(JSON.stringify(mockModelsResponse)),
    } as Response);

    await llm.getModels();

    const mockResponsesResponse = {
      id: 'resp_123',
      object: 'response',
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Test' }] }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponsesResponse),
      text: () => Promise.resolve(JSON.stringify(mockResponsesResponse)),
    } as Response);

    await llm.generateCompletion({
      model: 'gpt-5.1-codex',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      topP: 0.9,
    });

    expect(llm.mockTransport.post).toHaveBeenCalledWith('/responses', expect.any(Object), undefined, undefined);
  });

  it('should handle responses API error', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    const errorResponse = {
      id: 'resp_123',
      object: 'response',
      status: 'failed',
      output: [],
      error: { message: 'Something went wrong', code: 'internal_error' },
      usage: { input_tokens: 0, output_tokens: 0 },
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(errorResponse),
      text: () => Promise.resolve(JSON.stringify(errorResponse)),
    } as Response);

    await expect(
      llm.generateCompletion({
        model: 'gpt-5.1-codex',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        topP: 0.9,
      }),
    ).rejects.toThrow('Something went wrong');
  });

  it('should handle HTTP error responses from responses API', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.reject(new Error('Not JSON')),
      text: () => Promise.resolve('Rate limit exceeded'),
    } as Response);

    await expect(
      llm.generateCompletion({
        model: 'gpt-5.1-codex',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        topP: 0.9,
      }),
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('should handle 401 authentication error', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.reject(new Error('Not JSON')),
      text: () => Promise.resolve('Unauthorized'),
    } as Response);

    await expect(
      llm.generateCompletion({
        model: 'gpt-5.1-codex',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        topP: 0.9,
      }),
    ).rejects.toThrow('Authentication failed');
  });

  it('should handle streaming error event', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    const chunks = [
      'event: response.output_text.delta\ndata: {"delta": "Hello"}\n\n',
      'event: error\ndata: {"error": {"message": "Stream interrupted"}}\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          const chunk = chunks[chunkIndex++];
          return Promise.resolve({ value: new TextEncoder().encode(chunk), done: false });
        }
        return Promise.resolve({ value: undefined, done: true });
      }),
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    await expect(
      llm.streamCompletion(
        {
          model: 'gpt-5.1-codex',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.7,
          topP: 0.9,
        },
        {},
      ),
    ).rejects.toThrow('Stream interrupted');
  });

  it('should handle response.failed streaming event', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    const chunks = [
      'event: response.failed\ndata: {"response": {"id": "resp_123", "status": "failed", "output": [], "error": {"message": "Model overloaded"}, "usage": {"input_tokens": 0, "output_tokens": 0}}}\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          const chunk = chunks[chunkIndex++];
          return Promise.resolve({ value: new TextEncoder().encode(chunk), done: false });
        }
        return Promise.resolve({ value: undefined, done: true });
      }),
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    await expect(
      llm.streamCompletion(
        {
          model: 'gpt-5.1-codex',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.7,
          topP: 0.9,
        },
        {},
      ),
    ).rejects.toThrow('Model overloaded');
  });

  it('should handle multiple tool calls in a single response', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    const mockResponse = {
      id: 'resp_123',
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'function_call',
          name: 'get_weather',
          call_id: 'call_1',
          arguments: '{"location": "NYC"}',
        },
        {
          type: 'function_call',
          name: 'get_time',
          call_id: 'call_2',
          arguments: '{"timezone": "EST"}',
        },
      ],
      usage: { input_tokens: 20, output_tokens: 15 },
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    const result = await llm.generateCompletion({
      model: 'gpt-5.1-codex',
      messages: [{ role: 'user', content: 'What is the weather and time?' }],
      temperature: 0.7,
      topP: 0.9,
    });

    expect(result.tool_calls).toHaveLength(2);
    expect(result.tool_calls?.[0]?.function.name).toBe('get_weather');
    expect(result.tool_calls?.[1]?.function.name).toBe('get_time');
  });

  it('should handle mixed content and tool calls in response', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    const mockResponse = {
      id: 'resp_123',
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Let me check the weather for you.' }],
        },
        {
          type: 'function_call',
          name: 'get_weather',
          call_id: 'call_1',
          arguments: '{"location": "NYC"}',
        },
      ],
      usage: { input_tokens: 20, output_tokens: 25 },
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    const result = await llm.generateCompletion({
      model: 'gpt-5.1-codex',
      messages: [{ role: 'user', content: 'What is the weather?' }],
      temperature: 0.7,
      topP: 0.9,
    });

    expect(result.content).toBe('Let me check the weather for you.');
    expect(result.tool_calls).toHaveLength(1);
  });

  it('should handle usage callback during streaming', async () => {
    llm.setModelEndpoints('gpt-5.1-codex', ['/responses']);

    const chunks = [
      'event: response.output_text.delta\ndata: {"delta": "Hello"}\n\n',
      'event: response.completed\ndata: {"response": {"id": "resp_123", "status": "completed", "output": [], "usage": {"input_tokens": 10, "output_tokens": 5, "output_tokens_details": {"reasoning_tokens": 2}}}}\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          const chunk = chunks[chunkIndex++];
          return Promise.resolve({ value: new TextEncoder().encode(chunk), done: false });
        }
        return Promise.resolve({ value: undefined, done: true });
      }),
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    let receivedUsage: unknown;
    let finishReason: string | undefined;
    await llm.streamCompletion(
      {
        model: 'gpt-5.1-codex',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        topP: 0.9,
      },
      {
        onUsage: (usage) => {
          receivedUsage = usage;
        },
        onStreamFinish: (reason) => {
          finishReason = reason;
        },
      },
    );

    expect(receivedUsage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      completion_tokens_details: { reasoning_tokens: 2 },
    });
    expect(finishReason).toBe('stop');
  });

  it('should fallback to responses API on unsupported_api_for_model error', async () => {
    const mockResponsesResponse = {
      id: 'resp_123',
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello from fallback!' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    vi.mocked(llm.mockTransport.post)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({ error: { code: 'unsupported_api_for_model', message: 'The model is not supported' } }),
        text: () => Promise.resolve('unsupported_api_for_model: The model is not supported'),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponsesResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponsesResponse)),
      } as Response);

    const result = await llm.generateCompletion({
      model: 'some-new-model',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      topP: 0.9,
    });

    expect(result.content).toBe('Hello from fallback!');
    expect(llm.mockTransport.post).toHaveBeenCalledTimes(2);
    expect(llm.mockTransport.post).toHaveBeenNthCalledWith(
      1,
      '/chat/completions',
      expect.any(Object),
      undefined,
      undefined,
    );
    expect(llm.mockTransport.post).toHaveBeenNthCalledWith(2, '/responses', expect.any(Object), undefined, undefined);
  });

  it('should detect codex model patterns as responses-only', async () => {
    const mockResponse = {
      id: 'resp_123',
      object: 'response',
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Test' }] }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    const codexModels = ['gpt-5-codex', 'gpt-5.1-codex', 'gpt-5.1-codex-mini', 'gpt-5.1-codex-max'];
    for (const model of codexModels) {
      await llm.generateCompletion({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        topP: 0.9,
      });
    }

    const calls = vi.mocked(llm.mockTransport.post).mock.calls;
    for (const call of calls) {
      expect(call[0]).toBe('/responses');
    }
  });
});

describe('Responses API Transform Edge Cases', () => {
  it('should handle empty messages array', () => {
    const result = transformToResponsesInput([]);
    expect(result.instructions).toBeUndefined();
    expect(result.input).toHaveLength(0);
  });

  it('should handle assistant message with empty content', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: '' },
    ];

    const result = transformToResponsesInput(messages);
    expect(result.input).toHaveLength(1);
  });

  it('should handle user message with array content', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
        ],
      },
    ];

    const result = transformToResponsesInput(messages);
    expect(result.input[0]).toEqual({
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: 'First part' },
        { type: 'input_text', text: 'Second part' },
      ],
    });
  });

  it('should handle tool message with non-string content', () => {
    const messages: ChatMessage[] = [
      {
        role: 'tool',
        content: { result: 'success', data: [1, 2, 3] } as unknown as string,
        tool_call_id: 'call_123',
      },
    ];

    const result = transformToResponsesInput(messages);
    expect(result.input[0]).toEqual({
      type: 'function_call_output',
      call_id: 'call_123',
      output: '{"result":"success","data":[1,2,3]}',
    });
  });

  it('should build request body without optional parameters', () => {
    const params: CompletionParams = {
      model: 'gpt-5.1-codex',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const result = buildResponsesRequestBody(params, false);

    expect(result).toEqual({
      model: 'gpt-5.1-codex',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello' }] }],
      store: true,
    });
    expect(result.temperature).toBeUndefined();
    expect(result.top_p).toBeUndefined();
    expect(result.max_output_tokens).toBeUndefined();
    expect(result.stream).toBeUndefined();
  });

  it('should handle multiple output_text parts in message', () => {
    const response = {
      id: 'resp_123',
      object: 'response' as const,
      status: 'completed' as const,
      output: [
        {
          type: 'message' as const,
          role: 'assistant' as const,
          content: [
            { type: 'output_text' as const, text: 'Part 1. ' },
            { type: 'output_text' as const, text: 'Part 2.' },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10 },
    };

    const result = transformFromResponsesOutput(response);
    expect(result.content).toBe('Part 1. Part 2.');
  });

  it('should handle response with multiple message outputs', () => {
    const response = {
      id: 'resp_123',
      object: 'response' as const,
      status: 'completed' as const,
      output: [
        {
          type: 'message' as const,
          role: 'assistant' as const,
          content: [{ type: 'output_text' as const, text: 'First message. ' }],
        },
        {
          type: 'message' as const,
          role: 'assistant' as const,
          content: [{ type: 'output_text' as const, text: 'Second message.' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 15 },
    };

    const result = transformFromResponsesOutput(response);
    expect(result.content).toBe('First message. Second message.');
  });
});
