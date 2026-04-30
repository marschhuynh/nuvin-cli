import * as crypto from 'node:crypto';
import type { HttpTransport, FetchTransport, HttpHeaders, TransportResponse } from './transport.js';

type TokenExchangeResponse = {
  token?: string;
  endpoints?: {
    api?: string;
    proxy?: string;
    'origin-tracker'?: string;
    telemetry?: string;
  };
};

interface ChatMessage {
  content: string | Array<{ type: string; image_url?: { url: string } }>;
  role?: string;
}

const isVisionMessage = (msg: ChatMessage): boolean => {
  if (!msg) return false;
  const content = msg.content;
  if (!content) return false;

  if (Array.isArray(content)) {
    return content.some((part) => typeof part === 'object' && part?.type === 'image_url');
  }

  return false;
};

export class GithubAuthTransport implements HttpTransport {
  private apiKey?: string;
  private accessToken?: string;
  private dynamicApiUrl?: string;
  private readonly baseUrl: string;
  private readonly inner: HttpTransport;

  constructor(inner: FetchTransport, opts: { apiKey?: string; accessToken?: string; baseUrl?: string }) {
    this.inner = inner;
    this.apiKey = opts.apiKey;
    this.accessToken = opts.accessToken;
    this.baseUrl = opts.baseUrl ?? 'https://api.individual.githubcopilot.com';
  }

  private async exchangeToken(signal?: AbortSignal): Promise<void> {
    if (!this.accessToken) return;
    if (typeof fetch !== 'function') throw new Error('Global fetch not available for token exchange');
    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'user-agent': 'GitHubCopilotChat/0.33.1',
        'editor-version': 'vscode/1.106.1',
        'x-github-api-version': '2025-10-01',
        accept: 'application/json',
      },
      signal,
    });
    if (!res.ok) {
      // Fallback: use access token directly as API key
      this.apiKey = this.accessToken;
      return;
    }
    const data = (await res.json()) as TokenExchangeResponse;
    this.apiKey = data?.token || this.accessToken;
    // Store the dynamic API endpoint from token response
    if (data?.endpoints?.api) {
      this.dynamicApiUrl = data.endpoints.api;
    }
  }

  private buildFullUrl(path: string): string {
    // If path is relative, prepend the base URL (dynamic or fallback)
    if (path.startsWith('/')) {
      const apiUrl = this.dynamicApiUrl ?? this.baseUrl;
      return `${apiUrl}${path}`;
    }
    // If path is already a full URL, return as-is
    return path;
  }

  private hasVisionPayload(body?: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    if (!('messages' in body)) return false;
    const messages = body as { messages: ChatMessage[] };
    if (!Array.isArray(messages.messages)) return false;
    return messages.messages.some((msg) => isVisionMessage(msg));
  }

  private makeAuthHeaders(headers?: HttpHeaders, body?: unknown): HttpHeaders {
    const base: HttpHeaders = headers ? { ...headers } : {};
    if (this.apiKey) base.Authorization = `Bearer ${this.apiKey}`;
    // Inject standard Copilot headers for Copilot API host
    // Check against dynamic API URL if available, fallback to known copilot domains

    base['editor-version'] = base['editor-version'] || 'vscode/1.104.2';
    base['editor-plugin-version'] = base['editor-plugin-version'] || 'copilot-chat/0.31.3';
    // base['user-agent'] = base['user-agent'] || 'GithubCopilot/1.330.0';

    // Add X-Initiator header for billing/metering
    const initiator = this.determineInitiator(body);
    base['X-Initiator'] = initiator;

    // Add X-Request-Id for tracing and idempotency
    base['X-Request-Id'] = this.generateRequestId();

    if (this.hasVisionPayload(body)) {
      base['Copilot-Vision-Request'] = 'true';
    }

    return base;
  }

  private determineInitiator(body?: unknown): 'user' | 'agent' {
    // Check if body contains messages to determine context
    if (body && typeof body === 'object' && 'messages' in body) {
      const messages = body as { messages: ChatMessage[] };
      if (Array.isArray(messages.messages) && messages.messages.length > 0) {
        const lastMessage = messages.messages[messages.messages.length - 1];
        // If the last message is from the user, this is likely a user-initiated request
        // Otherwise, it's likely an agent follow-up (tool calls, internal processing, etc.)
        return lastMessage?.role === 'user' ? 'user' : 'agent';
      }
    }

    // Default to 'agent' for safety (won't count against user premium requests)
    return 'agent';
  }

  private generateRequestId(): string {
    // Use crypto.randomUUID if available (Node.js 14.17+, modern browsers)
    if (crypto?.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback: RFC4122-ish v4 UUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async post(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<Response> {
    if (!this.apiKey && this.accessToken) {
      await this.exchangeToken(signal);
    }

    const fullUrl = this.buildFullUrl(url);
    let res = await this.inner.post(fullUrl, body, this.makeAuthHeaders(headers, body), signal);
    if (res.status === 401 && this.accessToken) {
      await this.exchangeToken(signal);
      const retryUrl = this.buildFullUrl(url);
      res = await this.inner.post(retryUrl, body, this.makeAuthHeaders(headers, body), signal);
    }
    return res;
  }

  async get(url: string, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse> {
    if (!this.apiKey && this.accessToken) {
      await this.exchangeToken(signal);
    }

    const fullUrl = this.buildFullUrl(url);
    let res = await this.inner.get(fullUrl, this.makeAuthHeaders(headers), signal);
    if (res.status === 401 && this.accessToken) {
      await this.exchangeToken(signal);
      const retryUrl = this.buildFullUrl(url);
      res = await this.inner.get(retryUrl, this.makeAuthHeaders(headers), signal);
    }
    return res;
  }
}
