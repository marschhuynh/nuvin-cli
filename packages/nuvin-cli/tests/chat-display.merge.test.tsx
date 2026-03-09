import { describe, it, expect } from 'vitest';
import type { MessageLine } from '../source/adapters/index.js';

/**
 * Merges tool calls with their corresponding tool results for display purposes only.
 * Does NOT modify the original messages array in memory.
 */
function mergeToolCallsWithResults(messages: MessageLine[]): MessageLine[] {
  const result: MessageLine[] = [];
  const toolResultsById = new Map<string, MessageLine>();

  // First pass: collect all tool results by their tool call ID
  for (const msg of messages) {
    if (msg.type === 'tool_result' && msg.metadata?.toolResult?.id) {
      toolResultsById.set(msg.metadata.toolResult.id, msg);
    }
  }

  // Second pass: merge tool calls with their results
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.type === 'tool') {
      // This is a tool call message - check if we have results for any of the calls
      const toolCalls = msg.metadata?.toolCalls || [];
      const mergedResults: MessageLine[] = [];

      // Build a map of tool results by call ID for quick lookup
      const resultsByCallId = new Map<string, MessageLine>();
      for (const toolCall of toolCalls) {
        const toolResult = toolResultsById.get(toolCall.id);
        if (toolResult) {
          mergedResults.push(toolResult);
          resultsByCallId.set(toolCall.id, toolResult);
        }
      }

      // Add the tool call message with enhanced metadata including results
      result.push({
        ...msg,
        metadata: {
          ...msg.metadata,
          toolResultsByCallId: resultsByCallId,
        },
      });

      // Add all merged results immediately after
      result.push(...mergedResults);
    } else if (msg.type === 'tool_result') {
      // Skip standalone tool_result messages - they're already merged with their tool calls
      // Only add them if they don't have a matching tool call (orphaned results)
      const toolResultId = msg.metadata?.toolResult?.id;
      if (!toolResultId) {
        // No ID, add it as-is
        result.push(msg);
      } else {
        // Check if there's a matching tool call in our messages
        const hasMatchingToolCall = messages.some(
          (m) => m.type === 'tool' && m.metadata?.toolCalls?.some((tc) => tc.id === toolResultId),
        );

        if (!hasMatchingToolCall) {
          // Orphaned result, add it
          result.push(msg);
        }
        // Otherwise skip - it's already been merged
      }
    } else {
      // Not a tool call or result, pass through
      result.push(msg);
    }
  }

  return result;
}

describe('mergeToolCallsWithResults', () => {
  it('should merge tool calls with their results', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'user',
        content: 'test message',
      },
      {
        id: '2',
        type: 'tool',
        content: 'file_read(...)',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'file_read', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: '3',
        type: 'assistant',
        content: 'response',
      },
      {
        id: '4',
        type: 'tool_result',
        content: 'file contents',
        metadata: {
          toolResult: {
            id: 'call-1',
            name: 'file_read',
            status: 'success',
            type: 'text',
            result: 'file contents',
          },
          duration: 1234,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    expect(merged).toHaveLength(4);
    expect(merged[0].type).toBe('user');
    expect(merged[1].type).toBe('tool');
    expect(merged[2].type).toBe('tool_result'); // merged right after tool call
    expect(merged[3].type).toBe('assistant');

    // Check that tool call has the results map attached
    const toolMsg = merged[1];
    expect(toolMsg.metadata?.toolResultsByCallId).toBeDefined();
    expect(toolMsg.metadata?.toolResultsByCallId?.size).toBe(1);
    const resultMsg = toolMsg.metadata?.toolResultsByCallId?.get('call-1');
    expect(resultMsg?.metadata?.duration).toBe(1234);
  });

  it('should handle multiple tool calls with results', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool',
        content: 'file_read(...), file_write(...)',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'file_read', arguments: '{}' },
            },
            {
              id: 'call-2',
              type: 'function',
              function: { name: 'file_write', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: '2',
        type: 'tool_result',
        content: 'read result',
        metadata: {
          toolResult: {
            id: 'call-1',
            name: 'file_read',
            status: 'success',
            type: 'text',
            result: 'read result',
          },
        },
      },
      {
        id: '3',
        type: 'tool_result',
        content: 'write result',
        metadata: {
          toolResult: {
            id: 'call-2',
            name: 'file_write',
            status: 'success',
            type: 'text',
            result: 'write result',
          },
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    expect(merged).toHaveLength(3);
    expect(merged[0].type).toBe('tool');
    expect(merged[1].type).toBe('tool_result');
    expect(merged[1].metadata?.toolResult?.id).toBe('call-1');
    expect(merged[2].type).toBe('tool_result');
    expect(merged[2].metadata?.toolResult?.id).toBe('call-2');
  });

  it('should preserve orphaned tool results without matching calls', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool_result',
        content: 'orphaned result',
        metadata: {
          toolResult: {
            id: 'orphan-1',
            name: 'unknown',
            status: 'success',
            type: 'text',
            result: 'orphaned',
          },
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe('tool_result');
  });

  it('should not modify original messages array', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool',
        content: 'file_read(...)',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'file_read', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: '2',
        type: 'tool_result',
        content: 'result',
        metadata: {
          toolResult: {
            id: 'call-1',
            name: 'file_read',
            status: 'success',
            type: 'text',
            result: 'result',
          },
        },
      },
    ];

    const originalLength = messages.length;
    mergeToolCallsWithResults(messages);

    expect(messages).toHaveLength(originalLength);
    expect(messages[0].type).toBe('tool');
    expect(messages[1].type).toBe('tool_result');
  });
});
