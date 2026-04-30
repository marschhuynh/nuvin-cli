import type { FetchTransport } from './transport.js';
import { BaseBearerAuthTransport } from './base-bearer-auth-transport.js';

export class SimpleBearerAuthTransport extends BaseBearerAuthTransport {
  private readonly defaultUrl: string;

  constructor(inner: FetchTransport, defaultBaseUrl: string, apiKey?: string, baseUrl?: string, version?: string, customHeaders?: Record<string, string>) {
    super(inner, apiKey, baseUrl ?? defaultBaseUrl, version, customHeaders);
    this.defaultUrl = defaultBaseUrl;
  }

  protected getDefaultBaseUrl(): string {
    return this.defaultUrl;
  }
}
