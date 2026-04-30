import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicAuthTransport } from '../transports/anthropic-transport.js';
import { FetchTransport } from '../transports/transport.js';

describe('AnthropicAuthTransport', () => {
  let mockFetchTransport: FetchTransport;

  beforeEach(() => {
    mockFetchTransport = {
      get: vi.fn(),
      post: vi.fn(),
    } as unknown as FetchTransport;
  });

  describe('createFetchFunction with retry', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should retry on 429 status code', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve(new Response('Rate limited', { status: 429 }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      });

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-key',
        retry: {
          maxRetries: 3,
          baseDelayMs: 10,
          maxDelayMs: 100,
        },
      });

      const fetchFn = transport.createFetchFunction();
      const response = await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status).toBe(200);
      expect(callCount).toBe(3);
    });

    it('should retry on 500 status code', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.resolve(new Response('Server error', { status: 500 }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      });

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-key',
        retry: {
          maxRetries: 3,
          baseDelayMs: 10,
          maxDelayMs: 100,
        },
      });

      const fetchFn = transport.createFetchFunction();
      const response = await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should not retry on 400 status code', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(new Response('Bad request', { status: 400 }));
      });

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-key',
        retry: {
          maxRetries: 3,
          baseDelayMs: 10,
          maxDelayMs: 100,
        },
      });

      const fetchFn = transport.createFetchFunction();
      const response = await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status).toBe(400);
      expect(callCount).toBe(1);
    });

    it('should exhaust retries and throw error', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(new Response('Rate limited', { status: 429 }));
      });

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-key',
        retry: {
          maxRetries: 2,
          baseDelayMs: 10,
          maxDelayMs: 100,
        },
      });

      const fetchFn = transport.createFetchFunction();
      await expect(
        fetchFn('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      ).rejects.toThrow('HTTP 429');

      expect(callCount).toBe(3);
    });

    it('should call onRetry callback', async () => {
      let callCount = 0;
      const onRetry = vi.fn();

      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.resolve(new Response('Rate limited', { status: 429 }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      });

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-key',
        retry: {
          maxRetries: 3,
          baseDelayMs: 10,
          maxDelayMs: 100,
          onRetry,
        },
      });

      const fetchFn = transport.createFetchFunction();
      await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
    });

    it('should respect retry-after header', async () => {
      let callCount = 0;
      const onRetry = vi.fn();

      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          const headers = new Headers();
          headers.set('retry-after', '2');
          return Promise.resolve(new Response('Rate limited', { status: 429, headers }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      });

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-key',
        retry: {
          maxRetries: 3,
          baseDelayMs: 10,
          maxDelayMs: 5000,
          onRetry,
        },
      });

      const fetchFn = transport.createFetchFunction();
      await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 2000);
    });

    it('should retry on network errors', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      });

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-key',
        retry: {
          maxRetries: 3,
          baseDelayMs: 10,
          maxDelayMs: 100,
        },
      });

      const fetchFn = transport.createFetchFunction();
      const response = await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should throw on abort', async () => {
      const controller = new AbortController();
      controller.abort();

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-key',
      });

      const fetchFn = transport.createFetchFunction();
      await expect(
        fetchFn('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        }),
      ).rejects.toThrow('aborted');
    });
  });

  describe('OAuth token refresh with retry', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should refresh token on 401 and retry', async () => {
      let callCount = 0;
      const onTokenUpdate = vi.fn();

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('oauth/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'new-access',
                refresh_token: 'new-refresh',
                expires_in: 3600,
              }),
              { status: 200 },
            ),
          );
        }

        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response('Unauthorized', { status: 401 }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      });

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        oauth: {
          access: 'old-access',
          refresh: 'old-refresh',
          expires: Date.now() - 1000,
        },
        onTokenUpdate,
        retry: {
          maxRetries: 3,
          baseDelayMs: 10,
        },
      });

      const fetchFn = transport.createFetchFunction();
      const response = await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status).toBe(200);
      expect(onTokenUpdate).toHaveBeenCalledWith({
        access: 'new-access',
        refresh: 'new-refresh',
        expires: expect.any(Number),
      });
    });
  });

  describe('get and post methods', () => {
    it('should add auth headers for API key', async () => {
      const mockResponse = { ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') };
      (mockFetchTransport.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-api-key',
      });

      await transport.get('/models');

      expect(mockFetchTransport.get).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          'x-api-key': 'test-api-key',
          'anthropic-version': '2023-06-01',
        }),
        undefined,
      );
    });

    it('should add auth headers for OAuth', async () => {
      const mockResponse = { ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') };
      (mockFetchTransport.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        oauth: {
          access: 'oauth-access-token',
          refresh: 'oauth-refresh-token',
          expires: Date.now() + 3600000,
        },
      });

      await transport.get('/models');

      expect(mockFetchTransport.get).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          authorization: 'Bearer oauth-access-token',
          'anthropic-version': '2023-06-01',
        }),
        undefined,
      );
    });

    it('should use custom baseUrl', async () => {
      const mockResponse = { ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') };
      (mockFetchTransport.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const transport = new AnthropicAuthTransport(mockFetchTransport, {
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com/v1',
      });

      await transport.get('/models');

      expect(mockFetchTransport.get).toHaveBeenCalledWith(
        'https://custom.api.com/v1/models',
        expect.any(Object),
        undefined,
      );
    });
  });
});
