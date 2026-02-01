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
