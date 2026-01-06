import {
  isAssignSuccess,
  isBashSuccess,
  isLsToolSuccess,
  isGlobSuccess,
  isGrepSuccess,
  isFileEditSuccess,
  isFileNewSuccess,
  isFileReadSuccess,
  isTodoWriteSuccess,
  isWebFetchSuccess,
  isWebSearchSuccess,
  type ToolExecutionResult,
  ErrorReason,
} from '@nuvin/nuvin-core';
import { formatDuration, formatTokens, formatCost } from '@/utils/formatters.js';
import { get } from '@/utils/get.js';
import type { StatusStrategy, StatusParams, StatusMessage } from './types.js';
import { createStatusMessage } from './types.js';

const isEditedResult = (result: ToolExecutionResult): boolean => {
  return result.status === 'error' && result.metadata?.errorReason === ErrorReason.Edited;
};

export const assignTaskStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor, subAgentMetrics } = params;

    if (isAssignSuccess(result)) {
      const parts: string[] = ['Done'];
      const executionTimeMs = get(result, 'metadata.executionTimeMs') as number | undefined;
      const toolCallsExecuted = get(result, 'metadata.toolCallsExecuted') as number | undefined;
      const tokensUsed = get(result, 'metadata.tokensUsed') as number | undefined;

      if (subAgentMetrics) {
        parts.push(`${subAgentMetrics.llmCallCount} calls`);
        parts.push(`${formatTokens(subAgentMetrics.totalTokens)} tokens`);
        if (subAgentMetrics.totalCost > 0) parts.push(`$${formatCost(subAgentMetrics.totalCost)}`);
        if (executionTimeMs) parts.push(`${formatDuration(executionTimeMs)}`);
      } else {
        if (toolCallsExecuted) parts.push(`${toolCallsExecuted} tools`);
        if (tokensUsed) parts.push(`${formatTokens(tokensUsed)} tokens`);
        if (executionTimeMs) parts.push(`${formatDuration(executionTimeMs)}`);
      }

      return createStatusMessage(parts.join(' • '), statusColor, '');
    }

    return createStatusMessage('Error', statusColor, '');
  },
};

export const fileEditStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isFileEditSuccess(result)) {
      const bytesWritten = get(result, 'metadata.bytesWritten') as number | undefined;
      const text = bytesWritten ? `Edited (${bytesWritten} bytes)` : 'Edited';
      return createStatusMessage(text, statusColor, '');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage('Edit failed', statusColor, '');
  },
};

export const fileReadStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isFileReadSuccess(result)) {
      const lineCount = result.result.split(/\r?\n/).length;
      return createStatusMessage(`Read ${lineCount} lines`, statusColor, '');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage('Read failed', statusColor, '');
  },
};

export const fileNewStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isFileNewSuccess(result)) {
      const lines = get(result, 'metadata.lines') as number | undefined;
      const bytes = get(result, 'metadata.bytes') as number | undefined;
      let text = 'Created';

      if (lines !== undefined) {
        text += ` (${lines} lines`;
        text += bytes !== undefined ? `, ${bytes} bytes)` : ')';
      } else if (bytes !== undefined) {
        text += ` (${bytes} bytes)`;
      }

      return createStatusMessage(text, statusColor, '');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage('Creation failed', statusColor, '');
  },
};

export const bashToolStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isBashSuccess(result)) {
      const code = get(result, 'metadata.code') as number | undefined;
      const text = code !== undefined ? `Executed (exit ${code})` : 'Executed';
      return createStatusMessage(text, statusColor, '');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage('Execution failed', statusColor, '');
  },
};

export const webFetchStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isWebFetchSuccess(result)) {
      const size = get(result, 'metadata.size') as number | undefined;
      const statusCode = get(result, 'metadata.statusCode') as number | undefined;
      const text =
        size !== undefined && statusCode !== undefined ? `Fetched (${statusCode}, ${size} bytes)` : 'Fetched';
      return createStatusMessage(text, statusColor, '');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage('Fetch failed', statusColor, '');
  },
};

export const webSearchStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isWebSearchSuccess(result)) {
      const count = get(result, 'result.count') as number | undefined;
      const text = count !== undefined ? `Searched (${count} results)` : 'Searched';
      return createStatusMessage(text, statusColor, '');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage('Search failed', statusColor, '');
  },
};

export const todoWriteStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isTodoWriteSuccess(result)) {
      const stats = get(result, 'metadata.stats') as { completed: number; total: number } | undefined;
      const progress = get(result, 'metadata.progress') as string | undefined;
      const text = stats ? `Updated (${stats.completed}/${stats.total} - ${progress})` : 'Updated';
      return createStatusMessage(text, statusColor, '', 'bottom');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '', 'bottom');
    }

    return createStatusMessage('Update failed', statusColor, '', 'bottom');
  },
};

export const dirLsStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isLsToolSuccess(result)) {
      const text = result.result as string;
      const totalMatch = text.match(/total:\s*(\d+)/i);
      const entryCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      const truncated = text.includes('truncated:') ? ' (truncated)' : '';
      return createStatusMessage(`Listed ${entryCount} entries${truncated}`, statusColor, '');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage('Listing failed', statusColor, '');
  },
};

export const globStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isGlobSuccess(result)) {
      const count = get(result, 'metadata.count') as number | undefined;
      const truncated = get(result, 'metadata.truncated') as boolean | undefined;
      let text = count !== undefined ? `Found ${count} files` : 'Search complete';
      if (truncated) text += ' (truncated)';
      return createStatusMessage(text, statusColor, '');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage('Search failed', statusColor, '');
  },
};

export const grepStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;

    if (isGrepSuccess(result)) {
      const matchCount = get(result, 'metadata.matchCount') as number | undefined;
      const fileCount = get(result, 'metadata.fileCount') as number | undefined;
      const truncated = get(result, 'metadata.truncated') as boolean | undefined;
      let text = matchCount !== undefined ? `Found ${matchCount} matches` : 'Search complete';
      if (fileCount !== undefined) text += ` in ${fileCount} files`;
      if (truncated) text += ' (truncated)';
      return createStatusMessage(text, statusColor, '');
    }

    if (isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage('Search failed', statusColor, '');
  },
};

export const defaultStrategy: StatusStrategy = {
  getStatus(result: ToolExecutionResult, params: StatusParams): StatusMessage {
    const { statusColor } = params;
    const isSuccess = result.status === 'success';

    if (!isSuccess && isEditedResult(result)) {
      return createStatusMessage('Edited', statusColor, '');
    }

    return createStatusMessage(isSuccess ? 'Completed' : 'Failed', statusColor, '');
  },
};
