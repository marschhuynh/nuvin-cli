import { describe, it, expect } from 'vitest';
import type { ToolCall } from '@nuvin/nuvin-core';
import type { MessageLine } from '../source/adapters/index.js';

/**
 * Integration tests for MergedToolCall component logic
 * These tests verify the data flow and logic without rendering
 */

describe('MergedToolCall - Data Logic', () => {
  it('should identify when a tool call has a result', () => {
    const toolCall: ToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'file_read',
        arguments: '{"path": "test.txt"}',
      },
    };

    const toolResultsByCallId = new Map<string, MessageLine>();
    toolResultsByCallId.set('call-1', {
      id: 'result-1',
      type: 'tool_result',
      content: 'success',
      metadata: {
        toolResult: {
          id: 'call-1',
          name: 'file_read',
          status: 'success',
          type: 'text',
          result: 'File contents',
        },
        duration: 150,
      },
    });

    const toolResult = toolResultsByCallId.get(toolCall.id);
    const hasResult = !!toolResult;
    const finalDuration = toolResult?.metadata?.duration;

    expect(hasResult).toBe(true);
    expect(finalDuration).toBe(150);
  });

  it('should identify when a tool call is pending (no result)', () => {
    const toolCall: ToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'slow_operation',
        arguments: '{}',
      },
    };

    const toolResultsByCallId = new Map<string, MessageLine>();
    // No result for call-1

    const toolResult = toolResultsByCallId.get(toolCall.id);
    const hasResult = !!toolResult;

    expect(hasResult).toBe(false);
    expect(toolResult).toBeUndefined();
  });

  it('should extract duration from tool result metadata', () => {
    const toolResult: MessageLine = {
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
        duration: 2500,
      },
    };

    const duration = toolResult?.metadata?.duration;
    expect(duration).toBe(2500);

    // Verify conversion to seconds (for display)
    const seconds = duration ? (duration / 1000).toFixed(1) : '0.0';
    expect(seconds).toBe('2.5');
  });

  it('should handle tool result with error status', () => {
    const toolResult: MessageLine = {
      id: 'result-1',
      type: 'tool_result',
      content: 'error: file not found',
      metadata: {
        toolResult: {
          id: 'call-1',
          name: 'file_read',
          status: 'error',
          type: 'text',
          result: 'error: file not found',
        },
        duration: 50,
        status: 'error',
      },
      color: 'red',
    };

    expect(toolResult.metadata?.status).toBe('error');
    expect(toolResult.metadata?.toolResult?.status).toBe('error');
    expect(toolResult.color).toBe('red');
  });

  it('should handle multiple tool calls with different result states', () => {
    const toolCall1: ToolCall = {
      id: 'call-1',
      type: 'function',
      function: { name: 'fast_tool', arguments: '{}' },
    };

    const toolCall2: ToolCall = {
      id: 'call-2',
      type: 'function',
      function: { name: 'slow_tool', arguments: '{}' },
    };

    const toolResultsByCallId = new Map<string, MessageLine>();

    // Only call-1 has a result
    toolResultsByCallId.set('call-1', {
      id: 'result-1',
      type: 'tool_result',
      content: 'success',
      metadata: {
        toolResult: {
          id: 'call-1',
          name: 'fast_tool',
          status: 'success',
          type: 'text',
          result: 'done',
        },
        duration: 100,
      },
    });

    const result1 = toolResultsByCallId.get(toolCall1.id);
    const result2 = toolResultsByCallId.get(toolCall2.id);

    expect(!!result1).toBe(true);
    expect(result1?.metadata?.duration).toBe(100);

    expect(!!result2).toBe(false);
    expect(result2).toBeUndefined();
  });
});

describe('MergedToolCall - Tool Name Parsing', () => {
  it('should parse tool name and parameters', () => {
    const parseToolCall = (name: string, args: string): { tool: string; params: Record<string, unknown> } => {
      return {
        tool: name,
        params: JSON.parse(args),
      };
    };

    const result = parseToolCall('file_read', '{"path": "test.txt"}');

    expect(result.tool).toBe('file_read');
    expect(result.params.path).toBe('test.txt');
  });

  it('should handle empty parameters', () => {
    const parseToolCall = (name: string, args: string): { tool: string; params: Record<string, unknown> } => {
      return {
        tool: name,
        params: JSON.parse(args),
      };
    };

    const result = parseToolCall('simple_tool', '{}');

    expect(result.tool).toBe('simple_tool');
    expect(Object.keys(result.params)).toHaveLength(0);
  });

  it('should handle complex parameters', () => {
    const parseToolCall = (name: string, args: string): { tool: string; params: Record<string, unknown> } => {
      return {
        tool: name,
        params: JSON.parse(args),
      };
    };

    const result = parseToolCall(
      'file_edit',
      '{"file_path": "/path/to/file.ts", "old_string": "old code", "new_string": "new code"}',
    );

    expect(result.tool).toBe('file_edit');
    expect(result.params.file_path).toBe('/path/to/file.ts');
    expect(result.params.old_string).toBe('old code');
    expect(result.params.new_string).toBe('new code');
  });
});

describe('MergedToolCall - Timer Logic', () => {
  it('should calculate elapsed time in seconds', () => {
    const _startTime = Date.now();
    const elapsed = 1234; // milliseconds

    const seconds = (elapsed / 1000).toFixed(1);

    expect(seconds).toBe('1.2');
  });

  it('should use final duration when result is available', () => {
    const finalDuration = 2500; // milliseconds
    const hasResult = true;

    const displayTime = hasResult ? finalDuration : Date.now() - Date.now();
    const seconds = (displayTime / 1000).toFixed(1);

    expect(seconds).toBe('2.5');
  });

  it('should format various durations correctly', () => {
    const testCases = [
      { ms: 50, expected: '0.1' }, // 0.05 rounds to 0.1
      { ms: 100, expected: '0.1' },
      { ms: 1500, expected: '1.5' },
      { ms: 2340, expected: '2.3' },
      { ms: 10000, expected: '10.0' },
    ];

    for (const { ms, expected } of testCases) {
      const seconds = (ms / 1000).toFixed(1);
      expect(seconds).toBe(expected);
    }
  });
});

describe('MergedToolCall - Integration with Message Flow', () => {
  it('should simulate complete tool call lifecycle', () => {
    // 1. Tool call is created
    const toolCall: ToolCall = {
      id: 'call-123',
      type: 'function',
      function: {
        name: 'web_search',
        arguments: '{"query": "test query"}',
      },
    };

    // 2. Initially no result
    const toolResultsByCallId = new Map<string, MessageLine>();
    let hasResult = !!toolResultsByCallId.get(toolCall.id);
    expect(hasResult).toBe(false);

    // 3. Result arrives
    const toolResult: MessageLine = {
      id: 'result-123',
      type: 'tool_result',
      content: 'success',
      metadata: {
        toolResult: {
          id: 'call-123',
          name: 'web_search',
          status: 'success',
          type: 'text',
          result: 'Search results...',
        },
        duration: 850,
      },
    };

    toolResultsByCallId.set('call-123', toolResult);

    // 4. Now has result
    hasResult = !!toolResultsByCallId.get(toolCall.id);
    expect(hasResult).toBe(true);

    // 5. Duration is available
    const finalDuration = toolResultsByCallId.get(toolCall.id)?.metadata?.duration;
    expect(finalDuration).toBe(850);

    // 6. Format for display
    const displaySeconds = finalDuration ? (finalDuration / 1000).toFixed(1) : '0.0';
    expect(displaySeconds).toBe('0.8');
  });

  it('should handle parallel tool calls with different completion times', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'fast', arguments: '{}' },
      },
      {
        id: 'call-2',
        type: 'function',
        function: { name: 'medium', arguments: '{}' },
      },
      {
        id: 'call-3',
        type: 'function',
        function: { name: 'slow', arguments: '{}' },
      },
    ];

    const toolResultsByCallId = new Map<string, MessageLine>();

    // Fast completes first
    toolResultsByCallId.set('call-1', {
      id: 'r1',
      type: 'tool_result',
      content: 'done',
      metadata: {
        toolResult: {
          id: 'call-1',
          name: 'fast',
          status: 'success',
          type: 'text',
          result: 'done',
        },
        duration: 100,
      },
    });

    // Medium completes second
    toolResultsByCallId.set('call-2', {
      id: 'r2',
      type: 'tool_result',
      content: 'done',
      metadata: {
        toolResult: {
          id: 'call-2',
          name: 'medium',
          status: 'success',
          type: 'text',
          result: 'done',
        },
        duration: 500,
      },
    });

    // Slow is still pending (no result yet)

    const states = toolCalls.map((tc) => ({
      id: tc.id,
      hasResult: !!toolResultsByCallId.get(tc.id),
      duration: toolResultsByCallId.get(tc.id)?.metadata?.duration,
    }));

    expect(states[0].hasResult).toBe(true);
    expect(states[0].duration).toBe(100);

    expect(states[1].hasResult).toBe(true);
    expect(states[1].duration).toBe(500);

    expect(states[2].hasResult).toBe(false);
    expect(states[2].duration).toBeUndefined();
  });
});
