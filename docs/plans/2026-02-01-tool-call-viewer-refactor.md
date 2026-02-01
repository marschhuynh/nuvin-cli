# ToolCallViewer Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce maintenance burden so adding a new tool requires changes to only one file (toolRegistry.ts)

**Architecture:** Single tool registry as source of truth. State computed once in merge logic, passed as prop. ToolCallViewer orchestrates 4 render phases (header, params, result, status) with DefaultToolRenderer providing defaults. Tools override only what they need.

**Tech Stack:** React, Ink, TypeScript, @nuvin/nuvin-core

---

## Task 1: Create Types File

**Files:**
- Create: `packages/nuvin-cli/source/components/ToolCallViewer/types.ts`

**Step 1: Create the types file with all new type definitions**

```typescript
import type React from 'react';
import type { ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';
import type { Theme } from '@/theme.js';

/**
 * Computed tool state - determined once in merge logic
 */
export type ComputedToolState = 
  | 'running' 
  | 'success' 
  | 'error' 
  | 'denied' 
  | 'edited' 
  | 'aborted' 
  | 'timeout';

/**
 * Context passed to all render functions
 */
export type ToolRenderContext = {
  toolCall: ToolCall;
  toolResult?: ToolExecutionResult;
  toolState: ComputedToolState;
  args: Record<string, unknown>;
  theme: Theme;
  cols: number;
  config: ToolConfig;
};

/**
 * Render function signature - returns React node or null
 */
export type RenderFn = (ctx: ToolRenderContext) => React.ReactNode | null;

/**
 * Tool configuration - single source of truth for each tool
 */
export type ToolConfig = {
  /** Display name shown in header (e.g., "Edit", "Read", "Run") */
  displayName: string;
  
  /** Status text configuration */
  statusText?: {
    /** Success message - string or function for dynamic text */
    success?: string | ((result: ToolExecutionResult) => string);
    /** Error message */
    error?: string;
  };
  
  /** Where to show status line: 'top' (default) or 'bottom' */
  statusPosition?: 'top' | 'bottom';
  
  /** Custom header renderer (tool name + inline args) */
  renderHeader?: RenderFn;
  
  /** Custom params renderer (expanded parameter details) */
  renderParams?: RenderFn;
  
  /** Custom result renderer (tool execution result content) */
  renderResult?: RenderFn;
  
  /** Custom status renderer (status line) */
  renderStatus?: RenderFn;
  
  /** Collapse result content by default */
  collapsedByDefault?: boolean;
  
  /** Hide entire tool until it has a result (e.g., ask_user_tool) */
  hideUntilComplete?: boolean;
};

/**
 * Layout and truncation constants
 */
export const LAYOUT = {
  CONTENT_MARGIN: 10,
  PARAM_MARGIN: 6,
  MARKDOWN_MARGIN: 12,
} as const;

export const TRUNCATION = {
  DEFAULT_MAX_LINES: 5,
  BASH_MAX_LINES: 10,
  DEFAULT_MAX_LINE_LENGTH: 150,
  BASH_MAX_LINE_LENGTH: 200,
} as const;
```

**Step 2: Verify file compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit src/components/ToolCallViewer/types.ts 2>&1 | head -20`
Expected: No errors (or only import resolution errors which are fine at this stage)

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/components/ToolCallViewer/types.ts
git commit -m "feat(tool-viewer): add types for refactored ToolCallViewer"
```

---

## Task 2: Create computeToolState Function

**Files:**
- Create: `packages/nuvin-cli/source/components/ToolCallViewer/computeToolState.ts`

**Step 1: Create the state computation function**

```typescript
import { type ToolExecutionResult, ErrorReason } from '@nuvin/nuvin-core';
import type { ComputedToolState } from './types.js';

/**
 * Compute the tool state from a tool result.
 * Called once in merge logic, result passed as prop to ToolCallViewer.
 */
export function computeToolState(toolResult?: ToolExecutionResult): ComputedToolState {
  if (!toolResult) {
    return 'running';
  }
  
  const errorReason = toolResult.metadata?.errorReason as ErrorReason | undefined;
  
  if (errorReason === ErrorReason.Denied) return 'denied';
  if (errorReason === ErrorReason.Edited) return 'edited';
  if (errorReason === ErrorReason.Aborted) return 'aborted';
  if (errorReason === ErrorReason.Timeout) return 'timeout';
  
  return toolResult.status; // 'success' | 'error'
}

/**
 * Get the color for a tool state from theme
 */
export function getStateColor(state: ComputedToolState, theme: { status: { success: string; error: string; idle: string; warning?: string }; colors: { warning: string } }): string {
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
```

**Step 2: Verify file compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/components/ToolCallViewer/computeToolState.ts
git commit -m "feat(tool-viewer): add computeToolState function"
```

---

## Task 3: Create DefaultToolRenderer

**Files:**
- Create: `packages/nuvin-cli/source/components/ToolCallViewer/DefaultToolRenderer.tsx`

**Step 1: Create the default renderer with all 4 phases**

```typescript
import React from 'react';
import { Box, Text } from 'ink';
import type { ToolRenderContext } from './types.js';
import { LAYOUT, TRUNCATION } from './types.js';
import { getStateColor } from './computeToolState.js';
import { Markdown } from '@/components/Markdown/index.js';

/**
 * Get the main argument to display inline with tool name
 */
function getMainArg(toolName: string, args: Record<string, unknown>): string | undefined {
  switch (toolName) {
    case 'file_read':
    case 'ls_tool': {
      const path = args.path as string | undefined;
      if (!path) return undefined;
      const lineStart = args.lineStart as number | undefined;
      const lineEnd = args.lineEnd as number | undefined;
      if (lineStart !== undefined && lineEnd !== undefined) {
        return `${path}:${lineStart}-${lineEnd}`;
      }
      if (lineStart !== undefined) {
        return `${path}:${lineStart}`;
      }
      return path;
    }
    case 'file_new':
    case 'file_edit':
      return args.file_path as string | undefined;
    case 'grep_tool':
    case 'glob_tool':
      return args.pattern as string | undefined;
    case 'lsp': {
      const operation = args.operation as string | undefined;
      const filePath = args.filePath as string | undefined;
      const line = args.line as number | undefined;
      if (!filePath) return operation;
      let formatted = filePath;
      if (line !== undefined) {
        formatted += `:${line}`;
        const character = args.character as number | undefined;
        if (character !== undefined) formatted += `:${character}`;
      }
      return operation ? `${operation} ${formatted}` : formatted;
    }
    case 'web_fetch':
      return args.url as string | undefined;
    case 'bash_tool': {
      const cmd = args.cmd as string | undefined;
      const cwd = args.cwd as string | undefined;
      if (!cmd) return undefined;
      return cwd ? `${cmd} at ${cwd}` : cmd;
    }
    default:
      return undefined;
  }
}

/**
 * Default header renderer: ⚙︎ {displayName} {mainArg}
 */
export function defaultRenderHeader(ctx: ToolRenderContext): React.ReactNode {
  const { config, args, theme, toolCall } = ctx;
  const mainArg = getMainArg(toolCall.function.name, args);
  
  return (
    <Box flexDirection="row">
      <Box flexShrink={0} marginRight={1}>
        <Text color={theme.messageTypes.tool} bold>{'⚙︎'}</Text>
      </Box>
      <Text wrap="truncate-middle">
        <Text bold>{config.displayName}</Text>
        {mainArg && <Text dimColor> {mainArg}</Text>}
      </Text>
    </Box>
  );
}

/**
 * Keys to exclude from default params display
 */
const EXCLUDED_PARAM_KEYS = new Set([
  'old_text', 'new_text', 'description', 'content',
  'file_path', 'path', 'lineStart', 'lineEnd',
  'filePath', 'line', 'character', 'operation',
  'cmd', 'cwd', 'pattern', 'url', 'query',
]);

/**
 * Default params renderer: key-value pairs
 */
export function defaultRenderParams(ctx: ToolRenderContext): React.ReactNode {
  const { args, theme, cols, toolState } = ctx;
  const color = getStateColor(toolState, theme);
  
  const entries = Object.entries(args).filter(
    ([key, value]) => !EXCLUDED_PARAM_KEYS.has(key) && value !== undefined && value !== ''
  );
  
  if (entries.length === 0) return null;
  
  const formatValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 0);
    }
    return String(value);
  };
  
  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      borderStyle="single"
      borderDimColor
      borderColor={color}
      borderBottom={false}
      borderRight={false}
      borderTop={false}
      paddingLeft={2}
      width={cols - LAYOUT.PARAM_MARGIN}
    >
      {entries.map(([key, value]) => (
        <Text key={key} dimColor>{`${key}: ${formatValue(value)}`}</Text>
      ))}
    </Box>
  );
}

/**
 * Default result renderer: markdown content
 */
export function defaultRenderResult(ctx: ToolRenderContext): React.ReactNode {
  const { toolResult, cols, theme, toolState } = ctx;
  
  if (!toolResult?.result) return null;
  
  const resultStr = typeof toolResult.result === 'string' 
    ? toolResult.result 
    : JSON.stringify(toolResult.result, null, 2);
  
  const color = getStateColor(toolState, theme);
  
  return (
    <Box
      borderStyle="single"
      borderColor={color}
      borderDimColor
      borderBottom={false}
      borderRight={false}
      borderTop={false}
      flexDirection="column"
      paddingLeft={2}
      marginLeft={2}
      width={cols - LAYOUT.CONTENT_MARGIN}
    >
      <Markdown maxWidth={cols - LAYOUT.MARKDOWN_MARGIN}>{resultStr}</Markdown>
    </Box>
  );
}

/**
 * Get status text from config or use defaults
 */
function getStatusText(ctx: ToolRenderContext): string {
  const { toolState, toolResult, config } = ctx;
  
  switch (toolState) {
    case 'running':
      return 'Running...';
    case 'denied':
      return 'Denied';
    case 'edited':
      return 'Edited';
    case 'aborted':
      return 'Aborted';
    case 'timeout':
      return 'Timeout';
    case 'success': {
      const successText = config.statusText?.success;
      if (typeof successText === 'function' && toolResult) {
        return successText(toolResult);
      }
      if (typeof successText === 'string') {
        return successText;
      }
      return 'Done';
    }
    case 'error': {
      return config.statusText?.error ?? 'Failed';
    }
  }
}

/**
 * Default status renderer: └─ {statusText}
 */
export function defaultRenderStatus(ctx: ToolRenderContext): React.ReactNode {
  const { theme, toolState } = ctx;
  const color = getStateColor(toolState, theme);
  const text = getStatusText(ctx);
  
  return (
    <Box flexDirection="row" marginLeft={2}>
      <Text dimColor color={color}>{`└─ ${text}`}</Text>
    </Box>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/components/ToolCallViewer/DefaultToolRenderer.tsx
git commit -m "feat(tool-viewer): add DefaultToolRenderer with 4 render phases"
```

---

## Task 4: Migrate Tool Configs to New Registry

**Files:**
- Modify: `packages/nuvin-cli/source/components/ToolCallViewer/toolRegistry.ts` (complete rewrite)

**Step 1: Rewrite toolRegistry.ts with new ToolConfig format**

```typescript
import type { ToolExecutionResult } from '@nuvin/nuvin-core';
import type { ToolConfig, RenderFn } from './types.js';
import { 
  defaultRenderHeader, 
  defaultRenderParams, 
  defaultRenderResult, 
  defaultRenderStatus 
} from './DefaultToolRenderer.js';

// Import custom renderers (we'll create these in later tasks)
// For now, use defaults

const TOOL_REGISTRY: Record<string, ToolConfig> = {
  file_read: {
    displayName: 'Read',
    statusText: {
      success: (r: ToolExecutionResult) => {
        const content = r.result as string;
        const lineCount = content?.split?.(/\r?\n/)?.length ?? 0;
        return `Read ${lineCount} lines`;
      },
      error: 'Read failed',
    },
    collapsedByDefault: true,
  },
  
  file_edit: {
    displayName: 'Edit',
    statusText: {
      success: (r: ToolExecutionResult) => {
        const bytes = (r.metadata as { bytesWritten?: number })?.bytesWritten;
        return bytes ? `Edited (${bytes} bytes)` : 'Edited';
      },
      error: 'Edit failed',
    },
    // Custom renderers will be added in Task 6
  },
  
  file_new: {
    displayName: 'Create',
    statusText: {
      success: (r: ToolExecutionResult) => {
        const meta = r.metadata as { lines?: number; bytes?: number } | undefined;
        let text = 'Created';
        if (meta?.lines !== undefined) {
          text += ` (${meta.lines} lines`;
          text += meta.bytes !== undefined ? `, ${meta.bytes} bytes)` : ')';
        } else if (meta?.bytes !== undefined) {
          text += ` (${meta.bytes} bytes)`;
        }
        return text;
      },
      error: 'Creation failed',
    },
    collapsedByDefault: true,
  },
  
  bash_tool: {
    displayName: 'Run',
    statusText: {
      success: (r: ToolExecutionResult) => {
        const code = (r.metadata as { code?: number })?.code;
        return code !== undefined ? `Executed (exit ${code})` : 'Executed';
      },
      error: 'Execution failed',
    },
  },
  
  web_search: {
    displayName: 'Search',
    statusText: {
      success: (r: ToolExecutionResult) => {
        const result = r.result as { count?: number } | undefined;
        const count = result?.count;
        return count !== undefined ? `Searched (${count} results)` : 'Searched';
      },
      error: 'Search failed',
    },
  },
  
  web_fetch: {
    displayName: 'Fetch',
    statusText: {
      success: (r: ToolExecutionResult) => {
        const meta = r.metadata as { size?: number; statusCode?: number } | undefined;
        if (meta?.size !== undefined && meta?.statusCode !== undefined) {
          return `Fetched (${meta.statusCode}, ${meta.size} bytes)`;
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
        const text = r.result as string;
        const totalMatch = text?.match?.(/total:\s*(\d+)/i);
        const entryCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;
        const truncated = text?.includes?.('truncated:') ? ' (truncated)' : '';
        return `Listed ${entryCount} entries${truncated}`;
      },
      error: 'Listing failed',
    },
    collapsedByDefault: true,
  },
  
  glob_tool: {
    displayName: 'Find files',
    statusText: {
      success: (r: ToolExecutionResult) => {
        const meta = r.metadata as { count?: number; truncated?: boolean } | undefined;
        let text = meta?.count !== undefined ? `Found ${meta.count} files` : 'Search complete';
        if (meta?.truncated) text += ' (truncated)';
        return text;
      },
      error: 'Search failed',
    },
  },
  
  grep_tool: {
    displayName: 'Search',
    statusText: {
      success: (r: ToolExecutionResult) => {
        const meta = r.metadata as { matchCount?: number; fileCount?: number; truncated?: boolean } | undefined;
        let text = meta?.matchCount !== undefined ? `Found ${meta.matchCount} matches` : 'Search complete';
        if (meta?.fileCount !== undefined) text += ` in ${meta.fileCount} files`;
        if (meta?.truncated) text += ' (truncated)';
        return text;
      },
      error: 'Search failed',
    },
  },
  
  todo_write: {
    displayName: 'Update todo',
    statusText: {
      success: (r: ToolExecutionResult) => {
        const meta = r.metadata as { stats?: { completed: number; total: number }; progress?: string } | undefined;
        return meta?.stats 
          ? `Updated (${meta.stats.completed}/${meta.stats.total} - ${meta.progress})` 
          : 'Updated';
      },
      error: 'Update failed',
    },
    statusPosition: 'bottom',
  },
  
  assign_task: {
    displayName: 'Delegate',
    statusText: {
      success: 'Done',
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
      success: 'Loaded',
      error: 'Failed',
    },
  },
  
  ask_user_tool: {
    displayName: 'Ask user',
    hideUntilComplete: true,
    statusText: {
      success: 'Answered',
      error: 'Failed',
    },
  },
};

const DEFAULT_CONFIG: ToolConfig = {
  displayName: '',
  statusText: {
    success: 'Completed',
    error: 'Failed',
  },
};

/**
 * Get tool configuration by name
 */
export function getToolConfig(toolName: string): ToolConfig {
  const config = TOOL_REGISTRY[toolName];
  if (config) return config;
  return { ...DEFAULT_CONFIG, displayName: toolName };
}

/**
 * Get tool display name
 */
export function getToolDisplayName(toolName: string): string {
  return TOOL_REGISTRY[toolName]?.displayName || toolName;
}

/**
 * Check if tool should be collapsed by default
 */
export function isCollapsedTool(toolName: string): boolean {
  return TOOL_REGISTRY[toolName]?.collapsedByDefault ?? false;
}

/**
 * Get render function for a phase, falling back to default
 */
export function getRenderFn(
  toolName: string, 
  phase: 'header' | 'params' | 'result' | 'status'
): RenderFn {
  const config = getToolConfig(toolName);
  
  switch (phase) {
    case 'header':
      return config.renderHeader ?? defaultRenderHeader;
    case 'params':
      return config.renderParams ?? defaultRenderParams;
    case 'result':
      return config.renderResult ?? defaultRenderResult;
    case 'status':
      return config.renderStatus ?? defaultRenderStatus;
  }
}
```

**Step 2: Verify file compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/components/ToolCallViewer/toolRegistry.ts
git commit -m "feat(tool-viewer): rewrite toolRegistry with new ToolConfig format"
```

---

## Task 5: Update mergeToolCallsWithResultsCached

**Files:**
- Modify: `packages/nuvin-cli/source/components/ChatDisplay.tsx`

**Step 1: Add computeToolState import and update merge logic**

Add import at top:
```typescript
import { computeToolState } from './ToolCallViewer/computeToolState.js';
import type { ComputedToolState } from './ToolCallViewer/types.js';
```

**Step 2: Update MergeCacheEntry and merge function**

Find and replace the `MergeCacheEntry` type and `mergeToolCallsWithResultsCached` function:

```typescript
export type MergeCacheEntry = {
  inputRef: MessageLineType;
  resultIds: string[];
  output: MessageLineType;
};

export type MergeCache = Map<string, MergeCacheEntry>;
```

The merge function needs to compute state. Update the section where we create the output:

In `mergeToolCallsWithResultsCached`, after line `const output: MessageLineType = {`:

```typescript
// Compute tool states for each tool call
const toolStates = new Map<string, ComputedToolState>();
for (const toolCall of toolCalls) {
  const toolResultMsg = resultsByCallId.get(toolCall.id);
  const toolExecutionResult = toolResultMsg?.metadata?.toolResult;
  toolStates.set(toolCall.id, computeToolState(toolExecutionResult));
}

const output: MessageLineType = {
  ...msg,
  metadata: { 
    ...msg.metadata, 
    toolResultsByCallId: resultsByCallId,
    toolStates, // Add computed states
  },
};
```

**Step 3: Update LineMetadata type**

In `packages/nuvin-cli/source/adapters/ui-event-adapter.tsx`, add to `LineMetadata`:

```typescript
toolStates?: Map<string, ComputedToolState>;
```

**Step 4: Verify file compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No new errors

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/components/ChatDisplay.tsx
git add packages/nuvin-cli/source/adapters/ui-event-adapter.tsx
git commit -m "feat(tool-viewer): compute tool state in merge logic"
```

---

## Task 6: Simplify ToolCallViewer

**Files:**
- Modify: `packages/nuvin-cli/source/components/ToolCallViewer/index.tsx`

**Step 1: Rewrite ToolCallViewer to use new architecture**

```typescript
import type React from 'react';
import { Box, Text } from 'ink';
import { type ToolCall, type ToolExecutionResult, parseToolArguments } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { ToolTimer } from '@/components/ToolTimer.js';
import { getToolConfig, getRenderFn, getToolDisplayName } from './toolRegistry.js';
import { getStateColor } from './computeToolState.js';
import type { ComputedToolState, ToolRenderContext } from './types.js';

type ToolCallViewerProps = {
  toolCall: ToolCall;
  toolResult?: MessageLineType;
  toolState: ComputedToolState;
  messageId: string;
};

export const ToolCallViewer: React.FC<ToolCallViewerProps> = ({ 
  toolCall, 
  toolResult, 
  toolState,
  messageId 
}) => {
  const { theme } = useTheme();
  const { pendingApprovalTools } = useToolApproval();
  const { cols } = useStdoutDimensions();

  // Skip if awaiting approval
  const isAwaitingApproval = pendingApprovalTools.some((tc) => tc.id === toolCall.id);
  if (isAwaitingApproval) {
    return null;
  }

  const toolName = toolCall.function.name;
  const config = getToolConfig(toolName);
  const args = parseToolArguments(toolCall.function.arguments);
  const toolExecutionResult = toolResult?.metadata?.toolResult as ToolExecutionResult | undefined;

  // Handle hideUntilComplete
  if (config.hideUntilComplete && toolState === 'running') {
    return null;
  }

  // Special handling for ask_user_tool - hide until answered
  if (toolName === 'ask_user_tool') {
    const metadata = toolExecutionResult?.metadata as { answers?: Record<string, string | string[]> } | undefined;
    const hasAnswers = metadata?.answers && Object.keys(metadata.answers).length > 0;
    if (!hasAnswers) {
      return null;
    }
  }

  // Build render context
  const ctx: ToolRenderContext = {
    toolCall,
    toolResult: toolExecutionResult,
    toolState,
    args,
    theme,
    cols,
    config,
  };

  // Get render functions
  const renderHeader = getRenderFn(toolName, 'header');
  const renderParams = getRenderFn(toolName, 'params');
  const renderResult = getRenderFn(toolName, 'result');
  const renderStatus = getRenderFn(toolName, 'status');

  const color = getStateColor(toolState, theme);
  const isRunning = toolState === 'running';
  const showResult = !isRunning && !config.collapsedByDefault && toolExecutionResult?.result;
  const finalDuration = toolResult?.metadata?.duration;

  return (
    <Box flexDirection="column" width={cols - 2} overflow="hidden">
      {/* Header */}
      {renderHeader(ctx)}

      {/* Params */}
      {renderParams(ctx)}

      {/* Running indicator */}
      {isRunning && toolName !== 'ask_user_tool' && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={color}>└─ </Text>
          <Text>Running ...</Text>
          <Box marginLeft={1}>
            <ToolTimer hasResult={false} finalDuration={finalDuration} />
          </Box>
        </Box>
      )}

      {/* Denied/Edited states */}
      {toolState === 'denied' && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={theme.colors.warning}>└─ Denied</Text>
        </Box>
      )}

      {toolState === 'edited' && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={theme.colors.warning}>└─ Edited</Text>
        </Box>
      )}

      {/* Result content */}
      {showResult && renderResult(ctx)}

      {/* Status line (for non-running, non-denied, non-edited states) */}
      {!isRunning && toolState !== 'denied' && toolState !== 'edited' && toolExecutionResult && (
        renderStatus(ctx)
      )}
    </Box>
  );
};
```

**Step 2: Verify file compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/components/ToolCallViewer/index.tsx
git commit -m "feat(tool-viewer): simplify ToolCallViewer with 4-phase rendering"
```

---

## Task 7: Update MessageLine to Pass toolState

**Files:**
- Modify: `packages/nuvin-cli/source/components/MessageLine.tsx`

**Step 1: Update the tool case to pass toolState**

Find the section that renders `<ToolCallViewer` and update it to pass `toolState`:

```typescript
case 'tool': {
  const toolCalls = (message.metadata?.toolCalls ?? []) as ToolCall[];
  const toolResultsByCallId = message.metadata?.toolResultsByCallId as Map<string, MessageLineType> | undefined;
  const toolStates = message.metadata?.toolStates as Map<string, ComputedToolState> | undefined;

  // ... rest of the code ...

  return (
    <Box key={toolCall.id || `${message.id}-tool-${callIndex}`} marginY={1}>
      <ToolCallViewer
        key={toolCall.id || `${message.id}-tool-${callIndex}`}
        toolCall={toolCall}
        toolResult={toolResultMsg}
        toolState={toolStates?.get(toolCall.id) ?? 'running'}
        messageId={message.id}
      />
    </Box>
  );
}
```

**Step 2: Add import for ComputedToolState**

```typescript
import type { ComputedToolState } from './ToolCallViewer/types.js';
```

**Step 3: Verify file compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No new errors

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/components/MessageLine.tsx
git commit -m "feat(tool-viewer): pass toolState from MessageLine to ToolCallViewer"
```

---

## Task 8: Create Custom Renderers (file_edit)

**Files:**
- Create: `packages/nuvin-cli/source/components/ToolCallViewer/renderers/index.ts`
- Create: `packages/nuvin-cli/source/components/ToolCallViewer/renderers/fileEditRenderer.tsx`

**Step 1: Create renderers index**

```typescript
export { fileEditRenderer } from './fileEditRenderer.js';
```

**Step 2: Create fileEditRenderer**

```typescript
import React from 'react';
import { Box, Text } from 'ink';
import { isFileEditSuccess } from '@nuvin/nuvin-core';
import type { ToolRenderContext, RenderFn } from '../types.js';
import { FileDiffView, type LineNumbers } from '@/components/FileDiffView.js';
import { getStateColor } from '../computeToolState.js';
import { LAYOUT } from '../types.js';

type FileEditMetadata = {
  path?: string;
  lineNumbers?: LineNumbers;
};

export const fileEditRenderer = {
  params: ((ctx: ToolRenderContext) => {
    const { args, theme, cols, toolState, toolResult } = ctx;
    
    // Only show diff if we have the necessary args
    if (args.old_text === undefined || args.new_text === undefined) {
      return null;
    }

    const color = getStateColor(toolState, theme);
    const metadata = toolResult?.metadata as FileEditMetadata | undefined;
    const lineNumbers = metadata?.lineNumbers;

    return (
      <Box
        flexDirection="column"
        marginLeft={2}
        borderStyle="single"
        borderDimColor
        borderColor={color}
        borderBottom={false}
        borderRight={false}
        borderTop={false}
        paddingLeft={2}
        width={cols - LAYOUT.PARAM_MARGIN}
      >
        <FileDiffView
          blocks={[{ search: args.old_text as string, replace: args.new_text as string }]}
          filePath={metadata?.path || (args.file_path as string)}
          showPath={false}
          lineNumbers={lineNumbers}
        />
      </Box>
    );
  }) as RenderFn,

  result: (() => null) as RenderFn, // No separate result for file_edit, diff is shown in params
};
```

**Step 3: Update toolRegistry to use custom renderer**

In `toolRegistry.ts`, add import and update file_edit config:

```typescript
import { fileEditRenderer } from './renderers/index.js';

// In TOOL_REGISTRY:
file_edit: {
  displayName: 'Edit',
  statusText: {
    success: (r: ToolExecutionResult) => {
      const bytes = (r.metadata as { bytesWritten?: number })?.bytesWritten;
      return bytes ? `Edited (${bytes} bytes)` : 'Edited';
    },
    error: 'Edit failed',
  },
  renderParams: fileEditRenderer.params,
  renderResult: fileEditRenderer.result,
},
```

**Step 4: Verify file compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No new errors

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/components/ToolCallViewer/renderers/
git add packages/nuvin-cli/source/components/ToolCallViewer/toolRegistry.ts
git commit -m "feat(tool-viewer): add custom renderer for file_edit"
```

---

## Task 9: Create Remaining Custom Renderers

**Files:**
- Create: `packages/nuvin-cli/source/components/ToolCallViewer/renderers/todoWriteRenderer.tsx`
- Create: `packages/nuvin-cli/source/components/ToolCallViewer/renderers/askUserRenderer.tsx`
- Create: `packages/nuvin-cli/source/components/ToolCallViewer/renderers/assignTaskRenderer.tsx`
- Update: `packages/nuvin-cli/source/components/ToolCallViewer/renderers/index.ts`

This task involves porting the existing custom renderers from `ToolResultView/renderers/` to the new format. Each renderer should:

1. Import `ToolRenderContext` and `RenderFn` from `../types.js`
2. Export an object with render functions for each phase it overrides
3. Follow the same pattern as `fileEditRenderer`

**Step 1: Create todoWriteRenderer.tsx**

Port from `ToolResultView/renderers/TodoWriteRenderer.tsx`, adapting to new context pattern.

**Step 2: Create askUserRenderer.tsx**

Port from `ToolResultView/renderers/AskUserRenderer.tsx`, adapting to new context pattern.

**Step 3: Create assignTaskRenderer.tsx**

Create custom header that shows task description and agent info.

**Step 4: Update renderers/index.ts**

```typescript
export { fileEditRenderer } from './fileEditRenderer.js';
export { todoWriteRenderer } from './todoWriteRenderer.js';
export { askUserRenderer } from './askUserRenderer.js';
export { assignTaskRenderer } from './assignTaskRenderer.js';
```

**Step 5: Update toolRegistry.ts to use all custom renderers**

**Step 6: Verify all files compile**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No new errors

**Step 7: Commit**

```bash
git add packages/nuvin-cli/source/components/ToolCallViewer/renderers/
git add packages/nuvin-cli/source/components/ToolCallViewer/toolRegistry.ts
git commit -m "feat(tool-viewer): add remaining custom renderers"
```

---

## Task 10: Delete Old Files

**Files:**
- Delete: `packages/nuvin-cli/source/components/ToolCallViewer/ToolResultView/statusStrategies/` (entire folder)
- Delete: `packages/nuvin-cli/source/components/ToolCallViewer/params/` (entire folder)
- Delete: `packages/nuvin-cli/source/components/ToolCallViewer/ToolResultView/ToolResultView.tsx`
- Update: `packages/nuvin-cli/source/components/ToolCallViewer/ToolResultView/index.ts`

**Step 1: Remove old statusStrategies folder**

```bash
rm -rf packages/nuvin-cli/source/components/ToolCallViewer/ToolResultView/statusStrategies
```

**Step 2: Remove old params folder**

```bash
rm -rf packages/nuvin-cli/source/components/ToolCallViewer/params
```

**Step 3: Remove ToolResultView.tsx**

```bash
rm packages/nuvin-cli/source/components/ToolCallViewer/ToolResultView/ToolResultView.tsx
```

**Step 4: Update ToolResultView/index.ts**

Keep only SubAgentActivity export (if still needed):

```typescript
export { SubAgentActivity } from './SubAgentActivity.js';
export { parseDetailLines } from './utils.js';
```

**Step 5: Update imports throughout codebase**

Find and fix any broken imports referencing deleted files.

**Step 6: Verify project compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor(tool-viewer): remove old statusStrategies and params folders"
```

---

## Task 11: Run Tests and Fix Issues

**Files:**
- Various test files may need updates

**Step 1: Run all tests**

```bash
cd packages/nuvin-cli && pnpm test
```

**Step 2: Fix any failing tests**

Update test imports and assertions as needed.

**Step 3: Run visual verification**

```bash
cd packages/nuvin-cli && pnpm dev
```

Test various tool calls to verify rendering works correctly.

**Step 4: Commit fixes**

```bash
git add -A
git commit -m "test(tool-viewer): fix tests after refactor"
```

---

## Task 12: Update Exports and Documentation

**Files:**
- Update: `packages/nuvin-cli/source/components/index.ts`
- Update: `packages/nuvin-cli/source/components/ToolCallViewer/ToolResultView/index.ts`

**Step 1: Clean up component exports**

Ensure only necessary items are exported from `components/index.ts`.

**Step 2: Verify no dead exports**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore(tool-viewer): clean up exports after refactor"
```

---

## Success Criteria

After completing all tasks:

- [ ] Adding a new tool requires editing only `toolRegistry.ts`
- [ ] All tool states computed once in `mergeToolCallsWithResultsCached`
- [ ] `statusStrategies/` and `params/` folders deleted
- [ ] ToolResultView merged into ToolCallViewer
- [ ] All tests pass
- [ ] Visual verification shows correct tool rendering
