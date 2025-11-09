import type { HttpTransport, FetchTransport, HttpHeaders, TransportResponse } from './transport.js';

export class OpenRouterAuthTransport implements HttpTransport {
  private readonly inner: HttpTransport;
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(inner: FetchTransport, apiKey?: string, baseUrl?: string) {
    this.inner = inner;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? 'https://openrouter.ai/api/v1';
  }

  private buildFullUrl(path: string): string {
    // If path is relative, prepend the base URL
    if (path.startsWith('/')) {
      return `${this.baseUrl}${path}`;
    }
    // If path is already a full URL, return as-is
    return path;
  }

  private makeAuthHeaders(headers?: HttpHeaders): HttpHeaders {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error('API key missing');
    }
    const base: HttpHeaders = headers ? { ...headers } : {};
    base.Authorization = `Bearer ${this.apiKey}`;
    return base;
  }

  async get(url: string, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse> {
    const fullUrl = this.buildFullUrl(url);
    return this.inner.get(fullUrl, this.makeAuthHeaders(headers), signal);
  }

  async postJson(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse> {
    const fullUrl = this.buildFullUrl(url);
    return this.inner.postJson(fullUrl, body, this.makeAuthHeaders(headers), signal);
  }

  async postStream(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<Response> {
    const fullUrl = this.buildFullUrl(url);
    return this.inner.postStream(fullUrl, body, this.makeAuthHeaders(headers), signal);
  }
}
