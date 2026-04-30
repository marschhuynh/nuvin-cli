import { StringDecoder } from 'node:string_decoder';
import type { EventPort } from '../ports.js';
import { AgentEventTypes } from '../ports.js';
import { resolveBackspaces, resolveCarriageReturns, stripAnsiAndControls } from '../string-utils.js';

export type StreamingThrottleOptions = {
  eventPort: EventPort;
  conversationId: string;
  messageId: string;
  toolCallId: string;
  intervalMs?: number;
  maxWindowLines?: number;
};

/**
 * Accumulates tool output text and emits ToolOutputChunk events at a throttled rate.
 * Keeps a rolling window of the last N lines for the event payload.
 * The caller remains responsible for the full output buffer.
 */
export class StreamingThrottleBuffer {
  private lines: string[] = [];
  private pendingPartial = '';
  private totalLines = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;
  private disposed = false;
  private decoder = new StringDecoder('utf8');
  private pendingEvents: Array<{
    type: typeof AgentEventTypes.ToolOutputChunk;
    conversationId: string;
    messageId: string;
    toolCallId: string;
    content: string;
    totalLines: number;
  }> = [];
  private drainPromise: Promise<void> | null = null;

  private readonly intervalMs: number;
  private readonly maxWindowLines: number;
  private readonly eventPort: EventPort;
  private readonly conversationId: string;
  private readonly messageId: string;
  private readonly toolCallId: string;

  constructor(opts: StreamingThrottleOptions) {
    this.eventPort = opts.eventPort;
    this.conversationId = opts.conversationId;
    this.messageId = opts.messageId;
    this.toolCallId = opts.toolCallId;
    this.intervalMs = opts.intervalMs ?? 50;
    this.maxWindowLines = opts.maxWindowLines ?? 5;

    this.timer = setInterval(() => this.flush(), this.intervalMs);
  }

  /** Push a raw chunk from stdout/stderr */
  push(chunk: Buffer | string): void {
    if (this.disposed) return;
    const rawText = typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    const combined = this.pendingPartial + rawText;
    const withLfNewlines = combined.replace(/\r\n/g, '\n');
    const sanitized = stripAnsiAndControls(resolveBackspaces(resolveCarriageReturns(withLfNewlines)));

    // Split into lines, keeping partial line tracking
    const parts = sanitized.split('\n');
    this.pendingPartial = parts.pop() ?? '';

    // Each element in parts is a complete line
    for (const line of parts) {
      this.lines.push(line);
      this.totalLines++;
    }

    // Only keep the rolling window + some margin to avoid excessive array ops
    if (this.lines.length > this.maxWindowLines * 3) {
      this.lines = this.lines.slice(-this.maxWindowLines);
    }

    this.dirty = true;
  }

  /** Force-flush any pending content and stop the timer. Call once on process exit. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const decoderRemainder = this.decoder.end();
    if (decoderRemainder) {
      this.pendingPartial += decoderRemainder;
      this.dirty = true;
    }

    // Count any remaining partial line
    if (this.pendingPartial) {
      this.lines.push(this.pendingPartial);
      this.totalLines++;
      this.pendingPartial = '';
    }

    if (this.dirty) {
      this.flush();
    }

    while (this.drainPromise) {
      await this.drainPromise;
    }
  }

  private flush(): void {
    if (!this.dirty || (this.disposed && this.totalLines === 0)) return;
    this.dirty = false;

    const windowLines = this.lines.slice(-this.maxWindowLines);
    const content = windowLines.join('\n');

    const nextEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: this.conversationId,
      messageId: this.messageId,
      toolCallId: this.toolCallId,
      content,
      totalLines: this.totalLines,
    };

    // Under backpressure, only keep the latest snapshot since older ones are stale.
    if (this.pendingEvents.length === 0) {
      this.pendingEvents.push(nextEvent);
    } else {
      this.pendingEvents[this.pendingEvents.length - 1] = nextEvent;
    }

    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.drainPromise) return;

    const run = async () => {
      while (this.pendingEvents.length > 0) {
        const event = this.pendingEvents.shift();
        if (!event) continue;
        try {
          const maybePromise = this.eventPort.emit(event);
          if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
            await maybePromise;
          }
        } catch {
          // Display-only events must never block or crash tool execution
        }
      }
    };

    this.drainPromise = run().finally(() => {
      this.drainPromise = null;
      if (this.pendingEvents.length > 0) {
        this.scheduleDrain();
      }
    });
  }
}
