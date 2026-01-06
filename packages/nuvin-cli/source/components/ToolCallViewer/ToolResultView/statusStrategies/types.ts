import type { ToolExecutionResult, ToolCall, MetricsSnapshot } from '@nuvin/nuvin-core';
import type { Theme } from '@/theme.js';

export interface StatusMessage {
  text: string;
  color: string;
  paramText: string;
  statusPosition?: 'top' | 'bottom';
}

export interface StatusParams {
  toolCall?: ToolCall;
  theme: Theme;
  statusColor: string;
  subAgentMetrics?: MetricsSnapshot;
}

export interface StatusStrategy {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage;
}

export function createStatusMessage(
  text: string,
  color: string,
  paramText: string = '',
  statusPosition: 'top' | 'bottom' = 'top',
): StatusMessage {
  return { text, color, paramText, statusPosition };
}
