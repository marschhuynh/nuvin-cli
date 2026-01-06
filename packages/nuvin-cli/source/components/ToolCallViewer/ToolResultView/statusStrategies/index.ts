import type { ToolExecutionResult, ToolCall, MetricsSnapshot } from '@nuvin/nuvin-core';
import type { Theme } from '@/theme.js';
import type { StatusMessage, StatusStrategy, StatusParams } from './types.js';
import { getErrorStatus } from './errorStatusMap.js';
import {
  assignTaskStrategy,
  bashToolStrategy,
  defaultStrategy,
  dirLsStrategy,
  fileEditStrategy,
  fileNewStrategy,
  fileReadStrategy,
  todoWriteStrategy,
  webFetchStrategy,
  webSearchStrategy,
} from './strategies.js';

export type { StatusMessage, StatusStrategy, StatusParams };

const strategyRegistry: Record<string, StatusStrategy> = {
  assign_task: assignTaskStrategy,
  file_edit: fileEditStrategy,
  file_read: fileReadStrategy,
  file_new: fileNewStrategy,
  bash_tool: bashToolStrategy,
  web_fetch: webFetchStrategy,
  web_search: webSearchStrategy,
  todo_write: todoWriteStrategy,
  ls_tool: dirLsStrategy,
};

function getKeyParam(toolCall?: ToolCall): string {
  if (!toolCall) return '';

  try {
    const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};

    if (args.file_path) return args.file_path;
    if (args.path) return args.path;
    if (args.url) return args.url;
    if (args.query) return args.query.substring(0, 50) + (args.query.length > 50 ? '...' : '');
    if (args.command) return args.command.substring(0, 50) + (args.command.length > 50 ? '...' : '');
    if (args.cmd) return args.cmd.substring(0, 50) + (args.cmd.length > 50 ? '...' : '');

    return '';
  } catch {
    return '';
  }
}

export function getStatusMessage(
  toolResult: ToolExecutionResult,
  toolCall: ToolCall | undefined,
  theme: Theme,
  subAgentMetrics?: MetricsSnapshot,
): StatusMessage {
  const statusColor = toolResult.status === 'success' ? theme.status.success : theme.status.error;
  const paramText = getKeyParam(toolCall);

  const errorReason = toolResult.status === 'error' ? toolResult.metadata?.errorReason : undefined;
  const errorStatus = getErrorStatus(errorReason, theme, paramText);
  if (errorStatus) return errorStatus;

  const strategy = strategyRegistry[toolResult.name] ?? defaultStrategy;
  const params: StatusParams = { toolCall, theme, statusColor, subAgentMetrics };

  const status = strategy.getStatus(toolResult, params);
  return { ...status, paramText };
}
