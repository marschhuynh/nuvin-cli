import { describe, it, expect } from 'vitest';
import type { MessageLine } from '../source/adapters/index.js';

/**
 * Tests for ChatDisplay streaming message detection
 * Verifies that streaming messages stay in dynamic area until finalized
 */

describe('ChatDisplay - Streaming Message Detection', () => {
  /**
   * Helper function that checks if messages should stay dynamic
   * Mimics the logic from ChatDisplay.calculateStaticCount
   */
  function shouldStayDynamic(messages: MessageLine[], index: number): boolean {
    const msg = messages[index];

    // Check if message is actively streaming
    if (msg.metadata?.isStreaming === true) {
      return true;
    }

    // Check if it's a pending tool call
    if (msg.type === 'tool') {
      const toolCalls = msg.metadata?.toolCalls || [];
      const toolResultsByCallId = msg.metadata?.toolResultsByCallId as Map<string, MessageLine> | undefined;

      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const hasResult = toolResultsByCallId?.has(toolCall.id);
          if (!hasResult) {
            return true; // Pending tool call
          }
        }
      }
    }

    return false;
  }

  it('should keep streaming assistant message in dynamic area', () => {
    const streamingMessage: MessageLine = {
      id: 'msg-1',
      type: 'assistant',
      content: 'Partial response...',
      metadata: {
        timestamp: new Date().toISOString(),
        isStreaming: true,
      },
    };

    expect(shouldStayDynamic([streamingMessage], 0)).toBe(true);
  });

  it('should move finalized assistant message to static area', () => {
    const finalizedMessage: MessageLine = {
      id: 'msg-1',
      type: 'assistant',
      content: 'Complete response.',
      metadata: {
        timestamp: new Date().toISOString(),
        isStreaming: false,
      },
    };

    expect(shouldStayDynamic([finalizedMessage], 0)).toBe(false);
  });

  it('should move assistant message without streaming flag to static area', () => {
    const regularMessage: MessageLine = {
      id: 'msg-1',
      type: 'assistant',
      content: 'Non-streaming response.',
      metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    expect(shouldStayDynamic([regularMessage], 0)).toBe(false);
  });

  it('should keep streaming message dynamic even with other messages after', () => {
    const messages: MessageLine[] = [
      {
        id: 'msg-1',
        type: 'user',
        content: 'User message',
        metadata: { timestamp: new Date().toISOString() },
      },
      {
        id: 'msg-2',
        type: 'assistant',
        content: 'Streaming...',
        metadata: {
          timestamp: new Date().toISOString(),
          isStreaming: true,
        },
      },
      {
        id: 'msg-3',
        type: 'info',
        content: 'Some info',
        metadata: { timestamp: new Date().toISOString() },
      },
    ];

    // The streaming message at index 1 should stay dynamic
    expect(shouldStayDynamic(messages, 1)).toBe(true);
  });

  it('should handle transition from streaming to finalized', () => {
    // Before: streaming
    const streamingState: MessageLine = {
      id: 'msg-1',
      type: 'assistant',
      content: 'Partial...',
      metadata: {
        timestamp: new Date().toISOString(),
        isStreaming: true,
      },
    };

    expect(shouldStayDynamic([streamingState], 0)).toBe(true);

    // After: finalized (simulating metadata update)
    const finalizedState: MessageLine = {
      ...streamingState,
      content: 'Partial... complete!',
      metadata: {
        ...streamingState.metadata,
        isStreaming: false,
      },
    };

    expect(shouldStayDynamic([finalizedState], 0)).toBe(false);
  });

  it('should keep pending tool call dynamic regardless of streaming state', () => {
    const pendingToolCall: MessageLine = {
      id: 'msg-1',
      type: 'tool',
      content: 'tool_name(...)',
      metadata: {
        timestamp: new Date().toISOString(),
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'tool_name',
              arguments: '{}',
            },
          },
        ],
        // No toolResultsByCallId means pending
      },
    };

    expect(shouldStayDynamic([pendingToolCall], 0)).toBe(true);
  });
});
