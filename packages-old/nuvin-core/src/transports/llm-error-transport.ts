import type { HttpTransport, HttpHeaders, TransportResponse } from './transport.js';
import { isRetryableError, isRetryableStatusCode, DEFAULT_RETRYABLE_STATUS_CODES } from './error-classification.js';
import { LLMError } from '../llm-providers/base-llm.js';

export class LLMErrorTransport implements HttpTransport {
  constructor(private inner: HttpTransport) {}

  async get(url: string, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse> {
    try {
      const response = await this.inner.get(url, headers, signal);
      if (!response.ok) {
        const text = await response.text();
        this.throwLLMError(response.status, text);
      }
      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  async post(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<Response> {
    try {
      const response = await this.inner.post(url, body, headers, signal);
      if (!response.ok) {
        const text = await response.text();
        this.throwLLMError(response.status, text);
      }
      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  private throwLLMError(statusCode: number, text: string): never {
    const message = text || `HTTP error ${statusCode}`;

    if (statusCode === 429 || statusCode === 408) {
      throw new LLMError('Rate limit exceeded. Please try again later.', statusCode, true);
    } else if (statusCode === 401 || statusCode === 403) {
      throw new LLMError('Authentication failed. Please check your API key.', statusCode, false);
    } else if (statusCode === 400) {
      throw new LLMError(`Invalid request: ${message}`, statusCode, false);
    } else if (isRetryableStatusCode(statusCode, DEFAULT_RETRYABLE_STATUS_CODES)) {
      throw new LLMError('Service temporarily unavailable. Please try again later.', statusCode, true);
    }

    throw new LLMError(message, statusCode, false);
  }

  private handleError(error: unknown): never {
    if (error instanceof LLMError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new LLMError('Request was cancelled', undefined, false, error);
    }

    if (error instanceof Error) {
      if (error.message.includes('rate limit')) {
        throw new LLMError('Rate limit exceeded. Please try again later.', 429, true, error);
      }

      const isNetworkRetryable = isRetryableError(error, DEFAULT_RETRYABLE_STATUS_CODES);
      if (isNetworkRetryable) {
        throw new LLMError('Network error occurred. Please try again.', undefined, true, error);
      }

      throw new LLMError(error.message, undefined, false, error);
    }

    throw new LLMError('An unknown error occurred', undefined, false, error);
  }
}
