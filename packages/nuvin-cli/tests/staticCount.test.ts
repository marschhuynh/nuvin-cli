import { describe, it, expect } from 'vitest';
import { calculateStaticCount } from '@/utils/staticCount.js';
import type { MessageLine } from '@/adapters/index.js';

function createMessage(overrides: Partial<MessageLine> = {}): MessageLine {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    type: 'assistant',
    content: 'test content',
    ...overrides,
  };
}

describe('calculateStaticCount', () => {
  it('should return 0 for empty messages array', () => {
    expect(calculateStaticCount([])).toBe(0);
  });

  it('should return full length when no streaming or pending messages', () => {
    const messages = [
      createMessage({ type: 'user' }),
      createMessage({ type: 'assistant' }),
      createMessage({ type: 'user' }),
    ];
    expect(calculateStaticCount(messages)).toBe(3);
  });

  it('should keep streaming message dynamic when it is the last non-transient', () => {
    const messages = [
      createMessage({ type: 'user' }),
      createMessage({ type: 'assistant' }),
      createMessage({ type: 'assistant', metadata: { isStreaming: true } }),
    ];
    expect(calculateStaticCount(messages)).toBe(2);
  });

  it('should keep pending tool call and everything after it dynamic', () => {
    const messages = [
      createMessage({ type: 'user' }),
      createMessage({
        type: 'tool',
        metadata: {
          toolCalls: [{ id: 'call-1', name: 'test', args: {} }],
        },
      }),
      createMessage({ type: 'assistant' }),
    ];
    expect(calculateStaticCount(messages)).toBe(1);
  });

  it('should make tool call static when all results are received', () => {
    const toolResultsByCallId = new Map<string, MessageLine>();
    toolResultsByCallId.set('call-1', createMessage({ type: 'tool_result' }));

    const messages = [
      createMessage({ type: 'user' }),
      createMessage({
        type: 'tool',
        metadata: {
          toolCalls: [{ id: 'call-1', name: 'test', args: {} }],
          toolResultsByCallId,
        },
      }),
      createMessage({ type: 'assistant' }),
    ];
    expect(calculateStaticCount(messages)).toBe(3);
  });

  it('should skip transient messages in scan but include them in output', () => {
    const messages = [
      createMessage({ type: 'user' }),
      createMessage({ type: 'assistant' }),
      createMessage({ type: 'info', metadata: { isTransient: true } }),
    ];
    expect(calculateStaticCount(messages)).toBe(3);
  });

  it('should find streaming message even with transient messages after it', () => {
    const messages = [
      createMessage({ type: 'user' }),
      createMessage({ type: 'assistant', metadata: { isStreaming: true } }),
      createMessage({ type: 'info', metadata: { isTransient: true } }),
      createMessage({ type: 'info', metadata: { isTransient: true } }),
    ];
    expect(calculateStaticCount(messages)).toBe(1);
  });

  it('should handle tool call with empty toolCalls array as static', () => {
    const messages = [
      createMessage({ type: 'user' }),
      createMessage({
        type: 'tool',
        metadata: { toolCalls: [] },
      }),
    ];
    expect(calculateStaticCount(messages)).toBe(2);
  });

  it('should handle tool call with partial results as pending', () => {
    const toolResultsByCallId = new Map<string, MessageLine>();
    toolResultsByCallId.set('call-1', createMessage({ type: 'tool_result' }));

    const messages = [
      createMessage({ type: 'user' }),
      createMessage({
        type: 'tool',
        metadata: {
          toolCalls: [
            { id: 'call-1', name: 'test1', args: {} },
            { id: 'call-2', name: 'test2', args: {} },
          ],
          toolResultsByCallId,
        },
      }),
    ];
    expect(calculateStaticCount(messages)).toBe(1);
  });

  it('should handle non-tool message types without metadata', () => {
    const messages = [
      createMessage({ type: 'user', metadata: undefined }),
      createMessage({ type: 'assistant', metadata: undefined }),
    ];
    expect(calculateStaticCount(messages)).toBe(2);
  });

  it('should return 0 when first message is streaming', () => {
    const messages = [createMessage({ type: 'assistant', metadata: { isStreaming: true } })];
    expect(calculateStaticCount(messages)).toBe(0);
  });

  it('should ignore stale isStreaming=true if message is not the last non-transient', () => {
    const messages = [
      createMessage({ type: 'user' }),
      createMessage({ type: 'assistant', metadata: { isStreaming: true } }),
      createMessage({ type: 'error', content: 'error: terminated' }),
    ];
    expect(calculateStaticCount(messages)).toBe(3);
  });

  it('should ignore stale isStreaming=true even with transient messages after error', () => {
    const messages = [
      createMessage({ type: 'user' }),
      createMessage({ type: 'assistant', metadata: { isStreaming: true } }),
      createMessage({ type: 'error', content: 'error: terminated' }),
      createMessage({ type: 'info', metadata: { isTransient: true } }),
    ];
    expect(calculateStaticCount(messages)).toBe(4);
  });

  it('should still detect streaming if only transient messages follow', () => {
    const messages = [
      createMessage({ type: 'user' }),
      createMessage({ type: 'assistant', metadata: { isStreaming: true } }),
      createMessage({ type: 'info', metadata: { isTransient: true } }),
    ];
    expect(calculateStaticCount(messages)).toBe(1);
  });
});
