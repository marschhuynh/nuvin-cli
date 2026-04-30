import { describe, it, expect } from 'vitest';
import { isRetryableError, isRetryableStatusCode, getErrorStatusCode } from '../transports/error-classification.js';
import { LLMError } from '../llm-providers/base-llm.js';

describe('isRetryableStatusCode', () => {
  it('should return true for 429', () => {
    expect(isRetryableStatusCode(429)).toBe(true);
  });

  it('should return true for 5xx errors', () => {
    expect(isRetryableStatusCode(500)).toBe(true);
    expect(isRetryableStatusCode(502)).toBe(true);
    expect(isRetryableStatusCode(503)).toBe(true);
    expect(isRetryableStatusCode(504)).toBe(true);
  });

  it('should return false for 4xx errors (except 429)', () => {
    expect(isRetryableStatusCode(400)).toBe(false);
    expect(isRetryableStatusCode(401)).toBe(false);
    expect(isRetryableStatusCode(403)).toBe(false);
    expect(isRetryableStatusCode(404)).toBe(false);
  });

  it('should return false for 2xx responses', () => {
    expect(isRetryableStatusCode(200)).toBe(false);
    expect(isRetryableStatusCode(201)).toBe(false);
  });

  it('should use custom retryable status codes', () => {
    expect(isRetryableStatusCode(418, [418])).toBe(true);
    expect(isRetryableStatusCode(429, [500])).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('should return false for null/undefined', () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });

  it('should return false for AbortError', () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    expect(isRetryableError(abortError)).toBe(false);
  });

  it('should respect LLMError.isRetryable', () => {
    const retryable = new LLMError('rate limit', 429, true);
    const nonRetryable = new LLMError('invalid', 400, false);

    expect(isRetryableError(retryable)).toBe(true);
    expect(isRetryableError(nonRetryable)).toBe(false);
  });

  it('should check status code on LLMError', () => {
    const error429 = new LLMError('rate limit', 429, false);
    const error500 = new LLMError('server error', 500, false);

    expect(isRetryableError(error429)).toBe(true);
    expect(isRetryableError(error500)).toBe(true);
  });

  it('should return true for network errors', () => {
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true);
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
  });

  it('should return false for authentication errors', () => {
    expect(isRetryableError(new Error('invalid api key'))).toBe(false);
    expect(isRetryableError(new Error('unauthorized'))).toBe(false);
    expect(isRetryableError(new Error('forbidden'))).toBe(false);
    expect(isRetryableError(new Error('authentication failed'))).toBe(false);
  });

  it('should return false for unknown errors (fail-safe)', () => {
    expect(isRetryableError(new Error('something went wrong'))).toBe(false);
    expect(isRetryableError(new Error('unknown error'))).toBe(false);
  });

  it('should check statusCode property', () => {
    const error429 = new Error('rate limit') as Error & { statusCode: number };
    error429.statusCode = 429;
    expect(isRetryableError(error429)).toBe(true);

    const error401 = new Error('unauthorized') as Error & { statusCode: number };
    error401.statusCode = 401;
    expect(isRetryableError(error401)).toBe(false);
  });
});

describe('getErrorStatusCode', () => {
  it('should return undefined for null', () => {
    expect(getErrorStatusCode(null)).toBeUndefined();
  });

  it('should return statusCode from LLMError', () => {
    const error = new LLMError('test', 429, true);
    expect(getErrorStatusCode(error)).toBe(429);
  });

  it('should return statusCode property', () => {
    const error = new Error('test') as Error & { statusCode: number };
    error.statusCode = 500;
    expect(getErrorStatusCode(error)).toBe(500);
  });

  it('should return status property', () => {
    const error = new Error('test') as Error & { status: number };
    error.status = 503;
    expect(getErrorStatusCode(error)).toBe(503);
  });
});
