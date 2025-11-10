import type { FetchTransport, HttpTransport } from './transport.js';
import { SimpleBearerAuthTransport } from './simple-bearer-transport.js';

export function createTransport(
  _name: string,
  inner: FetchTransport,
  defaultBaseUrl: string,
  apiKey?: string,
  baseUrl?: string,
): HttpTransport {
  return new SimpleBearerAuthTransport(inner, defaultBaseUrl, apiKey, baseUrl);
}
