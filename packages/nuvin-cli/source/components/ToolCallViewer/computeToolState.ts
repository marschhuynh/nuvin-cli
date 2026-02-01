import { type ToolExecutionResult, type ToolErrorMetadata, ErrorReason } from '@nuvin/nuvin-core';
import type { ComputedToolState } from './types.js';

/**
 * Compute the tool state from a tool result.
 * Called once in merge logic, result passed as prop to ToolCallViewer.
 */
export function computeToolState(toolResult?: ToolExecutionResult): ComputedToolState {
  if (!toolResult) {
    return 'running';
  }

  // errorReason is only present on error results via ToolErrorMetadata
  const errorReason = (toolResult.metadata as ToolErrorMetadata | undefined)?.errorReason;

  if (errorReason === ErrorReason.Denied) return 'denied';
  if (errorReason === ErrorReason.Edited) return 'edited';
  if (errorReason === ErrorReason.Aborted) return 'aborted';
  if (errorReason === ErrorReason.Timeout) return 'timeout';

  return toolResult.status; // 'success' | 'error'
}

/**
 * Get the color for a tool state from theme
 */
export function getStateColor(
  state: ComputedToolState,
  theme: { status: { success: string; error: string; idle: string; warning?: string }; colors: { warning: string } },
): string {
  switch (state) {
    case 'running':
      return theme.status.idle;
    case 'success':
      return theme.status.success;
    case 'denied':
    case 'edited':
    case 'aborted':
    case 'timeout':
      return theme.colors.warning;
    case 'error':
      return theme.status.error;
  }
}
