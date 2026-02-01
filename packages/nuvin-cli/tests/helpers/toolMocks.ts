import type { ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';
import type { MessageLine } from '../../source/adapters/index.js';

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
    type: 'function',
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
  metadata?: Record<string, unknown>,
  id = 'test-result-1'
): ToolExecutionResult {
  return {
    id,
    name,
    status: 'success',
    type: 'text',
    result,
    metadata,
  } as ToolExecutionResult;
}

/**
 * Create a mock error ToolExecutionResult
 */
export function createMockToolError(
  name: string,
  error: string,
  metadata?: Record<string, unknown>,
  id = 'test-error-1'
): ToolExecutionResult {
  return {
    id,
    name,
    status: 'error',
    type: 'text',
    result: error,
    metadata,
  } as ToolExecutionResult;
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
