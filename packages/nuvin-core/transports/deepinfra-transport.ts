import type { FetchTransport } from './transport.js';
import { BaseBearerAuthTransport } from './base-bearer-auth-transport.js';

export class DeepInfraAuthTransport extends BaseBearerAuthTransport {
  protected getDefaultBaseUrl(): string {
    return 'https://api.deepinfra.com/v1/openai';
  }
}
