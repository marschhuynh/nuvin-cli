import { smartFetch } from '@/lib/fetch-proxy';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export class StreamableHTTPClientTransportWithProxy extends StreamableHTTPClientTransport {
  constructor(url: URL, options?: { requestInit?: RequestInit }) {
    super(url, {
      ...options,
      requestInit: {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        ...options?.requestInit,
      },
      fetch: StreamableHTTPClientTransportWithProxy.createProxyFetch(),
    });
  }

  private static createProxyFetch(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {

      const response = await smartFetch(input, {
        ...init,
        stream: true,
      });

      return response;
    };
  }
}