import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLLM, supportsGetModels, type CustomProviderDefinition } from '../llm-providers/llm-factory.js';
import { GenericOpenAIResponsesLLM } from '../llm-providers/llm-openai-response-compat.js';
import type { HttpTransport } from '../transports/index.js';
import { LLMErrorTransport } from '../transports/index.js';

class TestOpenAIResponsesLLM extends GenericOpenAIResponsesLLM {
  public mockTransport: HttpTransport;

  constructor(baseUrl: string) {
    super(baseUrl, true, { apiKey: 'test-key', providerName: 'test-responses' });
    this.mockTransport = {
      get: vi.fn(),
      post: vi.fn(),
    };
  }

  protected createTransport(): HttpTransport {
    return new LLMErrorTransport(this.mockTransport);
  }
}

describe('OpenAI Responses Compat Provider', () => {
  const customProviders: Record<string, CustomProviderDefinition> = {
    'test-openai-response': {
      type: 'openai-response-compat',
      baseUrl: 'https://api.example.com/v1',
      models: true,
    },
    'test-openai-response-no-models': {
      type: 'openai-response-compat',
      baseUrl: 'https://api.example.com/v1',
      models: false,
    },
  };

  it('creates GenericOpenAIResponsesLLM for openai-response-compat provider type', () => {
    const llm = createLLM('test-openai-response', { apiKey: 'test-key' }, customProviders);
    expect(llm).toBeInstanceOf(GenericOpenAIResponsesLLM);
  });

  it('respects models support in supportsGetModels', () => {
    expect(supportsGetModels('test-openai-response', customProviders)).toBe(true);
    expect(supportsGetModels('test-openai-response-no-models', customProviders)).toBe(false);
  });
});

describe('GenericOpenAIResponsesLLM runtime behavior', () => {
  let llm: TestOpenAIResponsesLLM;

  beforeEach(() => {
    llm = new TestOpenAIResponsesLLM('https://api.example.com/v1');
  });

  it('sends completions to /responses endpoint', async () => {
    const mockResponse = {
      id: 'resp_123',
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello from responses' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response);

    const result = await llm.generateCompletion({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      topP: 0.9,
    });

    expect(llm.mockTransport.post).toHaveBeenCalledWith(
      '/responses',
      expect.objectContaining({
        model: 'gpt-test',
        input: expect.any(Array),
      }),
      undefined,
      undefined,
    );

    expect(result.content).toBe('Hello from responses');
    expect(result.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });

  it('streams response text and tool calls from /responses endpoint', async () => {
    const chunks = [
      'event: response.output_text.delta\ndata: {"delta": "Hello"}\n\n',
      'event: response.output_item.added\ndata: {"output_index": 0, "item": {"type": "function_call", "name": "get_weather", "call_id": "call_123", "arguments": ""}}\n\n',
      'event: response.function_call_arguments.delta\ndata: {"call_id": "call_123", "delta": "{\\"location\\": \\"NYC\\"}"}\n\n',
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

    const deltas: string[] = [];
    const toolDeltas: Array<{ id: string; name: string; arguments: string }> = [];

    const result = await llm.streamCompletion(
      {
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      {
        onChunk: async (delta) => {
          deltas.push(delta);
        },
        onToolCallDelta: async (tc) => {
          toolDeltas.push({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments });
        },
      },
    );

    expect(deltas).toEqual(['Hello']);
    expect(result.content).toBe('Hello');
    expect(result.tool_calls).toEqual([
      {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location": "NYC"}',
        },
      },
    ]);
    expect(toolDeltas.length).toBeGreaterThan(0);
  });
});
