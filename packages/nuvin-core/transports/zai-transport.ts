import type { FetchTransport } from './transport.js';
import { BaseBearerAuthTransport } from './base-bearer-auth-transport.js';

export class ZAIAuthTransport extends BaseBearerAuthTransport {
  protected getDefaultBaseUrl(): string {
    return 'https://api.z.ai/api/coding/paas/v4';
  }
}
