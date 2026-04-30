/**
 * Type definitions for tool call arguments
 * These types represent the parameters passed to each tool
 */

export type BashToolArgs = {
  cmd: string;
  cwd?: string;
  timeoutMs?: number;
  description?: string;
  ignoreOutput?: boolean;
};

export type FileReadArgs = {
  path: string;
  lineStart?: number;
  lineEnd?: number;
  description?: string;
};

export type FileEditArgs = {
  file_path: string;
  old_text: string;
  new_text: string;
  dry_run?: boolean;
  description?: string;
};

export type FileNewArgs = {
  file_path: string;
  content: string;
  description?: string;
};

export type LsArgs = {
  path?: string;
  limit?: number;
  description?: string;
};

export type WebSearchArgs = {
  query: string;
  count?: number;
  offset?: number;
  domains?: string[];
  recencyDays?: number;
  lang?: string;
  region?: string;
  safe?: boolean;
  type?: 'web' | 'images';
  hydrateMeta?: boolean;
  description?: string;
};

export type WebFetchArgs = {
  url: string;
  description?: string;
};

export type TodoWriteArgs = {
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
    createdAt?: string;
  }>;
  description?: string;
};

export type AssignTaskArgs = {
  agent: string;
  task: string;
  description: string;
};

export type ToolArguments =
  | BashToolArgs
  | FileReadArgs
  | FileEditArgs
  | FileNewArgs
  | LsArgs
  | WebSearchArgs
  | WebFetchArgs
  | TodoWriteArgs
  | AssignTaskArgs;

/**
 * Type guard to safely parse tool arguments
 */
export function parseToolArguments(args: string | unknown): ToolArguments {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as ToolArguments;
    } catch {
      return {};
    }
  }
  return args as ToolArguments;
}

/**
 * Type guards for specific tool arguments
 */
export function isBashToolArgs(args: ToolArguments): args is BashToolArgs {
  return 'cmd' in args && typeof args.cmd === 'string';
}

export function isFileReadArgs(args: ToolArguments): args is FileReadArgs {
  return 'path' in args && typeof args.path === 'string';
}

export function isFileEditArgs(args: ToolArguments): args is FileEditArgs {
  return 'file_path' in args && 'old_text' in args && 'new_text' in args;
}

export function isFileNewArgs(args: ToolArguments): args is FileNewArgs {
  return 'file_path' in args && 'content' in args;
}

export function isTodoWriteArgs(args: ToolArguments): args is TodoWriteArgs {
  return 'todos' in args && Array.isArray(args.todos);
}

export function isAssignTaskArgs(args: ToolArguments): args is AssignTaskArgs {
  return 'agent' in args && 'task' in args && 'description' in args;
}

export function isWebSearchArgs(args: ToolArguments): args is WebSearchArgs {
  return 'query' in args && typeof args.query === 'string';
}

export function isWebFetchArgs(args: ToolArguments): args is WebFetchArgs {
  return 'url' in args && typeof args.url === 'string';
}

export function isLsArgs(args: ToolArguments): args is LsArgs {
  // Check that it has path or no specific other tool markers
  // Must be checked AFTER other more specific tools
  return (
    !('cmd' in args) &&
    !('url' in args) &&
    !('query' in args) &&
    !('todos' in args) &&
    !('agent' in args) &&
    !('file_path' in args) &&
    !('content' in args)
  );
}
