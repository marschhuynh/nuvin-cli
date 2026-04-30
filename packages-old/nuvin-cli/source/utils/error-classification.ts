/**
 * @deprecated This module is deprecated. Use error classification from @nuvin/nuvin-core instead.
 *
 * Import from nuvin-core:
 * ```typescript
 * import { isRetryableError, isRetryableStatusCode, LLMError } from '@nuvin/nuvin-core';
 * ```
 */

import { LLMError } from '@nuvin/nuvin-core';

export { LLMError };

/**
 * @deprecated Use isRetryableError from @nuvin/nuvin-core instead
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof Error && error.name === 'AbortError') {
    return false;
  }

  if (error instanceof LLMError) {
    return error.isRetryable;
  }

  const err = error as Error & { statusCode?: number; code?: string };

  if (err.statusCode) {
    if (err.statusCode === 429) return true;
    if (err.statusCode >= 500 && err.statusCode < 600) return true;
    if (err.statusCode >= 400 && err.statusCode < 500) return false;
  }

  const message = err.message?.toLowerCase() || '';
  const code = err.code?.toLowerCase() || '';

  const nonRetryablePatterns = [
    'invalid',
    'unauthorized',
    'forbidden',
    'not found',
    'bad request',
    'api key',
    'authentication',
    'permission',
  ];

  for (const pattern of nonRetryablePatterns) {
    if (message.includes(pattern) || code.includes(pattern)) {
      return false;
    }
  }

  const networkErrors = [
    'econnrefused',
    'enotfound',
    'etimedout',
    'econnreset',
    'network',
    'fetch failed',
    'terminated',
  ];

  for (const errorType of networkErrors) {
    if (message.includes(errorType) || code.includes(errorType)) {
      return true;
    }
  }

  return true;
}

/**
 * @deprecated This function is no longer needed. RetryTransport handles this internally.
 */
export function shouldStopRetrying(error: unknown, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) return true;

  if (!isRetryableError(error)) return true;

  return false;
}
