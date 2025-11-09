import * as crypto from 'node:crypto';
import { NetworkLogger, type PersistOptions } from '../logger/network.js';

export type HttpHeaders = Record<string, string>;

export interface TransportResponse {
  ok: boolean;
  status: number;
  json<T>(): Promise<T>;
  text(): Promise<string>;
}

export interface HttpTransport {
  get(url: string, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse>;
  postJson(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse>;
  postStream(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<Response>;
}

export class FetchTransport implements HttpTransport {
  private logger: NetworkLogger;

  constructor(private opts: PersistOptions = {}) {
    this.logger = new NetworkLogger(this.opts);
  }

  private getRequestSize(body: unknown): number {
    if (!body) return 0;
    return new TextEncoder().encode(JSON.stringify(body)).length;
  }

  private getResponseSize(headers: Headers): number {
    const contentLength = headers.get('content-length');
    return contentLength ? parseInt(contentLength, 10) : 0;
  }

  private headersToRecord(headers: Headers): Record<string, string> {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  async get(url: string, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse> {
    if (typeof fetch !== 'function') {
      throw new Error('Global fetch is not available. Use Node 18+ or a compatible runtime.');
    }

    const startTime = performance.now();

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { ...(headers || {}) },
        signal,
      });

      const ttfb = performance.now() - startTime;

      try {
        const clone = res.clone();
        const text = await clone.text();
        let response: unknown;
        try {
          response = JSON.parse(text);
        } catch {
          response = text;
        }

        const duration = performance.now() - startTime;

        await this.logger.logRequest({
          url,
          method: 'GET',
          headers: { ...(headers || {}) },
          responseStatus: res.status,
          responseHeaders: this.headersToRecord(res.headers),
          ok: res.ok,
          stream: false,
          startTime,
          duration,
          ttfb,
          requestSize: 0,
          responseSize: this.getResponseSize(res.headers),
          response,
        });
      } catch {}

      return res;
    } catch (error) {
      const duration = performance.now() - startTime;

      await this.logger.logRequest({
        url,
        method: 'GET',
        headers: { ...(headers || {}) },
        responseStatus: 0,
        ok: false,
        stream: false,
        startTime,
        duration,
        requestSize: 0,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  async postJson(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<TransportResponse> {
    if (typeof fetch !== 'function') {
      throw new Error('Global fetch is not available. Use Node 18+ or a compatible runtime.');
    }

    const startTime = performance.now();
    const reqBody = JSON.stringify(body ?? {});

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
        body: reqBody,
        signal,
      });

      const ttfb = performance.now() - startTime;

      // Log request/response (non-streaming)
      try {
        const clone = res.clone();
        const text = await clone.text();
        let response: unknown;
        try {
          response = JSON.parse(text);
        } catch {
          response = text;
        }

        const duration = performance.now() - startTime;

        await this.logger.logRequest({
          url,
          method: 'POST',
          headers: { ...(headers || {}) },
          requestBody: body,
          responseStatus: res.status,
          responseHeaders: this.headersToRecord(res.headers),
          ok: res.ok,
          stream: false,
          startTime,
          duration,
          ttfb,
          requestSize: this.getRequestSize(body),
          responseSize: this.getResponseSize(res.headers),
          response,
        });
      } catch {
        // ignore persistence failures
      }

      return res;
    } catch (error) {
      const duration = performance.now() - startTime;

      await this.logger.logRequest({
        url,
        method: 'POST',
        headers: { ...(headers || {}) },
        requestBody: body,
        responseStatus: 0,
        ok: false,
        stream: false,
        startTime,
        duration,
        requestSize: this.getRequestSize(body),
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }
  async postStream(url: string, body: unknown, headers?: HttpHeaders, signal?: AbortSignal): Promise<Response> {
    if (typeof fetch !== 'function') {
      throw new Error('Global fetch is not available. Use Node 18+ or a compatible runtime.');
    }

    const startTime = performance.now();
    const reqBody = JSON.stringify(body ?? {});

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
        body: reqBody,
        signal,
      });

      const ttfb = performance.now() - startTime;
      const duration = performance.now() - startTime;

      // Prepare log entry for stream
      const logEntryData = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        timestamp: Date.now().toString(),
        url,
        method: 'POST' as const,
        headers: { ...(headers || {}) },
        requestBody: body,
        responseStatus: res.status,
        responseHeaders: this.headersToRecord(res.headers),
        ok: res.ok,
        stream: true,
        startTime,
        duration,
        ttfb,
        requestSize: this.getRequestSize(body),
        responseSize: this.getResponseSize(res.headers),
      };

      // Log stream metadata (initial log without SSE events)
      void this.logger.logRequest(logEntryData);

      // Return tapped stream - will log SSE events when stream completes
      return this.logger.createStreamTapper(res, logEntryData);
    } catch (error) {
      const duration = performance.now() - startTime;

      await this.logger.logRequest({
        url,
        method: 'POST',
        headers: { ...(headers || {}) },
        requestBody: body,
        responseStatus: 0,
        ok: false,
        stream: true,
        startTime,
        duration,
        requestSize: this.getRequestSize(body),
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }
}
