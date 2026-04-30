import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicAISDKLLM } from '../llm-providers/llm-anthropic-aisdk.js';

describe('AnthropicAISDKLLM - getModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch models with API key', async () => {
    const mockResponse = {
      data: [
        {
          type: 'model',
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5',
          created_at: '2025-11-24T00:00:00Z',
        },
        {
          type: 'model',
          id: 'claude-haiku-4-5-20251001',
          display_name: 'Claude Haiku 4.5',
          created_at: '2025-10-15T00:00:00Z',
        },
        {
          type: 'model',
          id: 'claude-3-5-haiku-20241022',
          display_name: 'Claude Haiku 3.5',
          created_at: '2024-10-22T00:00:00Z',
        },
      ],
      has_more: false,
      first_id: 'claude-opus-4-5-20251101',
      last_id: 'claude-3-5-haiku-20241022',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const llm = new AnthropicAISDKLLM({ apiKey: 'test-key' });
    const models = await llm.getModels();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );

    expect(models).toHaveLength(3);
    expect(models[0].id).toBe('claude-opus-4-5-20251101');
    expect(models[0].name).toBe('Claude Opus 4.5');
    expect(models[0].limits).toEqual({ contextWindow: 200000, maxOutput: 16000 });

    expect(models[1].id).toBe('claude-haiku-4-5-20251001');
    expect(models[1].name).toBe('Claude Haiku 4.5');
    expect(models[1].limits).toEqual({ contextWindow: 200000, maxOutput: 16000 });

    expect(models[2].id).toBe('claude-3-5-haiku-20241022');
    expect(models[2].name).toBe('Claude Haiku 3.5');
    expect(models[2].limits).toEqual({ contextWindow: 200000, maxOutput: 8192 });
  });

  it('should fetch models with OAuth token', async () => {
    const mockResponse = {
      data: [
        {
          type: 'model',
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5',
          created_at: '2025-11-24T00:00:00Z',
        },
      ],
      has_more: false,
      first_id: 'claude-opus-4-5-20251101',
      last_id: 'claude-opus-4-5-20251101',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const llm = new AnthropicAISDKLLM({
      oauth: {
        type: 'oauth',
        access: 'test-access-token',
        refresh: 'test-refresh-token',
        expires: Date.now() + 3600000,
      },
    });
    const models = await llm.getModels();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer test-access-token',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('claude-opus-4-5-20251101');
    expect(models[0].name).toBe('Claude Opus 4.5');
  });

  it('should use custom baseURL', async () => {
    const mockResponse = {
      data: [
        {
          type: 'model',
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5',
          created_at: '2025-11-24T00:00:00Z',
        },
      ],
      has_more: false,
      first_id: 'claude-opus-4-5-20251101',
      last_id: 'claude-opus-4-5-20251101',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const llm = new AnthropicAISDKLLM({
      apiKey: 'test-key',
      baseURL: 'https://custom.anthropic.com/v1',
    });
    const models = await llm.getModels();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://custom.anthropic.com/v1/models',
      expect.objectContaining({
        method: 'GET',
      }),
    );

    expect(models).toHaveLength(1);
  });

  it('should handle 401 error and retry with OAuth refresh', async () => {
    const mockResponse = {
      data: [
        {
          type: 'model',
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5',
          created_at: '2025-11-24T00:00:00Z',
        },
      ],
      has_more: false,
      first_id: 'claude-opus-4-5-20251101',
      last_id: 'claude-opus-4-5-20251101',
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    const llm = new AnthropicAISDKLLM({
      oauth: {
        type: 'oauth',
        access: 'old-access-token',
        refresh: 'refresh-token',
        expires: Date.now() - 1000,
      },
    });

    const models = await llm.getModels();

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('claude-opus-4-5-20251101');
  });

  it('should throw error when no credentials provided', async () => {
    const llm = new AnthropicAISDKLLM({});

    await expect(llm.getModels()).rejects.toThrow('No API key or OAuth credentials provided');
  });

  it('should pass abort signal', async () => {
    const mockResponse = {
      data: [],
      has_more: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const llm = new AnthropicAISDKLLM({ apiKey: 'test-key' });
    const controller = new AbortController();
    await llm.getModels(controller.signal);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });

  it('should handle API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    const llm = new AnthropicAISDKLLM({ apiKey: 'test-key' });

    await expect(llm.getModels()).rejects.toThrow('Bad Request');
  });

  it('should handle network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const llm = new AnthropicAISDKLLM({
      apiKey: 'test-key',
      retry: { maxRetries: 0 },
    });

    await expect(llm.getModels()).rejects.toThrow('Network error');
  });

  it('should deduplicate models with the same ID', async () => {
    const mockResponse = {
      data: [
        {
          type: 'model',
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5',
          created_at: '2025-11-24T00:00:00Z',
        },
        {
          type: 'model',
          id: 'claude-haiku-4-5-20251001',
          display_name: 'Claude Haiku 4.5',
          created_at: '2025-10-15T00:00:00Z',
        },
        {
          type: 'model',
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5 Duplicate',
          created_at: '2025-11-24T00:00:00Z',
        },
      ],
      has_more: false,
      first_id: 'claude-opus-4-5-20251101',
      last_id: 'claude-opus-4-5-20251101',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const llm = new AnthropicAISDKLLM({ apiKey: 'test-key' });
    const models = await llm.getModels();

    expect(models).toHaveLength(2);
    const modelIds = models.map((m) => m.id);
    expect(modelIds).toEqual(['claude-opus-4-5-20251101', 'claude-haiku-4-5-20251001']);
    expect(new Set(modelIds).size).toBe(2);

    const opusModel = models.find((m) => m.id === 'claude-opus-4-5-20251101');
    expect(opusModel?.name).toBe('Claude Opus 4.5');
  });
});
