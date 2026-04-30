import { LLMError } from '../llm-providers/base-llm.js';

export const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524];

const RETRYABLE_NETWORK_ERRORS = [
  'econnrefused',
  'enotfound',
  'etimedout',
  'econnreset',
  'epipe',
  'network',
  'fetch failed',
  'socket hang up',
  'terminated',
  'connection reset',
  'connection refused',
  'connection timed out',
  'network request failed',
  'aborted due to connection closure',
];

const NON_RETRYABLE_PATTERNS = [
  'invalid',
  'unauthorized',
  'forbidden',
  'not found',
  'bad request',
  'api key',
  'authentication',
  'permission',
  'invalid_api_key',
  'insufficient_quota',
];

export function isRetryableStatusCode(
  status: number,
  retryableStatusCodes: number[] = DEFAULT_RETRYABLE_STATUS_CODES,
): boolean {
  return retryableStatusCodes.includes(status);
}

export function isRetryableError(
  error: unknown,
  retryableStatusCodes: number[] = DEFAULT_RETRYABLE_STATUS_CODES,
): boolean {
  if (!error) return false;

  if (error instanceof Error && error.name === 'AbortError') {
    return false;
  }

  if (error instanceof LLMError) {
    if (error.statusCode) {
      return isRetryableStatusCode(error.statusCode, retryableStatusCodes);
    }
    return error.isRetryable;
  }

  const err = error as Error & { statusCode?: number; status?: number; code?: string };
  const statusCode = err.statusCode ?? err.status;

  if (statusCode) {
    return isRetryableStatusCode(statusCode, retryableStatusCodes);
  }

  const message = err.message?.toLowerCase() || '';
  const code = err.code?.toLowerCase() || '';

  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (message.includes(pattern) || code.includes(pattern)) {
      return false;
    }
  }

  for (const networkError of RETRYABLE_NETWORK_ERRORS) {
    if (message.includes(networkError) || code.includes(networkError)) {
      return true;
    }
  }

  return false;
}

export function getErrorStatusCode(error: unknown): number | undefined {
  if (!error) return undefined;

  if (error instanceof LLMError) {
    return error.statusCode;
  }

  const err = error as Error & { statusCode?: number; status?: number };
  return err.statusCode ?? err.status;
}
