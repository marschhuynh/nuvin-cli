import type { HttpTransport, FetchTransport, HttpHeaders, TransportResponse } from './transport.js';

export abstract class BaseBearerAuthTransport implements HttpTransport {
  protected readonly inner: HttpTransport;
  protected readonly apiKey?: string;
  protected readonly baseUrl: string;
  protected readonly version?: string;
  protected readonly customHeaders?: Record<string, string>;

  constructor(inner: FetchTransport, apiKey?: string, baseUrl?: string, version?: string, customHeaders?: Record<string, string>) {
    this.inner = inner;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? this.getDefaultBaseUrl();
    this.version = version;
    this.customHeaders = customHeaders;
  }

  protected abstract getDefaultBaseUrl(): string;

  protected buildFullUrl(path: string): string {
    if (path.startsWith('/')) {
      return `${this.baseUrl}${path}`;
    }
    return path;
  }

  protected makeAuthHeaders(headers?: HttpHeaders): HttpHeaders {
    const base: HttpHeaders = headers ? { ...headers } : {};
    
    if (!base['User-Agent'] && this.version) {
      base['User-Agent'] = `nuvin-cli/${this.version}`;
    }
    
    if (this.apiKey && this.apiKey.trim() !== '' && !this.customHeaders?.Authorization) {
      base.Authorization = `Bearer ${this.apiKey}`;
    }
    
    if (this.customHeaders) {
      Object.assign(base, this.customHeaders);
    }
    
    return base;
  }

  async get(url: string, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse> {
    const fullUrl = this.buildFullUrl(url);
    return this.inner.get(fullUrl, this.makeAuthHeaders(headers), signal);
  }

  async post(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<Response> {
    const fullUrl = this.buildFullUrl(url);
    return this.inner.post(fullUrl, body, this.makeAuthHeaders(headers), signal);
  }
}
