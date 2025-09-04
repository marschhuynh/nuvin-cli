/**
 * Fetch proxy that routes requests through the Wails Go backend
 * This bypasses CORS restrictions and provides better error handling
 */

import { FetchProxy as HTTPProxyFetchProxy } from '@wails/services/httpproxyservice';
import { LogInfo, LogError, EventsOn, EventsOff, isWailsEnvironment } from './browser-runtime';

const SERVER_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';

// Preserve a reference to the platform's original fetch implementation so we
// can call it directly when proxying through the standalone Gin server. This
// avoids infinite recursion if global fetch has been replaced with our
// smartFetch helper.
const nativeFetch = globalThis.fetch.bind(globalThis);

// Types for the Go backend
interface FetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  stream?: boolean;
  timeout?: number; // seconds
}

interface FetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  ok: boolean;
  error?: string;
  streamId?: string;
}

interface StreamChunk {
  streamId: string;
  data: string;
  done: boolean;
  error?: string;
}

/**
 * Custom Response class that mimics the standard fetch Response
 */
class ProxyResponse implements Response {
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
  readonly redirected: boolean = false;
  readonly type: ResponseType = 'basic';
  readonly url: string;

  private _bodyText: string;
  private _bodyUsed: boolean = false;

  constructor(bodyText: string, init: ResponseInit & { url: string }, streamId?: string) {
    this._bodyText = bodyText;
    this.status = init.status || 200;
    this.statusText = init.statusText || 'OK';
    this.ok = this.status >= 200 && this.status < 300;
    this.url = init.url;

    // Convert headers object to Headers instance
    this.headers = new Headers(init.headers);

    // Create a ReadableStream - streaming or immediate
    if (streamId) {
      this.body = this.createStreamingBody(streamId);
    } else {
      this.body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(bodyText));
          controller.close();
        },
      });
    }
  }

  private createStreamingBody(streamId: string): ReadableStream<Uint8Array> {
    console.log(`[${streamId.substring(0, 8)}] Creating streaming body`);
    return new ReadableStream({
      start(controller) {
        let buffer = '';
        console.log(`[${streamId.substring(0, 8)}] Stream started, listening for chunks`);

        const eventName = `fetch-stream-chunk:${streamId}`;
        const handleChunk = (raw: any) => {
          // Handle case where raw is an array containing the chunk data
          const chunkData = Array.isArray(raw) ? raw[0] : raw;
          // Normalize possible casing from Go -> JS bridge
          const chunk: StreamChunk = {
            streamId: chunkData?.streamId ?? chunkData?.StreamID ?? chunkData?.streamID,
            data: chunkData?.data ?? chunkData?.Data,
            done: chunkData?.done ?? chunkData?.Done,
            error: chunkData?.error ?? chunkData?.Error,
          };

          if (chunk.streamId !== streamId) return;

          console.log(`[${streamId.substring(0, 8)}] Received chunk:`, {
            size: chunk.data?.length || 0,
            done: chunk.done,
            error: chunk.error,
            data: chunk.data?.substring(0, 100) + (chunk.data && chunk.data.length > 100 ? '...' : ''),
          });

          if (chunk.error) {
            console.error(`[${streamId.substring(0, 8)}] Stream error:`, chunk.error);
            controller.error(new Error(chunk.error));
            EventsOff(eventName);
            return;
          }

          if (chunk.data) {
            buffer += chunk.data;
            try {
              controller.enqueue(new TextEncoder().encode(chunk.data));
              console.log(
                `[${streamId.substring(0, 8)}] Enqueued ${chunk.data.length} bytes, total buffer: ${buffer.length} bytes`,
              );
            } catch (error) {
              console.warn(`[${streamId.substring(0, 8)}] Failed to enqueue chunk (stream may be closed):`, error);
              // Stream might be closed, but we still need to process the data
              // The data is already added to buffer above
            }
          }

          if (chunk.done) {
            console.log(`[${streamId.substring(0, 8)}] Stream completed, total: ${buffer.length} bytes`);
            try {
              controller.close();
            } catch (error) {
              console.warn(`[${streamId.substring(0, 8)}] Failed to close stream (may already be closed):`, error);
            }
            EventsOff(eventName);
          }
        };

        EventsOn(eventName, handleChunk);
        console.log(`[${streamId.substring(0, 8)}] Event listener registered for '${eventName}'`);
      },

      cancel() {
        const eventName = `fetch-stream-chunk:${streamId}`;
        console.log(`[${streamId.substring(0, 8)}] Cancelling stream, removing event listener`);
        EventsOff(eventName);
      },
    });
  }
  bytes(): Promise<Uint8Array> {
    throw new Error('Method not implemented.');
  }

  get bodyUsed(): boolean {
    return this._bodyUsed;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this._bodyUsed) {
      throw new TypeError('Body has already been consumed');
    }
    this._bodyUsed = true;
    const uint8 = new TextEncoder().encode(this._bodyText);
    // Create a new ArrayBuffer and copy the data
    const buffer = new ArrayBuffer(uint8.byteLength);
    new Uint8Array(buffer).set(uint8);
    return buffer;
  }

  async blob(): Promise<Blob> {
    if (this._bodyUsed) {
      throw new TypeError('Body has already been consumed');
    }
    this._bodyUsed = true;
    return new Blob([this._bodyText]);
  }

  async formData(): Promise<FormData> {
    throw new Error('FormData parsing not implemented in proxy response');
  }

  async json(): Promise<any> {
    if (this._bodyUsed) {
      throw new TypeError('Body has already been consumed');
    }
    this._bodyUsed = true;
    try {
      return JSON.parse(this._bodyText);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error}`);
    }
  }

  async text(): Promise<string> {
    if (this._bodyUsed) {
      throw new TypeError('Body has already been consumed');
    }
    this._bodyUsed = true;
    return this._bodyText;
  }

  clone(): Response {
    if (this._bodyUsed) {
      throw new TypeError('Body has already been consumed');
    }
    return new ProxyResponse(this._bodyText, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
      url: this.url,
    });
  }
}

/**
 * Fetch implementation that uses the Go backend proxy
 */
export async function fetchProxyWails(
  input: RequestInfo | URL,
  init?: RequestInit & { stream?: boolean; timeout?: number },
  useServer = false,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  const method = init?.method || 'GET';
  const headers: Record<string, string> = {};

  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, init.headers);
    }
  }

  // Strip hop-by-hop or problematic headers that can break proxying/decompression
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'accept-encoding' || lower === 'content-length' || lower === 'connection' || lower === 'host') {
      delete headers[key];
    }
  }

  // Handle body
  let body: string | undefined;
  if (init?.body) {
    if (typeof init.body === 'string') {
      body = init.body;
    } else if (init.body instanceof FormData) {
      // Convert FormData to URL-encoded string
      const params = new URLSearchParams();
      init.body.forEach((value, key) => {
        params.append(key, value.toString());
      });
      body = params.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    } else if (init.body instanceof URLSearchParams) {
      body = init.body.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    } else {
      // Try to stringify other body types
      body = init.body.toString();
    }
  }

  // Prepare request for Go backend
  const fetchRequest: FetchRequest = {
    url,
    method: method.toUpperCase(),
    headers,
    body,
    stream: init?.stream || false,
    timeout: init?.timeout,
  };

  try {
    if (useServer) {
      const serverResponse = await nativeFetch(`${SERVER_BASE_URL}/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fetchRequest),
      });

      if (!serverResponse.ok) {
        throw new Error(`Server proxy failed: ${serverResponse.status} ${serverResponse.statusText}`);
      }

      // Server proxy now works transparently - just return the response as-is
      // The Go server relays the original response format (SSE, JSON, etc.) with CORS headers
      return serverResponse;
    } else {
      const response = await HTTPProxyFetchProxy(fetchRequest);

      if (response.error) {
        LogError(`Fetch proxy error: ${response.error}`);
        throw new Error(`Network error: ${response.error}`);
      }

      console.log('FetchProxy Wails response:', {
        status: response.status,
        hasStreamId: !!response.streamId,
        streamId: response.streamId?.substring(0, 8),
        bodyLength: response.body?.length || 0,
      });

      return new ProxyResponse(
        response.body || '',
        {
          status: response.status,
          statusText: response.statusText,
          headers: response?.headers ?? undefined,
          url,
        },
        response.streamId,
      );
    }
  } catch (error) {
    LogError(`Fetch proxy failed: ${error}`);
    throw new Error(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Replace global fetch with the proxy version
 * Call this to enable proxy for all fetch requests
 */
export function enableGlobalFetchProxy(): void {
  const globalObj = typeof window !== 'undefined' ? window : global;
  (globalObj as any).fetch = smartFetch;
  LogInfo('Global fetch proxy enabled');
}

/**
 * Restore original fetch
 */
export function disableGlobalFetchProxy(): void {
  // Note: This is a simplified implementation
  // In practice, you'd want to store the original fetch first
  LogInfo('Global fetch proxy disabled (original fetch not restored)');
}

/**
 * Smart fetch that uses proxy in Wails environment, regular fetch otherwise
 */
export async function smartFetch(
  input: RequestInfo | URL,
  init?: RequestInit & { stream?: boolean },
): Promise<Response> {
  if (isWailsEnvironment()) {
    return fetchProxyWails(input, init);
  } else {
    return fetchProxyWails(input, init, true);
  }
}

/**
 * Creates a proxyFetch function bound to a specific base URL
 * Useful for providers that always call the same API
 */
export function createProxyFetch(proxyServerUrl: string) {
  return async function boundProxyFetch(
    input: RequestInfo | URL,
    init?: RequestInit & { stream?: boolean },
  ): Promise<Response> {
    const proxyServer = proxyServerUrl || SERVER_BASE_URL;

    const originalUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const parsedUrl = new URL(originalUrl);
    const route = parsedUrl.pathname.substring(1) + (parsedUrl.search || '');

    const proxyUrl = `${proxyServer}/proxy/${route}`;

    return fetch(proxyUrl, init);
  };
}
