import { describe, it, expect } from 'vitest';
import type { MessageLine } from '../source/adapters/index.js';
import { mergeToolCallsWithResultsCached, type MergeCache } from '../source/components/ChatDisplay.js';

function makeToolMsg(id: string, callIds: string[]): MessageLine {
  return {
    id,
    type: 'tool',
    content: callIds.join(', '),
    metadata: {
      toolCalls: callIds.map((cid) => ({
        id: cid,
        type: 'function' as const,
        function: { name: `tool_${cid}`, arguments: '{}' },
      })),
    },
  };
}

function makeToolResult(id: string, callId: string, status: 'success' | 'error' = 'success'): MessageLine {
  return {
    id,
    type: 'tool_result',
    content: `result for ${callId}`,
    metadata: {
      toolResult: {
        id: callId,
        name: `tool_${callId}`,
        status,
        type: 'text',
        result: `result for ${callId}`,
      },
      duration: 100,
    },
  };
}

describe('mergeToolCallsWithResultsCached - ID Stability', () => {
  it('should use stable id without postfix when no results yet', () => {
    const cache: MergeCache = new Map();
    const messages: MessageLine[] = [makeToolMsg('t1', ['call-1'])];

    const merged = mergeToolCallsWithResultsCached(messages, cache);

    const toolMsg = merged.find((m) => m.type === 'tool');
    expect(toolMsg?.id).toBe('t1');
  });

  it('should use stable id without postfix when all results present', () => {
    const cache: MergeCache = new Map();
    const messages: MessageLine[] = [makeToolMsg('t1', ['call-1']), makeToolResult('r1', 'call-1')];

    const merged = mergeToolCallsWithResultsCached(messages, cache);

    const toolMsg = merged.find((m) => m.type === 'tool');
    expect(toolMsg?.id).toBe('t1');
  });

  it('should use stable id when only partial results', () => {
    const cache: MergeCache = new Map();
    const messages: MessageLine[] = [
      makeToolMsg('t1', ['call-1', 'call-2']),
      makeToolResult('r1', 'call-1'),
    ];

    const merged = mergeToolCallsWithResultsCached(messages, cache);

    const toolMsg = merged.find((m) => m.type === 'tool');
    expect(toolMsg?.id).toBe('t1');
  });

  it('should use stable id when all multiple results arrive', () => {
    const cache: MergeCache = new Map();
    const messages: MessageLine[] = [
      makeToolMsg('t1', ['call-1', 'call-2']),
      makeToolResult('r1', 'call-1'),
      makeToolResult('r2', 'call-2'),
    ];

    const merged = mergeToolCallsWithResultsCached(messages, cache);

    const toolMsg = merged.find((m) => m.type === 'tool');
    expect(toolMsg?.id).toBe('t1');
  });

  it('should not modify non-tool message ids', () => {
    const cache: MergeCache = new Map();
    const messages: MessageLine[] = [
      { id: 'u1', type: 'user', content: 'hello' },
      { id: 'a1', type: 'assistant', content: 'hi' },
    ];

    const merged = mergeToolCallsWithResultsCached(messages, cache);

    expect(merged[0].id).toBe('u1');
    expect(merged[1].id).toBe('a1');
  });

  it('should use same id between streaming and completed for same tool', () => {
    const cache: MergeCache = new Map();

    // First call: streaming (no results)
    const streamingMessages: MessageLine[] = [makeToolMsg('t1', ['call-1'])];
    const streaming = mergeToolCallsWithResultsCached(streamingMessages, cache);

    // Second call: completed (result arrived)
    const completedMessages: MessageLine[] = [makeToolMsg('t1', ['call-1']), makeToolResult('r1', 'call-1')];
    const completed = mergeToolCallsWithResultsCached(completedMessages, cache);

    const streamingTool = streaming.find((m) => m.type === 'tool');
    const completedTool = completed.find((m) => m.type === 'tool');

    expect(streamingTool?.id).toBe('t1');
    expect(completedTool?.id).toBe('t1');
    expect(streamingTool?.id).toBe(completedTool?.id);
  });

  it('should use stable ids for multiple tool call groups', () => {
    const cache: MergeCache = new Map();
    const messages: MessageLine[] = [
      makeToolMsg('t1', ['call-a']),
      makeToolResult('r-a', 'call-a'),
      { id: 'a1', type: 'assistant', content: 'middle' },
      makeToolMsg('t2', ['call-b']),
      // t2 has no result
    ];

    const merged = mergeToolCallsWithResultsCached(messages, cache);

    const tools = merged.filter((m) => m.type === 'tool');
    expect(tools[0].id).toBe('t1');
    expect(tools[1].id).toBe('t2');
  });

  it('should properly clean up cache when tool messages are removed', () => {
    const cache: MergeCache = new Map();

    // First call with tool
    const messages1: MessageLine[] = [
      makeToolMsg('t1', ['call-1']),
      makeToolResult('r1', 'call-1'),
    ];
    mergeToolCallsWithResultsCached(messages1, cache);
    expect(cache.size).toBe(1);
    expect(cache.has('t1')).toBe(true);

    // Second call without that tool
    const messages2: MessageLine[] = [{ id: 'u1', type: 'user', content: 'hello' }];
    mergeToolCallsWithResultsCached(messages2, cache);
    expect(cache.size).toBe(0);
  });

  it('partial-result tool message goes to the bottom (after other messages)', () => {
    const cache: MergeCache = new Map();
    const messages: MessageLine[] = [
      makeToolMsg('t1', ['call-1', 'call-2']),
      makeToolResult('r1', 'call-1'), // only call-1 done, call-2 still running
      { id: 'a1', type: 'assistant', content: 'later message' },
    ];

    const merged = mergeToolCallsWithResultsCached(messages, cache);

    // The assistant message should appear before the running tool message
    const assistantIndex = merged.findIndex((m) => m.id === 'a1');
    const toolIndex = merged.findIndex((m) => m.type === 'tool');
    expect(toolIndex).toBeGreaterThan(assistantIndex);
    // The tool message ID should be stable (no status suffix)
    expect(merged[toolIndex].id).toBe('t1');
  });

  it('partial-result tool message includes completed results in toolResultsByCallId', () => {
    const cache: MergeCache = new Map();
    const messages: MessageLine[] = [
      makeToolMsg('t1', ['call-1', 'call-2']),
      makeToolResult('r1', 'call-1'), // call-1 done
      // call-2 still running
    ];

    const merged = mergeToolCallsWithResultsCached(messages, cache);

    const toolMsg = merged.find((m) => m.type === 'tool');
    const resultsByCallId = toolMsg?.metadata?.toolResultsByCallId as Map<string, MessageLine> | undefined;
    // The completed call-1 result should be available for rendering
    expect(resultsByCallId?.has('call-1')).toBe(true);
    expect(resultsByCallId?.has('call-2')).toBe(false);
  });
});
