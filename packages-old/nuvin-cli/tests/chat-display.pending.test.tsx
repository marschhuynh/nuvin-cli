import { describe, it, expect } from 'vitest';
import type { MessageLine } from '../source/adapters/index.js';

/**
 * Tests for ChatDisplay pending tool call detection
 * Verifies that pending tool calls stay in dynamic area (not static)
 */

describe('ChatDisplay - Pending Tool Call Detection', () => {
  /**
   * Helper function that mimics hasAnyPendingToolCalls from ChatDisplay
   */
  function hasAnyPendingToolCalls(msg: MessageLine): boolean {
    if (msg.type !== 'tool') return false;

    const toolCalls = msg.metadata?.toolCalls || [];
    const toolResultsByCallId = msg.metadata?.toolResultsByCallId as Map<string, MessageLine> | undefined;

    // If there are no tool calls, it's not pending
    if (toolCalls.length === 0) return false;

    // Check if any tool call doesn't have a result yet
    for (const toolCall of toolCalls) {
      const hasResult = toolResultsByCallId?.has(toolCall.id);
      if (!hasResult) {
        return true; // At least one tool call is pending
      }
    }

    return false; // All tool calls have results
  }

  it('should detect pending tool call (no results)', () => {
    const msg: MessageLine = {
      id: 'msg-1',
      type: 'tool',
      content: 'tool_call',
      metadata: {
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'test_tool', arguments: '{}' },
          },
        ],
        toolResultsByCallId: new Map(), // Empty map - no results yet
      },
    };

    expect(hasAnyPendingToolCalls(msg)).toBe(true);
  });

  it('should detect completed tool call (all results available)', () => {
    const resultMsg: MessageLine = {
      id: 'result-1',
      type: 'tool_result',
      content: 'success',
      metadata: {
        toolResult: {
          id: 'call-1',
          name: 'test_tool',
          status: 'success',
          type: 'text',
          result: 'done',
        },
        duration: 100,
      },
    };

    const toolResultsByCallId = new Map<string, MessageLine>();
    toolResultsByCallId.set('call-1', resultMsg);

    const msg: MessageLine = {
      id: 'msg-1',
      type: 'tool',
      content: 'tool_call',
      metadata: {
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'test_tool', arguments: '{}' },
          },
        ],
        toolResultsByCallId,
      },
    };

    expect(hasAnyPendingToolCalls(msg)).toBe(false);
  });

  it('should detect partially pending tool calls (some results missing)', () => {
    const resultMsg1: MessageLine = {
      id: 'result-1',
      type: 'tool_result',
      content: 'success',
      metadata: {
        toolResult: {
          id: 'call-1',
          name: 'tool_a',
          status: 'success',
          type: 'text',
          result: 'done',
        },
        duration: 100,
      },
    };

    const toolResultsByCallId = new Map<string, MessageLine>();
    toolResultsByCallId.set('call-1', resultMsg1);
    // call-2 has no result yet

    const msg: MessageLine = {
      id: 'msg-1',
      type: 'tool',
      content: 'tool_a, tool_b',
      metadata: {
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'tool_a', arguments: '{}' },
          },
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'tool_b', arguments: '{}' },
          },
        ],
        toolResultsByCallId,
      },
    };

    expect(hasAnyPendingToolCalls(msg)).toBe(true);
  });

  it('should handle non-tool messages', () => {
    const msg: MessageLine = {
      id: 'msg-1',
      type: 'user',
      content: 'hello',
    };

    expect(hasAnyPendingToolCalls(msg)).toBe(false);
  });

  it('should handle tool messages without toolCalls metadata', () => {
    const msg: MessageLine = {
      id: 'msg-1',
      type: 'tool',
      content: 'tool',
      metadata: {},
    };

    expect(hasAnyPendingToolCalls(msg)).toBe(false);
  });

  it('should handle tool messages with empty toolCalls array', () => {
    const msg: MessageLine = {
      id: 'msg-1',
      type: 'tool',
      content: 'tool',
      metadata: {
        toolCalls: [],
        toolResultsByCallId: new Map(),
      },
    };

    expect(hasAnyPendingToolCalls(msg)).toBe(false);
  });

  it('should handle tool messages without toolResultsByCallId', () => {
    const msg: MessageLine = {
      id: 'msg-1',
      type: 'tool',
      content: 'tool',
      metadata: {
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'test', arguments: '{}' },
          },
        ],
        // No toolResultsByCallId
      },
    };

    expect(hasAnyPendingToolCalls(msg)).toBe(true);
  });
});

describe('ChatDisplay - Static Count Calculation', () => {
  /**
   * Simplified version of calculateStaticCount logic
   */
  function calculateStaticCount(messages: MessageLine[], DYNAMIC_COUNT: number = 1): number {
    let dynamicCount = DYNAMIC_COUNT;

    // Check messages from the end, looking for pending tool calls
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // Helper to check if pending
      const isPending = (m: MessageLine): boolean => {
        if (m.type !== 'tool') return false;
        const toolCalls = m.metadata?.toolCalls || [];
        const results = m.metadata?.toolResultsByCallId as Map<string, MessageLine> | undefined;
        if (toolCalls.length === 0) return false;
        return toolCalls.some((tc) => !results?.has(tc.id));
      };

      // If this message is a pending tool call, keep it and everything after it dynamic
      if (isPending(msg)) {
        dynamicCount = messages.length - i;
        break;
      }

      // Stop checking once we've gone past the minimum dynamic count
      if (messages.length - i > DYNAMIC_COUNT) {
        break;
      }
    }

    return Math.max(0, messages.length - dynamicCount);
  }

  it('should keep pending tool call in dynamic area', () => {
    const messages: MessageLine[] = [
      { id: '1', type: 'user', content: 'hello' },
      { id: '2', type: 'assistant', content: 'hi' },
      {
        id: '3',
        type: 'tool',
        content: 'pending_tool',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'pending', arguments: '{}' },
            },
          ],
          toolResultsByCallId: new Map(), // No results - pending
        },
      },
    ];

    const staticCount = calculateStaticCount(messages);

    // Pending tool call is last message, so only it stays dynamic
    // staticCount = length - 1 = 3 - 1 = 2
    expect(staticCount).toBe(2);
  });

  it('should move completed tool call to static area', () => {
    const resultMsg: MessageLine = {
      id: 'r1',
      type: 'tool_result',
      content: 'done',
      metadata: {
        toolResult: {
          id: 'call-1',
          name: 'test',
          status: 'success',
          type: 'text',
          result: 'done',
        },
        duration: 100,
      },
    };

    const toolResultsByCallId = new Map<string, MessageLine>();
    toolResultsByCallId.set('call-1', resultMsg);

    const messages: MessageLine[] = [
      { id: '1', type: 'user', content: 'hello' },
      {
        id: '2',
        type: 'tool',
        content: 'completed_tool',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'test', arguments: '{}' },
            },
          ],
          toolResultsByCallId,
        },
      },
      { id: '3', type: 'assistant', content: 'done' },
    ];

    const staticCount = calculateStaticCount(messages);

    // Should keep only last message (assistant) dynamic
    expect(staticCount).toBe(2);
  });

  it('should handle multiple pending tool calls', () => {
    const messages: MessageLine[] = [
      { id: '1', type: 'user', content: 'hello' },
      {
        id: '2',
        type: 'tool',
        content: 'pending1',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'p1', arguments: '{}' },
            },
          ],
          toolResultsByCallId: new Map(),
        },
      },
      {
        id: '3',
        type: 'tool',
        content: 'pending2',
        metadata: {
          toolCalls: [
            {
              id: 'call-2',
              type: 'function',
              function: { name: 'p2', arguments: '{}' },
            },
          ],
          toolResultsByCallId: new Map(),
        },
      },
    ];

    const staticCount = calculateStaticCount(messages);

    // Last pending tool call (msg 3) keeps itself and msg 2 dynamic
    // since the loop finds the last pending tool and keeps everything after it dynamic
    // dynamicCount = messages.length - i = 3 - 2 = 1
    // Wait, the last message is index 2, so dynamicCount = 3 - 2 = 1
    // staticCount = 3 - 1 = 2
    expect(staticCount).toBe(2);
  });

  it('should handle mixed pending and completed tool calls', () => {
    const result1: MessageLine = {
      id: 'r1',
      type: 'tool_result',
      content: 'done',
      metadata: {
        toolResult: { id: 'call-1', name: 'test', status: 'success', type: 'text', result: 'done' },
        duration: 100,
      },
    };

    const map1 = new Map<string, MessageLine>();
    map1.set('call-1', result1);

    const messages: MessageLine[] = [
      { id: '1', type: 'user', content: 'hello' },
      {
        id: '2',
        type: 'tool',
        content: 'completed',
        metadata: {
          toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'c', arguments: '{}' } }],
          toolResultsByCallId: map1,
        },
      },
      { id: '3', type: 'assistant', content: 'mid' },
      {
        id: '4',
        type: 'tool',
        content: 'pending',
        metadata: {
          toolCalls: [{ id: 'call-2', type: 'function', function: { name: 'p', arguments: '{}' } }],
          toolResultsByCallId: new Map(),
        },
      },
    ];

    const staticCount = calculateStaticCount(messages);

    // Pending tool call is last, so keep it dynamic (staticCount = 3)
    expect(staticCount).toBe(3);
  });

  it('should use DYNAMIC_COUNT when no pending tool calls', () => {
    const messages: MessageLine[] = [
      { id: '1', type: 'user', content: 'msg1' },
      { id: '2', type: 'assistant', content: 'msg2' },
      { id: '3', type: 'user', content: 'msg3' },
    ];

    const staticCount = calculateStaticCount(messages, 1);

    // No pending tool calls, use default DYNAMIC_COUNT (1)
    expect(staticCount).toBe(2);
  });
});
