export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogFormat = 'json' | 'structured';

export type PersistOptions = {
  persistFile?: string;
  logLevel?: LogLevel;
  logFormat?: LogFormat;
  maxFileSize?: number;
  enableConsoleLog?: boolean;
  captureResponseBody?: boolean;
};

interface LogEntry {
  id: string;
  timestamp: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  requestBody?: unknown;
  responseStatus: number;
  responseHeaders?: Record<string, string>;
  ok: boolean;
  stream: boolean;
  startTime: number;
  duration?: number;
  ttfb?: number; // Time to first byte
  requestSize: number;
  responseSize?: number;
  response?: unknown;
  sseEvents?: SSEEvent[];
  error?: string;
}

interface SSEEvent {
  timestamp: string;
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export class NetworkLogger {
  constructor(private opts: PersistOptions = {}) {}

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async appendToLogFile(entry: LogEntry): Promise<void> {
    if (!this.opts.persistFile) return;

    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      const file = this.opts.persistFile;
      const dir = path.dirname(file);

      // Ensure directory exists
      if (dir && dir !== '.') {
        try {
          await fs.mkdir(dir, { recursive: true });
        } catch {
          // Directory might already exist
        }
      }

      const logLine = this.formatLogEntry(entry);
      await fs.appendFile(file, `${logLine}\n`, 'utf-8');

      // Check file size for rotation
      if (this.opts.maxFileSize) {
        const stats = await fs.stat(file);
        if (stats.size > this.opts.maxFileSize) {
          await this.rotateLogFile(file);
        }
      }
    } catch (error) {
      // Best effort logging - don't throw
      if (this.opts.enableConsoleLog) {
        console.warn('Failed to write to log file:', error);
      }
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    if (this.opts.logFormat === 'structured') {
      const { timestamp, method, url, responseStatus, duration, stream } = entry;
      return `[${timestamp}] ${method} ${url} ${responseStatus} ${duration || '?'}ms ${stream ? '(stream)' : ''}`;
    }
    return JSON.stringify(entry);
  }

  private async rotateLogFile(file: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const rotatedFile = `${file}.${Date.now()}`;
      await fs.rename(file, rotatedFile);
    } catch {
      // Best effort rotation
    }
  }

  private logToConsole(entry: LogEntry): void {
    if (!this.opts.enableConsoleLog) return;

    const { method, url, responseStatus, duration, stream } = entry;
    const message = `${method} ${url} ${responseStatus} ${duration || '?'}ms${stream ? ' (stream)' : ''}`;

    if (entry.error) {
      console.error(message, entry.error);
    } else if (responseStatus >= 400) {
      console.warn(message);
    } else {
      console.info(message);
    }
  }

  async logRequest(entry: Omit<LogEntry, 'id' | 'timestamp'>): Promise<void> {
    const logEntry: LogEntry = {
      id: this.generateRequestId(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.logToConsole(logEntry);
    await this.appendToLogFile(logEntry);
  }

  createStreamTapper(response: Response, logEntry: Omit<LogEntry, 'sseEvents'>): Response {
    if (!response.body || !this.opts.captureResponseBody) {
      return response;
    }

    const reader = response.body.getReader();
    const tappedStream = this.parseSSEStreamWithLogging(reader, logEntry);

    return new Response(tappedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  private parseSSEStreamWithLogging(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    logEntry: Omit<LogEntry, 'sseEvents'>,
  ): ReadableStream<Uint8Array> {
    const events: SSEEvent[] = [];
    let buffer = '';
    const self = this;

    return new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Forward the chunk to the consumer
            controller.enqueue(value);

            // Parse SSE events for logging
            const chunk = new TextDecoder().decode(value);
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            let currentEvent: Partial<SSEEvent> = {};

            for (const line of lines) {
              if (line.trim() === '') {
                // Empty line indicates end of event
                if (currentEvent.data !== undefined) {
                  events.push({
                    timestamp: new Date().toISOString(),
                    ...currentEvent,
                  } as SSEEvent);
                }
                currentEvent = {};
              } else if (line.startsWith('data: ')) {
                const data = line.slice(6);
                currentEvent.data = currentEvent.data ? `${currentEvent.data}\n${data}` : data;
              } else if (line.startsWith('event: ')) {
                currentEvent.event = line.slice(7);
              } else if (line.startsWith('id: ')) {
                currentEvent.id = line.slice(4);
              } else if (line.startsWith('retry: ')) {
                currentEvent.retry = parseInt(line.slice(7), 10);
              }
            }
          }

          // Log the final entry with collected SSE events
          if (events.length > 0) {
            await self.logRequest({
              ...logEntry,
              sseEvents: events,
            });
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });
  }
}
