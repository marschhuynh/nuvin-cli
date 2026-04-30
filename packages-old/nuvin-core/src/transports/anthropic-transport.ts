import type { HttpTransport, FetchTransport, HttpHeaders, TransportResponse } from './transport.js';
import { RetryTransport, type RetryConfig } from './retry-transport.js';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';

export type OAuthCredentials = {
  access: string;
  refresh: string;
  expires: number;
};

export type AnthropicTransportOptions = {
  apiKey?: string;
  oauth?: OAuthCredentials;
  baseUrl?: string;
  retry?: Partial<RetryConfig>;
  onTokenUpdate?: (newCredentials: OAuthCredentials) => void;
};

interface TokenRefreshResult {
  type: 'success' | 'failed';
  access?: string;
  refresh?: string;
  expires?: number;
}

export class AnthropicAuthTransport implements HttpTransport {
  private readonly inner: HttpTransport;
  private readonly baseUrl: string;
  private readonly retryConfig?: Partial<RetryConfig>;
  private apiKey?: string;
  private oauth?: OAuthCredentials;
  private onTokenUpdate?: (newCredentials: OAuthCredentials) => void;
  private refreshPromise: Promise<TokenRefreshResult> | null = null;

  constructor(inner: FetchTransport, opts: AnthropicTransportOptions) {
    this.inner = inner;
    this.apiKey = opts.apiKey;
    this.oauth = opts.oauth;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.onTokenUpdate = opts.onTokenUpdate;
    this.retryConfig = opts.retry;
  }

  private async refreshAccessToken(): Promise<TokenRefreshResult> {
    if (!this.oauth) {
      return { type: 'failed' };
    }

    try {
      const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.oauth.refresh,
          client_id: CLIENT_ID,
        }),
      });

      if (!response.ok) {
        return { type: 'failed' };
      }

      const json = await response.json();
      return {
        type: 'success',
        access: json.access_token,
        refresh: json.refresh_token,
        expires: Date.now() + json.expires_in * 1000,
      };
    } catch {
      return { type: 'failed' };
    }
  }

  private updateCredentials(result: TokenRefreshResult): void {
    if (result.type === 'success' && result.access && result.refresh && result.expires) {
      if (this.oauth) {
        this.oauth.access = result.access;
        this.oauth.refresh = result.refresh;
        this.oauth.expires = result.expires;
      }

      this.onTokenUpdate?.({
        access: result.access,
        refresh: result.refresh,
        expires: result.expires,
      });
    }
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.oauth) return;

    if (this.refreshPromise) {
      const result = await this.refreshPromise;
      if (result.type === 'failed') {
        throw new Error('Token refresh failed');
      }
      return;
    }

    this.refreshPromise = this.refreshAccessToken();
    try {
      const result = await this.refreshPromise;
      if (result.type === 'success') {
        this.updateCredentials(result);
      } else {
        throw new Error('Token refresh failed');
      }
    } finally {
      this.refreshPromise = null;
    }
  }

  private buildFullUrl(path: string): string {
    if (path.startsWith('/')) {
      return `${this.baseUrl}${path}`;
    }
    return path;
  }

  private makeAuthHeaders(headers?: HttpHeaders): HttpHeaders {
    const base: HttpHeaders = {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14',
      ...(headers || {}),
    };

    if (this.oauth) {
      base.authorization = `Bearer ${this.oauth.access}`;
    } else if (this.apiKey) {
      base['x-api-key'] = this.apiKey;
    }

    return base;
  }

  async get(url: string, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse> {
    const fullUrl = this.buildFullUrl(url);
    let res = await this.inner.get(fullUrl, this.makeAuthHeaders(headers), signal);

    if ((res.status === 401 || res.status === 403) && this.oauth) {
      await this.ensureValidToken();
      res = await this.inner.get(fullUrl, this.makeAuthHeaders(headers), signal);
    }

    return res;
  }

  async post(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<Response> {
    const fullUrl = this.buildFullUrl(url);
    let res = await this.inner.post(fullUrl, body, this.makeAuthHeaders(headers), signal);

    if ((res.status === 401 || res.status === 403) && this.oauth) {
      await this.ensureValidToken();
      res = await this.inner.post(fullUrl, body, this.makeAuthHeaders(headers), signal);
    }

    return res;
  }

  createRetryTransport(): RetryTransport {
    return new RetryTransport(this, this.retryConfig);
  }

  createFetchFunction(): typeof fetch {
    const makeRequest = async (url: string, init?: RequestInit): Promise<Response> => {
      let currentInit = init;
      if (this.oauth) {
        const headers = new Headers(currentInit?.headers);
        headers.delete('x-api-key');
        headers.set('authorization', `Bearer ${this.oauth.access}`);
        headers.set('user-agent', 'ai-sdk/anthropic/2.0.30 ai-sdk/provider-utils/3.0.12');
        currentInit = { ...currentInit, headers };
      }

      const response = await fetch(url, currentInit);

      if ((response.status === 401 || response.status === 403) && this.oauth) {
        await this.ensureValidToken();

        const headers = new Headers(currentInit?.headers);
        headers.set('authorization', `Bearer ${this.oauth.access}`);
        currentInit = { ...currentInit, headers };

        return fetch(url, currentInit);
      }

      return response;
    };

    const retryTransport = new RetryTransport(
      {
        get: async (url, headers, signal) => {
          return makeRequest(url, { method: 'GET', headers: headers as HeadersInit, signal });
        },
        post: async (url, body, headers, signal) => {
          return makeRequest(url, {
            method: 'POST',
            headers: headers as HeadersInit,
            body: typeof body === 'string' ? body : JSON.stringify(body),
            signal,
          });
        },
      },
      this.retryConfig,
    );

    return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      const method = init?.method?.toUpperCase() ?? 'GET';
      const headers = init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined;

      if (method === 'GET') {
        return retryTransport.get(urlStr, headers, init?.signal ?? undefined) as Promise<Response>;
      }

      return retryTransport.post(urlStr, init?.body, headers, init?.signal ?? undefined);
    };
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getOAuth(): OAuthCredentials | undefined {
    return this.oauth;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }
}
