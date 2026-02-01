import type { ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';
import type { MessageLine } from '@/adapters/index.js';

/**
 * Create a mock ToolCall with given tool name and arguments
 */
export function createMockToolCall(
  name: string,
  args: Record<string, unknown>,
  id = 'test-call-1'
): ToolCall {
  return {
    id,
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

/**
 * Create a mock ToolExecutionResult
 */
export function createMockToolResult(
  name: string,
  result: unknown,
  metadata?: Record<string, unknown>
): ToolExecutionResult {
  return {
    name,
    status: 'success',
    type: 'text',
    result,
    metadata,
  };
}

/**
 * Create a mock error ToolExecutionResult
 */
export function createMockToolError(
  name: string,
  error: string,
  metadata?: Record<string, unknown>
): ToolExecutionResult {
  return {
    name,
    status: 'error',
    type: 'text',
    result: error,
    metadata,
  };
}

/**
 * Create a mock MessageLine with tool result
 */
export function createMockToolResultMessage(
  toolResult: ToolExecutionResult,
  duration?: number
): MessageLine {
  return {
    id: 'msg-result-1',
    type: 'tool_result',
    content: '',
    metadata: {
      toolResult,
      duration,
    },
  };
}
