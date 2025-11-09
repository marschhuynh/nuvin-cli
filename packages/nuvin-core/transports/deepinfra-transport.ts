import type { HttpTransport, FetchTransport, HttpHeaders, TransportResponse } from './transport.js';

export class DeepInfraAuthTransport implements HttpTransport {
  private readonly inner: HttpTransport;
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(inner: FetchTransport, apiKey?: string, baseUrl?: string) {
    this.inner = inner;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? 'https://api.deepinfra.com/v1/openai';
  }

  private buildFullUrl(path: string): string {
    if (path.startsWith('/')) {
      return `${this.baseUrl}${path}`;
    }
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
