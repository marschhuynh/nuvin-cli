import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingThrottleBuffer } from '../src/tools/StreamingThrottleBuffer.js';
import { AgentEventTypes } from '../src/ports.js';
import type { EventPort } from '../src/ports.js';

function createMockEventPort() {
  const emitted: unknown[] = [];
  const port: EventPort = {
    emit: vi.fn((event) => {
      emitted.push(event);
    }),
  };
  return { port, emitted };
}

const baseOpts = {
  conversationId: 'conv-1',
  messageId: 'msg-1',
  toolCallId: 'tc-1',
};

describe('StreamingThrottleBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits ToolOutputChunk on flush interval', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    buffer.push('line1\nline2\n');
    expect(port.emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(port.emit).toHaveBeenCalledTimes(1);
    expect(port.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AgentEventTypes.ToolOutputChunk,
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'tc-1',
        totalLines: 2,
      }),
    );

    buffer.dispose();
  });

  it('tracks totalLines correctly across multiple pushes', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    buffer.push('a\nb\n');
    buffer.push('c\nd\ne\n');

    vi.advanceTimersByTime(50);
    expect(port.emit).toHaveBeenCalledWith(
      expect.objectContaining({ totalLines: 5 }),
    );

    buffer.dispose();
  });

  it('limits content to maxWindowLines', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({
      eventPort: port,
      ...baseOpts,
      intervalMs: 50,
      maxWindowLines: 3,
    });

    buffer.push('line1\nline2\nline3\nline4\nline5\n');

    vi.advanceTimersByTime(50);
    const call = (port.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const lines = call.content.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('line3');
    expect(lines[2]).toBe('line5');

    buffer.dispose();
  });

  it('dispose() flushes remaining content', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    buffer.push('pending\n');
    buffer.dispose();

    expect(port.emit).toHaveBeenCalledTimes(1);
    expect(port.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AgentEventTypes.ToolOutputChunk,
        totalLines: 1,
      }),
    );
  });

  it('dispose() stops the timer — no further flushes', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    buffer.push('data\n');
    buffer.dispose();
    (port.emit as ReturnType<typeof vi.fn>).mockClear();

    vi.advanceTimersByTime(200);
    expect(port.emit).not.toHaveBeenCalled();
  });

  it('does not emit when buffer is clean', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    vi.advanceTimersByTime(50);
    expect(port.emit).not.toHaveBeenCalled();

    buffer.dispose();
    expect(port.emit).not.toHaveBeenCalled();
  });

  it('throttles rapid pushes — only emits on interval', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    // Push many times within one interval
    for (let i = 0; i < 100; i++) {
      buffer.push(`line${i}\n`);
    }

    // Only 0 events so far (interval hasn't fired)
    expect(port.emit).not.toHaveBeenCalled();

    // After one interval, exactly one event
    vi.advanceTimersByTime(50);
    expect(port.emit).toHaveBeenCalledTimes(1);
    expect(port.emit).toHaveBeenCalledWith(
      expect.objectContaining({ totalLines: 100 }),
    );

    buffer.dispose();
  });

  it('coalesces pending flushes when emit is backpressured', async () => {
    let firstEmitResolved = false;
    let resolveFirstEmit: (() => void) | undefined;

    const port: EventPort = {
      emit: vi.fn(() => {
        if (!firstEmitResolved) {
          return new Promise<void>((resolve) => {
            resolveFirstEmit = () => {
              firstEmitResolved = true;
              resolve();
            };
          });
        }
        return Promise.resolve();
      }),
    };

    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 10 });

    buffer.push('line1\n');
    vi.advanceTimersByTime(10);
    expect(port.emit).toHaveBeenCalledTimes(1);

    for (let i = 2; i <= 20; i++) {
      buffer.push(`line${i}\n`);
      vi.advanceTimersByTime(10);
    }

    expect(port.emit).toHaveBeenCalledTimes(1);

    resolveFirstEmit?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(port.emit).toHaveBeenCalledTimes(2);
    const secondCall = (port.emit as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCall).toMatchObject({
      type: AgentEventTypes.ToolOutputChunk,
      totalLines: 20,
      content: 'line16\nline17\nline18\nline19\nline20',
    });

    await buffer.dispose();
  });

  it('handles partial lines correctly', async () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    buffer.push('partial');

    vi.advanceTimersByTime(50);
    // partial line doesn't count as a line yet (no newline)
    expect(port.emit).toHaveBeenCalledWith(
      expect.objectContaining({ totalLines: 0 }),
    );

    buffer.push(' end\n');

    await buffer.dispose();
    expect(port.emit).toHaveBeenCalledWith(
      expect.objectContaining({ totalLines: 1 }),
    );
  });

  it('ignores pushes after dispose', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    buffer.dispose();
    (port.emit as ReturnType<typeof vi.fn>).mockClear();

    buffer.push('after-dispose\n');
    vi.advanceTimersByTime(50);
    expect(port.emit).not.toHaveBeenCalled();
  });

  it('flushes remaining partial line on dispose', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    buffer.push('no-newline');
    buffer.dispose();

    expect(port.emit).toHaveBeenCalledTimes(1);
    expect(port.emit).toHaveBeenCalledWith(
      expect.objectContaining({ totalLines: 1, content: 'no-newline' }),
    );
  });

  it('sanitizes ANSI/control sequences and resolves carriage-return updates', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    buffer.push('\u001b[31mred\u001b[0m\rgreen\n');
    vi.advanceTimersByTime(50);

    expect(port.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'green',
        totalLines: 1,
      }),
    );
  });

  it('preserves UTF-8 characters split across buffer boundaries', () => {
    const { port } = createMockEventPort();
    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });

    // "😀\n" split in the middle of the 4-byte code point.
    buffer.push(Buffer.from([0xf0, 0x9f]));
    buffer.push(Buffer.from([0x98, 0x80, 0x0a]));
    vi.advanceTimersByTime(50);

    expect(port.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '😀',
        totalLines: 1,
      }),
    );

    buffer.dispose();
  });

  it('disposes only after queued async emits are settled', async () => {
    const resolvers: Array<() => void> = [];
    const port: EventPort = {
      emit: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    };

    const buffer = new StreamingThrottleBuffer({ eventPort: port, ...baseOpts, intervalMs: 50 });
    buffer.push('line1\n');
    vi.advanceTimersByTime(50);

    let disposed = false;
    const disposing = buffer.dispose().then(() => {
      disposed = true;
    });

    await Promise.resolve();
    expect(disposed).toBe(false);

    resolvers.forEach((resolve) => resolve());
    await disposing;
    expect(disposed).toBe(true);
  });
});
