import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GithubLLM } from '../llm-providers/llm-github';
import type { HttpTransport } from '../transports/index.js';
import { LLMErrorTransport } from '../transports/index.js';

// We need to mock the transport to intercept calls
class TestGithubLLM extends GithubLLM {
  public mockTransport: HttpTransport;

  constructor(opts: any) {
    super(opts);
    this.mockTransport = {
      get: vi.fn(),
      post: vi.fn(),
    };
  }

  protected createTransport(): HttpTransport {
    return new LLMErrorTransport(this.mockTransport);
  }
}

describe('GithubLLM', () => {
  let llm: TestGithubLLM;
  const mockModelsResponse = {
    data: [
      {
        id: 'gpt-4',
        name: 'GPT 4',
        capabilities: {
          family: 'gpt-4',
          type: 'chat',
          limits: {
            max_context_window_tokens: 128000,
          },
        },
      },
      {
        id: 'claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        capabilities: {
          family: 'claude-sonnet-4.5',
          type: 'chat',
        },
      },
    ],
    object: 'list',
  };

  beforeEach(() => {
    llm = new TestGithubLLM({ apiKey: 'test-key' });
  });

  it('should fetch models successfully', async () => {
    vi.mocked(llm.mockTransport.get).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockModelsResponse),
      text: () => Promise.resolve(JSON.stringify(mockModelsResponse)),
    } as any);

    const models = await llm.getModels();

    expect(llm.mockTransport.get).toHaveBeenCalledWith('/models', undefined, undefined);
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('gpt-4');
    expect(models[0].name).toBe('GPT 4');
    expect(models[0].limits?.contextWindow).toBe(128000);
    expect(models[1].id).toBe('claude-sonnet-4.5');
    expect(models[1].limits).toBeUndefined();
  });

  it('should handle error response', async () => {
    vi.mocked(llm.mockTransport.get).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as any);

    await expect(llm.getModels()).rejects.toThrow('Authentication failed');
  });

  it('should pass abort signal to transport', async () => {
    vi.mocked(llm.mockTransport.get).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockModelsResponse),
      text: () => Promise.resolve(JSON.stringify(mockModelsResponse)),
    } as any);

    const controller = new AbortController();
    await llm.getModels(controller.signal);

    expect(llm.mockTransport.get).toHaveBeenCalledWith('/models', undefined, controller.signal);
  });

  it('should include all models regardless of supported endpoints', async () => {
    const responseWithUnsupported = {
      data: [
        {
          id: 'gpt-4',
          name: 'GPT 4',
          capabilities: { family: 'gpt-4', type: 'chat' },
        },
        {
          id: 'gpt-5.1-codex',
          name: 'GPT 5.1 Codex',
          supported_endpoints: ['/responses'],
          capabilities: { family: 'gpt-5', type: 'chat' },
        },
        {
          id: 'gpt-4o-mini',
          name: 'GPT 4o Mini',
          supported_endpoints: ['/chat/completions', '/responses'],
          capabilities: { family: 'gpt-4o', type: 'chat' },
        },
      ],
      object: 'list',
    };

    vi.mocked(llm.mockTransport.get).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(responseWithUnsupported),
      text: () => Promise.resolve(JSON.stringify(responseWithUnsupported)),
    } as any);

    const models = await llm.getModels();

    expect(models).toHaveLength(3);
    expect(models.map((m) => m.id)).toContain('gpt-4');
    expect(models.map((m) => m.id)).toContain('gpt-4o-mini');
    expect(models.map((m) => m.id)).toContain('gpt-5.1-codex');
  });

  it('should use responses API directly for codex models based on model name pattern', async () => {
    const responsesApiResponse = {
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
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    vi.mocked(llm.mockTransport.post).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(responsesApiResponse),
      text: () => Promise.resolve(JSON.stringify(responsesApiResponse)),
    } as any);

    const params = {
      model: 'gpt-5.1-codex',
      messages: [{ role: 'user' as const, content: 'Hello' }],
      temperature: 0,
      topP: 0,
    };

    const result = await llm.generateCompletion(params);

    expect(llm.mockTransport.post).toHaveBeenCalledTimes(1);
    expect(llm.mockTransport.post).toHaveBeenCalledWith('/responses', expect.any(Object), undefined, undefined);
    expect(result.content).toBe('Hello from responses API!');
  });

  it('should fallback to responses API when chat completions fails with unsupported_api_for_model for non-codex models', async () => {
    const chatCompletionsError = {
      error: {
        message: 'model some-new-model is not accessible via the /chat/completions endpoint',
        code: 'unsupported_api_for_model',
      },
    };

    const responsesApiResponse = {
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
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    vi.mocked(llm.mockTransport.post)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify(chatCompletionsError)),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responsesApiResponse),
        text: () => Promise.resolve(JSON.stringify(responsesApiResponse)),
      } as any);

    const params = {
      model: 'some-new-model',
      messages: [{ role: 'user' as const, content: 'Hello' }],
      temperature: 0,
      topP: 0,
    };

    const result = await llm.generateCompletion(params);

    expect(llm.mockTransport.post).toHaveBeenCalledTimes(2);
    expect(llm.mockTransport.post).toHaveBeenNthCalledWith(1, '/chat/completions', expect.any(Object), undefined, undefined);
    expect(llm.mockTransport.post).toHaveBeenNthCalledWith(2, '/responses', expect.any(Object), undefined, undefined);
    expect(result.content).toBe('Hello from responses API!');
  });

  it('should deduplicate models with the same ID', async () => {
    const responseWithDuplicates = {
      data: [
        {
          id: 'gpt-4',
          name: 'GPT 4',
          capabilities: {
            family: 'gpt-4',
            type: 'chat',
            limits: {
              max_context_window_tokens: 128000,
            },
          },
        },
        {
          id: 'claude-sonnet-4.5',
          name: 'Claude Sonnet 4.5',
          capabilities: { family: 'claude-sonnet-4.5', type: 'chat' },
        },
        {
          id: 'gpt-4',
          name: 'GPT 4 Duplicate',
          capabilities: {
            family: 'gpt-4',
            type: 'chat',
            limits: {
              max_context_window_tokens: 64000,
            },
          },
        },
      ],
      object: 'list',
    };

    vi.mocked(llm.mockTransport.get).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(responseWithDuplicates),
      text: () => Promise.resolve(JSON.stringify(responseWithDuplicates)),
    } as any);

    const models = await llm.getModels();

    expect(models).toHaveLength(2);
    const modelIds = models.map((m) => m.id);
    expect(modelIds).toEqual(['gpt-4', 'claude-sonnet-4.5']);
    expect(new Set(modelIds).size).toBe(2);
    
    const gpt4Model = models.find((m) => m.id === 'gpt-4');
    expect(gpt4Model?.name).toBe('GPT 4');
    expect(gpt4Model?.limits?.contextWindow).toBe(128000);
  });
});
