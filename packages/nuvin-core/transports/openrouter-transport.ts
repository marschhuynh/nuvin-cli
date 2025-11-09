import type { FetchTransport } from './transport.js';
import { BaseBearerAuthTransport } from './base-bearer-auth-transport.js';

export class OpenRouterAuthTransport extends BaseBearerAuthTransport {
  protected getDefaultBaseUrl(): string {
    return 'https://openrouter.ai/api/v1';
  }
}
