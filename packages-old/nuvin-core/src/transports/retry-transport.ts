import type { HttpTransport, HttpHeaders, TransportResponse } from './transport.js';
import { calculateBackoff, parseRetryAfterHeader } from './backoff.js';
import { isRetryableError, isRetryableStatusCode, DEFAULT_RETRYABLE_STATUS_CODES } from './error-classification.js';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableStatusCodes: number[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  onExhausted?: (error: Error, attempts: number) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 100000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  retryableStatusCodes: DEFAULT_RETRYABLE_STATUS_CODES,
};

export class AbortError extends Error {
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'AbortError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AbortError);
    }
  }
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError('Operation aborted'));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new AbortError('Operation aborted during retry delay'));
      },
      { once: true },
    );
  });
};

export class RetryTransport implements HttpTransport {
  private config: RetryConfig;

  constructor(
    private inner: HttpTransport,
    config: Partial<RetryConfig> = {},
  ) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  async get(url: string, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse> {
    return this.executeWithRetry(() => this.inner.get(url, headers, signal), signal);
  }

  async post(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<Response> {
    return this.executeWithRetry(() => this.inner.post(url, body, headers, signal), signal);
  }

  private async executeWithRetry<T extends Response | TransportResponse>(
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      if (signal?.aborted) {
        throw new AbortError('Operation aborted before execution');
      }

      try {
        const response = await fn();

        if (this.isRetryableResponse(response)) {
          const error = new Error(`HTTP ${response.status}`);
          (error as Error & { status: number }).status = response.status;

          if (attempt < this.config.maxRetries) {
            const delayMs = this.getDelayForResponse(response, attempt);
            this.config.onRetry?.(attempt + 1, error, delayMs);
            await sleep(delayMs, signal);
            attempt++;
            continue;
          }

          lastError = error;
          break;
        }

        return response;
      } catch (error) {
        if (error instanceof AbortError || (error instanceof Error && error.name === 'AbortError')) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        if (!isRetryableError(lastError, this.config.retryableStatusCodes)) {
          throw lastError;
        }

        if (attempt < this.config.maxRetries) {
          const delayMs = calculateBackoff(
            attempt,
            this.config.baseDelayMs,
            this.config.maxDelayMs,
            this.config.backoffMultiplier,
            this.config.jitterFactor,
          );
          this.config.onRetry?.(attempt + 1, lastError, delayMs);
          await sleep(delayMs, signal);
          attempt++;
        } else {
          break;
        }
      }
    }

    if (lastError) {
      this.config.onExhausted?.(lastError, attempt + 1);
      throw lastError;
    }

    throw new Error('Retry exhausted without error');
  }

  private isRetryableResponse(response: Response | TransportResponse): boolean {
    return isRetryableStatusCode(response.status, this.config.retryableStatusCodes);
  }

  private getDelayForResponse(response: Response | TransportResponse, attempt: number): number {
    const headers = 'headers' in response && response.headers instanceof Headers ? response.headers : null;
    const retryAfter = headers?.get('retry-after') ?? null;
    const retryAfterMs = parseRetryAfterHeader(retryAfter);

    if (retryAfterMs !== null) {
      return Math.min(retryAfterMs, this.config.maxDelayMs);
    }

    return calculateBackoff(
      attempt,
      this.config.baseDelayMs,
      this.config.maxDelayMs,
      this.config.backoffMultiplier,
      this.config.jitterFactor,
    );
  }
}
