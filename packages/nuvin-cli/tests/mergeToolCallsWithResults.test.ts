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

      // Determine status: completed if all tool calls have results, streaming otherwise
      const status = toolCalls.length > 0 && mergedResults.length === toolCalls.length ? 'completed' : 'streaming';

      // Add the tool call message with enhanced metadata including results
      // Postfix id with status so consumers (React keys, caches) detect state changes
      result.push({
        ...msg,
        id: `${msg.id}:${status}`,
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

describe('mergeToolCallsWithResults - Basic Merging', () => {
  it('should merge a single tool call with its result', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'user',
        content: 'read file',
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
              function: { name: 'file_read', arguments: '{"path": "test.txt"}' },
            },
          ],
        },
      },
      {
        id: '3',
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
          duration: 150,
        },
      },
      {
        id: '4',
        type: 'assistant',
        content: 'Here is the file content',
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    // Should have: user, tool, tool_result (merged), assistant
    expect(merged).toHaveLength(4);
    expect(merged[0].type).toBe('user');
    expect(merged[1].type).toBe('tool');
    expect(merged[2].type).toBe('tool_result');
    expect(merged[3].type).toBe('assistant');

    // Tool call should have results map
    const toolMsg = merged[1];
    expect(toolMsg.metadata?.toolResultsByCallId).toBeDefined();
    expect(toolMsg.metadata?.toolResultsByCallId?.size).toBe(1);

    const resultMsg = toolMsg.metadata?.toolResultsByCallId?.get('call-1');
    expect(resultMsg?.id).toBe('3');
    expect(resultMsg?.metadata?.duration).toBe(150);
  });

  it('should merge multiple tool calls with their results', () => {
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
          duration: 100,
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
          duration: 250,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    // Should have: tool, result1, result2
    expect(merged).toHaveLength(3);
    expect(merged[0].type).toBe('tool');
    expect(merged[1].type).toBe('tool_result');
    expect(merged[1].metadata?.toolResult?.id).toBe('call-1');
    expect(merged[2].type).toBe('tool_result');
    expect(merged[2].metadata?.toolResult?.id).toBe('call-2');

    // Tool call should have both results in map
    const toolMsg = merged[0];
    expect(toolMsg.metadata?.toolResultsByCallId?.size).toBe(2);
    expect(toolMsg.metadata?.toolResultsByCallId?.get('call-1')?.metadata?.duration).toBe(100);
    expect(toolMsg.metadata?.toolResultsByCallId?.get('call-2')?.metadata?.duration).toBe(250);
  });

  it('should handle tool calls with partial results', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool',
        content: 'tool1, tool2, tool3',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'tool1', arguments: '{}' },
            },
            {
              id: 'call-2',
              type: 'function',
              function: { name: 'tool2', arguments: '{}' },
            },
            {
              id: 'call-3',
              type: 'function',
              function: { name: 'tool3', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: '2',
        type: 'tool_result',
        content: 'result 1',
        metadata: {
          toolResult: {
            id: 'call-1',
            name: 'tool1',
            status: 'success',
            type: 'text',
            result: 'result 1',
          },
          duration: 50,
        },
      },
      {
        id: '3',
        type: 'tool_result',
        content: 'result 3',
        metadata: {
          toolResult: {
            id: 'call-3',
            name: 'tool3',
            status: 'success',
            type: 'text',
            result: 'result 3',
          },
          duration: 150,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    // Should have: tool, result1, result3 (call-2 has no result yet)
    expect(merged).toHaveLength(3);
    expect(merged[0].type).toBe('tool');
    expect(merged[1].metadata?.toolResult?.id).toBe('call-1');
    expect(merged[2].metadata?.toolResult?.id).toBe('call-3');

    // Tool call should have only 2 results in map
    const toolMsg = merged[0];
    expect(toolMsg.metadata?.toolResultsByCallId?.size).toBe(2);
    expect(toolMsg.metadata?.toolResultsByCallId?.has('call-1')).toBe(true);
    expect(toolMsg.metadata?.toolResultsByCallId?.has('call-2')).toBe(false);
    expect(toolMsg.metadata?.toolResultsByCallId?.has('call-3')).toBe(true);
  });
});

describe('mergeToolCallsWithResults - Orphaned Results', () => {
  it('should preserve orphaned tool results without matching calls', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool_result',
        content: 'orphaned result',
        metadata: {
          toolResult: {
            id: 'orphan-1',
            name: 'unknown_tool',
            status: 'success',
            type: 'text',
            result: 'orphaned',
          },
          duration: 200,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe('tool_result');
    expect(merged[0].id).toBe('1');
  });

  it('should preserve tool results without IDs', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool_result',
        content: 'result without ID',
        metadata: {
          // No toolResult with id
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe('tool_result');
  });
});

describe('mergeToolCallsWithResults - Complex Scenarios', () => {
  it('should handle multiple tool call groups with results', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool',
        content: 'tool_a',
        metadata: {
          toolCalls: [
            {
              id: 'call-a',
              type: 'function',
              function: { name: 'tool_a', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: '2',
        type: 'tool_result',
        content: 'result a',
        metadata: {
          toolResult: {
            id: 'call-a',
            name: 'tool_a',
            status: 'success',
            type: 'text',
            result: 'result a',
          },
          duration: 100,
        },
      },
      {
        id: '3',
        type: 'assistant',
        content: 'middle message',
      },
      {
        id: '4',
        type: 'tool',
        content: 'tool_b',
        metadata: {
          toolCalls: [
            {
              id: 'call-b',
              type: 'function',
              function: { name: 'tool_b', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: '5',
        type: 'tool_result',
        content: 'result b',
        metadata: {
          toolResult: {
            id: 'call-b',
            name: 'tool_b',
            status: 'success',
            type: 'text',
            result: 'result b',
          },
          duration: 200,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    // Should have: tool, result, assistant, tool, result
    expect(merged).toHaveLength(5);
    expect(merged[0].type).toBe('tool');
    expect(merged[1].type).toBe('tool_result');
    expect(merged[2].type).toBe('assistant');
    expect(merged[3].type).toBe('tool');
    expect(merged[4].type).toBe('tool_result');

    // First tool call should have first result
    expect(merged[0].metadata?.toolResultsByCallId?.get('call-a')?.metadata?.duration).toBe(100);

    // Second tool call should have second result
    expect(merged[3].metadata?.toolResultsByCallId?.get('call-b')?.metadata?.duration).toBe(200);
  });

  it('should handle out-of-order results', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool',
        content: 'tool1, tool2',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'tool1', arguments: '{}' },
            },
            {
              id: 'call-2',
              type: 'function',
              function: { name: 'tool2', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: '2',
        type: 'tool_result',
        content: 'result 2',
        metadata: {
          toolResult: {
            id: 'call-2',
            name: 'tool2',
            status: 'success',
            type: 'text',
            result: 'result 2',
          },
          duration: 50,
        },
      },
      {
        id: '3',
        type: 'tool_result',
        content: 'result 1',
        metadata: {
          toolResult: {
            id: 'call-1',
            name: 'tool1',
            status: 'success',
            type: 'text',
            result: 'result 1',
          },
          duration: 150,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    // Results should be ordered by the tool call order (call-1, then call-2)
    // not by the order they appear in messages
    expect(merged).toHaveLength(3);
    expect(merged[0].type).toBe('tool');
    expect(merged[1].metadata?.toolResult?.id).toBe('call-1');
    expect(merged[2].metadata?.toolResult?.id).toBe('call-2');

    // Both results should be in the map
    const toolMsg = merged[0];
    expect(toolMsg.metadata?.toolResultsByCallId?.size).toBe(2);
    expect(toolMsg.metadata?.toolResultsByCallId?.get('call-1')?.metadata?.duration).toBe(150);
    expect(toolMsg.metadata?.toolResultsByCallId?.get('call-2')?.metadata?.duration).toBe(50);
  });

  it('should handle error results', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool',
        content: 'failing_tool',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'failing_tool', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: '2',
        type: 'tool_result',
        content: 'error: file not found',
        metadata: {
          toolResult: {
            id: 'call-1',
            name: 'failing_tool',
            status: 'error',
            type: 'text',
            result: 'error: file not found',
          },
          duration: 25,
        },
        color: 'red',
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    expect(merged).toHaveLength(2);
    expect(merged[0].type).toBe('tool');
    expect(merged[1].type).toBe('tool_result');
    expect(merged[1].metadata?.toolResult?.status).toBe('error');
    expect(merged[1].color).toBe('red');

    // Error result should still be in the map
    const toolMsg = merged[0];
    expect(toolMsg.metadata?.toolResultsByCallId?.get('call-1')?.metadata?.duration).toBe(25);
  });
});

describe('mergeToolCallsWithResults - Immutability', () => {
  it('should not modify the original messages array', () => {
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
          duration: 100,
        },
      },
    ];

    const originalLength = messages.length;
    const originalFirstType = messages[0].type;
    const originalSecondType = messages[1].type;
    const originalMetadata = messages[0].metadata;

    mergeToolCallsWithResults(messages);

    // Original array should be unchanged
    expect(messages).toHaveLength(originalLength);
    expect(messages[0].type).toBe(originalFirstType);
    expect(messages[1].type).toBe(originalSecondType);

    // Original metadata should not have toolResultsByCallId
    expect(originalMetadata?.toolResultsByCallId).toBeUndefined();
  });

  it('should create new message objects, not mutate existing ones', () => {
    const toolMsg: MessageLine = {
      id: '1',
      type: 'tool',
      content: 'tool',
      metadata: {
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'tool', arguments: '{}' },
          },
        ],
      },
    };

    const messages: MessageLine[] = [
      toolMsg,
      {
        id: '2',
        type: 'tool_result',
        content: 'result',
        metadata: {
          toolResult: {
            id: 'call-1',
            name: 'tool',
            status: 'success',
            type: 'text',
            result: 'result',
          },
          duration: 100,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);

    // Merged message should have the new metadata
    expect(merged[0].metadata?.toolResultsByCallId).toBeDefined();

    // Original message should NOT have the new metadata
    expect(toolMsg.metadata?.toolResultsByCallId).toBeUndefined();

    // They should be different objects
    expect(merged[0]).not.toBe(toolMsg);
  });
});

describe('mergeToolCallsWithResults - ID Postfix Status', () => {
  it('should postfix tool message id with :completed when all results are present', () => {
    const messages: MessageLine[] = [
      {
        id: 'tool-1',
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
        id: 'result-1',
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
          duration: 100,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged[0].id).toBe('tool-1:completed');
  });

  it('should postfix tool message id with :streaming when no results yet', () => {
    const messages: MessageLine[] = [
      {
        id: 'tool-1',
        type: 'tool',
        content: 'pending_tool',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'pending_tool', arguments: '{}' },
            },
          ],
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged[0].id).toBe('tool-1:streaming');
  });

  it('should postfix tool message id with :streaming when only partial results', () => {
    const messages: MessageLine[] = [
      {
        id: 'tool-1',
        type: 'tool',
        content: 'tool1, tool2',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'tool1', arguments: '{}' },
            },
            {
              id: 'call-2',
              type: 'function',
              function: { name: 'tool2', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: 'result-1',
        type: 'tool_result',
        content: 'result 1',
        metadata: {
          toolResult: {
            id: 'call-1',
            name: 'tool1',
            status: 'success',
            type: 'text',
            result: 'result 1',
          },
          duration: 50,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged[0].id).toBe('tool-1:streaming');
  });

  it('should postfix tool message id with :completed when all partial results arrive', () => {
    const messages: MessageLine[] = [
      {
        id: 'tool-1',
        type: 'tool',
        content: 'tool1, tool2',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'tool1', arguments: '{}' },
            },
            {
              id: 'call-2',
              type: 'function',
              function: { name: 'tool2', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: 'result-1',
        type: 'tool_result',
        content: 'result 1',
        metadata: {
          toolResult: {
            id: 'call-1',
            name: 'tool1',
            status: 'success',
            type: 'text',
            result: 'result 1',
          },
          duration: 50,
        },
      },
      {
        id: 'result-2',
        type: 'tool_result',
        content: 'result 2',
        metadata: {
          toolResult: {
            id: 'call-2',
            name: 'tool2',
            status: 'success',
            type: 'text',
            result: 'result 2',
          },
          duration: 100,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged[0].id).toBe('tool-1:completed');
  });

  it('should postfix with :streaming when tool has empty toolCalls array', () => {
    const messages: MessageLine[] = [
      {
        id: 'tool-1',
        type: 'tool',
        content: 'tool',
        metadata: {
          toolCalls: [],
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged[0].id).toBe('tool-1:streaming');
  });

  it('should postfix with :streaming when tool has no metadata', () => {
    const messages: MessageLine[] = [
      {
        id: 'tool-1',
        type: 'tool',
        content: 'tool',
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged[0].id).toBe('tool-1:streaming');
  });

  it('should not postfix non-tool message ids', () => {
    const messages: MessageLine[] = [
      {
        id: 'user-1',
        type: 'user',
        content: 'hello',
      },
      {
        id: 'assistant-1',
        type: 'assistant',
        content: 'hi',
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged[0].id).toBe('user-1');
    expect(merged[1].id).toBe('assistant-1');
  });

  it('should not postfix tool_result message ids', () => {
    const messages: MessageLine[] = [
      {
        id: 'result-1',
        type: 'tool_result',
        content: 'orphaned result',
        metadata: {
          toolResult: {
            id: 'orphan-1',
            name: 'unknown_tool',
            status: 'success',
            type: 'text',
            result: 'orphaned',
          },
          duration: 200,
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged[0].id).toBe('result-1');
  });

  it('should postfix independently for multiple tool call groups', () => {
    const messages: MessageLine[] = [
      {
        id: 'tool-1',
        type: 'tool',
        content: 'tool_a',
        metadata: {
          toolCalls: [
            {
              id: 'call-a',
              type: 'function',
              function: { name: 'tool_a', arguments: '{}' },
            },
          ],
        },
      },
      {
        id: 'result-a',
        type: 'tool_result',
        content: 'result a',
        metadata: {
          toolResult: {
            id: 'call-a',
            name: 'tool_a',
            status: 'success',
            type: 'text',
            result: 'result a',
          },
          duration: 100,
        },
      },
      {
        id: 'tool-2',
        type: 'tool',
        content: 'tool_b',
        metadata: {
          toolCalls: [
            {
              id: 'call-b',
              type: 'function',
              function: { name: 'tool_b', arguments: '{}' },
            },
          ],
        },
      },
      // tool-2 has no result yet
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged[0].id).toBe('tool-1:completed');
    expect(merged[2].id).toBe('tool-2:streaming');
  });
});

describe('mergeToolCallsWithResults - Edge Cases', () => {
  it('should handle empty messages array', () => {
    const messages: MessageLine[] = [];
    const merged = mergeToolCallsWithResults(messages);
    expect(merged).toHaveLength(0);
  });

  it('should handle messages with no tool calls or results', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'user',
        content: 'hello',
      },
      {
        id: '2',
        type: 'assistant',
        content: 'hi there',
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged).toHaveLength(2);
    expect(merged[0].type).toBe('user');
    expect(merged[1].type).toBe('assistant');
  });

  it('should handle tool calls with no results yet', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool',
        content: 'pending_tool',
        metadata: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'pending_tool', arguments: '{}' },
            },
          ],
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe('tool');

    // Should have empty results map
    expect(merged[0].metadata?.toolResultsByCallId?.size).toBe(0);
  });

  it('should handle tool calls with empty toolCalls array', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool',
        content: 'tool',
        metadata: {
          toolCalls: [],
        },
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged).toHaveLength(1);
    expect(merged[0].metadata?.toolResultsByCallId?.size).toBe(0);
  });

  it('should handle tool messages with no metadata', () => {
    const messages: MessageLine[] = [
      {
        id: '1',
        type: 'tool',
        content: 'tool',
      },
    ];

    const merged = mergeToolCallsWithResults(messages);
    expect(merged).toHaveLength(1);
    expect(merged[0].metadata?.toolResultsByCallId?.size).toBe(0);
  });
});
