import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryTransport, AbortError, DEFAULT_RETRY_CONFIG } from '../transports/retry-transport.js';
import type { HttpTransport, HttpHeaders, TransportResponse } from '../transports/transport.js';

function createMockResponse(status: number, headers: Record<string, string> = {}): Response {
  const headersObj = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headersObj,
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(''),
    clone: vi.fn().mockReturnThis(),
    body: null,
  } as unknown as Response;
}

function createMockTransport() {
  return {
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as HttpTransport;
}

describe('RetryTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful requests', () => {
    it('should return response on first successful request', async () => {
      const mockTransport = createMockTransport();
      const mockResponse = createMockResponse(200);
      vi.mocked(mockTransport.post).mockResolvedValue(mockResponse);

      const retryTransport = new RetryTransport(mockTransport);
      const result = await retryTransport.post('/test', {});

      expect(result).toBe(mockResponse);
      expect(mockTransport.post).toHaveBeenCalledTimes(1);
    });

    it('should pass through headers and body', async () => {
      const mockTransport = createMockTransport();
      const mockResponse = createMockResponse(200);
      vi.mocked(mockTransport.post).mockResolvedValue(mockResponse);

      const retryTransport = new RetryTransport(mockTransport);
      const headers = { 'Content-Type': 'application/json' };
      const body = { test: 'data' };

      await retryTransport.post('/test', body, headers);

      expect(mockTransport.post).toHaveBeenCalledWith('/test', body, headers, undefined);
    });
  });

  describe('retry on errors', () => {
    it('should retry on network error', async () => {
      vi.useRealTimers();
      const mockTransport = createMockTransport();
      const networkError = new Error('fetch failed');
      const mockResponse = createMockResponse(200);

      vi.mocked(mockTransport.post).mockRejectedValueOnce(networkError).mockResolvedValueOnce(mockResponse);

      const retryTransport = new RetryTransport(mockTransport, {
        maxRetries: 3,
        baseDelayMs: 10,
        jitterFactor: 0,
      });
      const result = await retryTransport.post('/test', {});

      expect(result).toBe(mockResponse);
      expect(mockTransport.post).toHaveBeenCalledTimes(2);
      vi.useFakeTimers();
    });

    it('should retry on 429 status', async () => {
      vi.useRealTimers();
      const mockTransport = createMockTransport();
      const response429 = createMockResponse(429);
      const response200 = createMockResponse(200);

      vi.mocked(mockTransport.post).mockResolvedValueOnce(response429).mockResolvedValueOnce(response200);

      const retryTransport = new RetryTransport(mockTransport, {
        maxRetries: 3,
        baseDelayMs: 10,
        jitterFactor: 0,
      });
      const result = await retryTransport.post('/test', {});

      expect(result).toBe(response200);
      expect(mockTransport.post).toHaveBeenCalledTimes(2);
      vi.useFakeTimers();
    });

    it('should retry on 5xx status', async () => {
      vi.useRealTimers();
      const mockTransport = createMockTransport();
      const response500 = createMockResponse(500);
      const response200 = createMockResponse(200);

      vi.mocked(mockTransport.post).mockResolvedValueOnce(response500).mockResolvedValueOnce(response200);

      const retryTransport = new RetryTransport(mockTransport, {
        maxRetries: 3,
        baseDelayMs: 10,
        jitterFactor: 0,
      });
      const result = await retryTransport.post('/test', {});

      expect(result).toBe(response200);
      expect(mockTransport.post).toHaveBeenCalledTimes(2);
      vi.useFakeTimers();
    });
  });

  describe('non-retryable errors', () => {
    it('should not retry on 401', async () => {
      const mockTransport = createMockTransport();
      const response401 = createMockResponse(401);

      vi.mocked(mockTransport.post).mockResolvedValue(response401);

      const retryTransport = new RetryTransport(mockTransport, { maxRetries: 3 });
      const result = await retryTransport.post('/test', {});

      expect(result).toBe(response401);
      expect(mockTransport.post).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 400', async () => {
      const mockTransport = createMockTransport();
      const response400 = createMockResponse(400);

      vi.mocked(mockTransport.post).mockResolvedValue(response400);

      const retryTransport = new RetryTransport(mockTransport, { maxRetries: 3 });
      const result = await retryTransport.post('/test', {});

      expect(result).toBe(response400);
      expect(mockTransport.post).toHaveBeenCalledTimes(1);
    });

    it('should not retry on authentication errors', async () => {
      const mockTransport = createMockTransport();
      const authError = new Error('invalid api key');

      vi.mocked(mockTransport.post).mockRejectedValue(authError);

      const retryTransport = new RetryTransport(mockTransport, { maxRetries: 3 });

      await expect(retryTransport.post('/test', {})).rejects.toThrow('invalid api key');
      expect(mockTransport.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('max retries exhausted', () => {
    it('should throw after max retries', async () => {
      vi.useRealTimers();
      const mockTransport = createMockTransport();
      const networkError = new Error('fetch failed');

      vi.mocked(mockTransport.post).mockRejectedValue(networkError);

      const onExhausted = vi.fn();
      const retryTransport = new RetryTransport(mockTransport, {
        maxRetries: 2,
        baseDelayMs: 10,
        jitterFactor: 0,
        onExhausted,
      });

      await expect(retryTransport.post('/test', {})).rejects.toThrow('fetch failed');
      expect(mockTransport.post).toHaveBeenCalledTimes(3);
      expect(onExhausted).toHaveBeenCalledWith(networkError, 3);
      vi.useFakeTimers();
    });
  });

  describe('abort handling', () => {
    it('should throw AbortError when signal is aborted before execution', async () => {
      const mockTransport = createMockTransport();
      const abortController = new AbortController();
      abortController.abort();

      const retryTransport = new RetryTransport(mockTransport);

      await expect(retryTransport.post('/test', {}, undefined, abortController.signal)).rejects.toThrow(AbortError);
      expect(mockTransport.post).not.toHaveBeenCalled();
    });

    it('should not retry on AbortError', async () => {
      const mockTransport = createMockTransport();
      const abortError = new AbortError('user cancelled');

      vi.mocked(mockTransport.post).mockRejectedValue(abortError);

      const retryTransport = new RetryTransport(mockTransport, { maxRetries: 3 });

      await expect(retryTransport.post('/test', {})).rejects.toThrow(AbortError);
      expect(mockTransport.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry-After header', () => {
    it('should respect Retry-After header in seconds', async () => {
      vi.useRealTimers();
      const mockTransport = createMockTransport();
      const response429 = createMockResponse(429, { 'Retry-After': '0' });
      const response200 = createMockResponse(200);

      vi.mocked(mockTransport.post).mockResolvedValueOnce(response429).mockResolvedValueOnce(response200);

      const onRetry = vi.fn();
      const retryTransport = new RetryTransport(mockTransport, {
        maxRetries: 3,
        onRetry,
      });

      await retryTransport.post('/test', {});

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 0);
      vi.useFakeTimers();
    });

    it('should cap Retry-After at maxDelayMs', async () => {
      vi.useRealTimers();
      const mockTransport = createMockTransport();
      const response429 = createMockResponse(429, { 'Retry-After': '120' });
      const response200 = createMockResponse(200);

      vi.mocked(mockTransport.post).mockResolvedValueOnce(response429).mockResolvedValueOnce(response200);

      const onRetry = vi.fn();
      const retryTransport = new RetryTransport(mockTransport, {
        maxRetries: 3,
        maxDelayMs: 50,
        onRetry,
      });

      await retryTransport.post('/test', {});

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 50);
      vi.useFakeTimers();
    });
  });

  describe('callbacks', () => {
    it('should call onRetry with correct parameters', async () => {
      vi.useRealTimers();
      const mockTransport = createMockTransport();
      const networkError = new Error('fetch failed');
      const mockResponse = createMockResponse(200);

      vi.mocked(mockTransport.post).mockRejectedValueOnce(networkError).mockResolvedValueOnce(mockResponse);

      const onRetry = vi.fn();
      const retryTransport = new RetryTransport(mockTransport, {
        maxRetries: 3,
        baseDelayMs: 10,
        jitterFactor: 0,
        onRetry,
      });

      await retryTransport.post('/test', {});

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, networkError, 10);
      vi.useFakeTimers();
    });
  });

  describe('exponential backoff', () => {
    it('should use exponential backoff with multiplier', async () => {
      vi.useRealTimers();
      const mockTransport = createMockTransport();
      const networkError = new Error('fetch failed');
      const mockResponse = createMockResponse(200);

      vi.mocked(mockTransport.post)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockResponse);

      const onRetry = vi.fn();
      const retryTransport = new RetryTransport(mockTransport, {
        maxRetries: 3,
        baseDelayMs: 10,
        backoffMultiplier: 2,
        jitterFactor: 0,
        onRetry,
      });

      await retryTransport.post('/test', {});

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, networkError, 10);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, networkError, 20);
      vi.useFakeTimers();
    });
  });

  describe('default config', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(100000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.jitterFactor).toBe(0.2);
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toContain(429);
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toContain(500);
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toContain(502);
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toContain(503);
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toContain(504);
    });
  });
});
