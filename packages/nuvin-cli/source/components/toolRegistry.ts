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
} from '@nuvin/nuvin-core';
import { formatDuration, formatTokens } from '@/utils/formatters.js';
import { get } from '@/utils/get.js';
import type { ToolConfig, RenderFn } from './ToolCallViewer/types.js';
import {
  defaultRenderHeader,
  defaultRenderParams,
  defaultRenderResult,
  defaultRenderStatus,
} from './ToolCallViewer/DefaultToolRenderer.js';

/**
 * Tool configuration registry using the new ToolConfig format.
 * Each tool defines its display name, status text logic, and render behavior.
 */
const TOOL_REGISTRY: Record<string, ToolConfig> = {
  file_read: {
    displayName: 'Read',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isFileReadSuccess(r)) {
          const lineCount = r.result.split(/\r?\n/).length;
          return `Read ${lineCount} lines`;
        }
        return 'Read';
      },
      error: 'Read failed',
    },
    collapsedByDefault: true,
  },

  file_edit: {
    displayName: 'Edit',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isFileEditSuccess(r)) {
          const bytesWritten = get(r, 'metadata.bytesWritten') as number | undefined;
          return bytesWritten ? `Edited (${bytesWritten} bytes)` : 'Edited';
        }
        return 'Edited';
      },
      error: 'Edit failed',
    },
  },

  file_new: {
    displayName: 'Create',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isFileNewSuccess(r)) {
          const lines = get(r, 'metadata.lines') as number | undefined;
          const bytes = get(r, 'metadata.bytes') as number | undefined;
          let text = 'Created';

          if (lines !== undefined) {
            text += ` (${lines} lines`;
            text += bytes !== undefined ? `, ${bytes} bytes)` : ')';
          } else if (bytes !== undefined) {
            text += ` (${bytes} bytes)`;
          }
          return text;
        }
        return 'Created';
      },
      error: 'Creation failed',
    },
    collapsedByDefault: true,
  },

  bash_tool: {
    displayName: 'Run',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isBashSuccess(r)) {
          const code = get(r, 'metadata.code') as number | undefined;
          return code !== undefined ? `Executed (exit ${code})` : 'Executed';
        }
        return 'Executed';
      },
      error: 'Execution failed',
    },
  },

  web_search: {
    displayName: 'Search',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isWebSearchSuccess(r)) {
          const count = get(r, 'result.count') as number | undefined;
          return count !== undefined ? `Searched (${count} results)` : 'Searched';
        }
        return 'Searched';
      },
      error: 'Search failed',
    },
  },

  web_fetch: {
    displayName: 'Fetch',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isWebFetchSuccess(r)) {
          const size = get(r, 'metadata.size') as number | undefined;
          const statusCode = get(r, 'metadata.statusCode') as number | undefined;
          return size !== undefined && statusCode !== undefined
            ? `Fetched (${statusCode}, ${size} bytes)`
            : 'Fetched';
        }
        return 'Fetched';
      },
      error: 'Fetch failed',
    },
  },

  ls_tool: {
    displayName: 'List',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isLsToolSuccess(r)) {
          const text = r.result as string;
          const totalMatch = text.match(/total:\s*(\d+)/i);
          const entryCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;
          const truncated = text.includes('truncated:') ? ' (truncated)' : '';
          return `Listed ${entryCount} entries${truncated}`;
        }
        return 'Listed';
      },
      error: 'Listing failed',
    },
    collapsedByDefault: true,
  },

  glob_tool: {
    displayName: 'Find files',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isGlobSuccess(r)) {
          const count = get(r, 'metadata.count') as number | undefined;
          const truncated = get(r, 'metadata.truncated') as boolean | undefined;
          let text = count !== undefined ? `Found ${count} files` : 'Search complete';
          if (truncated) text += ' (truncated)';
          return text;
        }
        return 'Search complete';
      },
      error: 'Search failed',
    },
  },

  grep_tool: {
    displayName: 'Search',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isGrepSuccess(r)) {
          const matchCount = get(r, 'metadata.matchCount') as number | undefined;
          const fileCount = get(r, 'metadata.fileCount') as number | undefined;
          const truncated = get(r, 'metadata.truncated') as boolean | undefined;
          let text = matchCount !== undefined ? `Found ${matchCount} matches` : 'Search complete';
          if (fileCount !== undefined) text += ` in ${fileCount} files`;
          if (truncated) text += ' (truncated)';
          return text;
        }
        return 'Search complete';
      },
      error: 'Search failed',
    },
  },

  todo_write: {
    displayName: 'Update todo',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isTodoWriteSuccess(r)) {
          const stats = get(r, 'metadata.stats') as { completed: number; total: number } | undefined;
          const progress = get(r, 'metadata.progress') as string | undefined;
          return stats ? `Updated (${stats.completed}/${stats.total} - ${progress})` : 'Updated';
        }
        return 'Updated';
      },
      error: 'Update failed',
    },
    statusPosition: 'bottom',
  },

  assign_task: {
    displayName: 'Delegate',
    statusText: {
      success: (r: ToolExecutionResult) => {
        if (isAssignSuccess(r)) {
          const parts: string[] = ['Done'];
          const executionTimeMs = get(r, 'metadata.executionTimeMs') as number | undefined;
          const toolCallsExecuted = get(r, 'metadata.toolCallsExecuted') as number | undefined;
          const tokensUsed = get(r, 'metadata.tokensUsed') as number | undefined;

          if (toolCallsExecuted) parts.push(`${toolCallsExecuted} tools`);
          if (tokensUsed) parts.push(`${formatTokens(tokensUsed)} tokens`);
          if (executionTimeMs) parts.push(`${formatDuration(executionTimeMs)}`);

          return parts.join(' • ');
        }
        return 'Done';
      },
      error: 'Error',
    },
    collapsedByDefault: true,
  },

  lsp: {
    displayName: 'Language server',
    statusText: {
      success: 'Completed',
      error: 'Failed',
    },
  },

  skill: {
    displayName: 'Load skill',
    statusText: {
      success: 'Completed',
      error: 'Failed',
    },
  },

  ask_user_tool: {
    displayName: 'Ask user',
    statusText: {
      success: 'Completed',
      error: 'Failed',
    },
    hideUntilComplete: true,
  },
};

/**
 * Default configuration for unknown tools
 */
const DEFAULT_CONFIG: ToolConfig = {
  displayName: '',
  statusText: {
    success: 'Completed',
    error: 'Failed',
  },
};

/**
 * Get the full tool configuration for a tool, with fallback to defaults
 */
export function getToolConfig(toolName: string): ToolConfig {
  const config = TOOL_REGISTRY[toolName];
  if (config) {
    return config;
  }
  return { ...DEFAULT_CONFIG, displayName: toolName };
}

/**
 * Get the display name for a tool
 */
export function getToolDisplayName(toolName: string): string {
  return TOOL_REGISTRY[toolName]?.displayName || toolName;
}

/**
 * Check if a tool should be collapsed by default
 */
export function isCollapsedTool(toolName: string): boolean {
  return TOOL_REGISTRY[toolName]?.collapsedByDefault ?? false;
}

/**
 * Render phase types
 */
export type RenderPhase = 'header' | 'params' | 'result' | 'status';

/**
 * Get the render function for a specific tool and phase.
 * Returns the tool-specific renderer if defined, otherwise falls back to the default.
 */
export function getRenderFn(toolName: string, phase: RenderPhase): RenderFn {
  const config = TOOL_REGISTRY[toolName];

  // Check for tool-specific renderer
  if (config) {
    switch (phase) {
      case 'header':
        if (config.renderHeader) return config.renderHeader;
        break;
      case 'params':
        if (config.renderParams) return config.renderParams;
        break;
      case 'result':
        if (config.renderResult) return config.renderResult;
        break;
      case 'status':
        if (config.renderStatus) return config.renderStatus;
        break;
    }
  }

  // Fall back to default renderers
  switch (phase) {
    case 'header':
      return defaultRenderHeader;
    case 'params':
      return defaultRenderParams;
    case 'result':
      return defaultRenderResult;
    case 'status':
      return defaultRenderStatus;
  }
}
