/**
 * Fetch proxy that routes requests through the Wails Go backend
 * This bypasses CORS restrictions and provides better error handling
 */

import { FetchProxy } from '../../wailsjs/go/main/App';
import { LogInfo, LogError } from '@wails/runtime';

// Types for the Go backend
interface FetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface FetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  ok: boolean;
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

  constructor(bodyText: string, init: ResponseInit & { url: string }) {
    this._bodyText = bodyText;
    this.status = init.status || 200;
    this.statusText = init.statusText || 'OK';
    this.ok = this.status >= 200 && this.status < 300;
    this.url = init.url;

    // Convert headers object to Headers instance
    this.headers = new Headers(init.headers);

    // Create a ReadableStream from the body text
    this.body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bodyText));
        controller.close();
      }
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
      url: this.url
    });
  }
}

/**
 * Fetch implementation that uses the Go backend proxy
 */
export async function fetchProxy(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Convert input to URL string
  const url = typeof input === 'string' ? input :
              input instanceof URL ? input.toString() :
              input.url;

  // Extract request details
  const method = init?.method || 'GET';
  const headers: Record<string, string> = {};

  // Convert headers to simple object
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
    body
  };

  LogInfo(`Fetch proxy: ${method.toUpperCase()} ${url}`);

  try {
    // Call Go backend
    const response: FetchResponse = await FetchProxy(fetchRequest);

    // Handle Go backend errors
    if (response.error) {
      LogError(`Fetch proxy error: ${response.error}`);
      throw new Error(`Network error: ${response.error}`);
    }

    // Create Response object
    return new ProxyResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      url
    });

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
  (globalObj as any).fetch = fetchProxy;
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
 * Check if we're running in a Wails environment
 */
export function isWailsEnvironment(): boolean {
  return typeof window !== 'undefined' &&
         typeof (window as any).go !== 'undefined' &&
         typeof (window as any).go.main !== 'undefined';
}

/**
 * Smart fetch that uses proxy in Wails environment, regular fetch otherwise
 */
export async function smartFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetchProxy(input, init);
  // if (isWailsEnvironment()) {
  // } else {
  //   return fetch(input, init);
  // }
}