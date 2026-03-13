/**
 * Type definitions for tool call arguments/parameters
 * These types represent the parameters passed to each tool
 *
 * These are useful for:
 * - Type-safe tool call argument parsing
 * - UI rendering of tool calls with proper parameter display
 * - Validation of tool inputs
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

export type GlobArgs = {
  pattern: string;
  path?: string;
  description?: string;
};

export type GrepArgs = {
  pattern: string;
  path?: string;
  include?: string;
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

export type AskUserArgs = {
  description?: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{
      label: string;
      description: string;
    }>;
    multiSelect: boolean;
  }>;
  answers?: Record<string, string | string[]>;
};

export type ComputerUseArgs = {
  action: string;
  ref?: number;
  app?: string;
  text?: string;
  key?: string;
  direction?: string;
  amount?: number;
  duration?: number;
};

export type MemoryQueryArgs = {
  query: string;
  key?: string;
  scope?: 'global' | 'project' | 'both';
  topK?: number;
  minScore?: number;
};

export type MemoryExtractArgs = {
  scope?: 'project' | 'global';
  maxMessages?: number;
  minSimilarityScore?: number;
};

export type LspArgs = {
  operation:
    | 'goToDefinition'
    | 'findReferences'
    | 'hover'
    | 'documentSymbol'
    | 'workspaceSymbol'
    | 'goToImplementation'
    | 'prepareCallHierarchy'
    | 'incomingCalls'
    | 'outgoingCalls'
    | 'diagnostics';
  filePath: string;
  line: number;
  character: number;
  query?: string;
  description?: string;
};

export type SkillArgs = {
  name: string;
  description?: string;
};

export type ToolArguments =
  | BashToolArgs
  | FileReadArgs
  | FileEditArgs
  | FileNewArgs
  | LsArgs
  | GlobArgs
  | GrepArgs
  | WebSearchArgs
  | WebFetchArgs
  | TodoWriteArgs
  | AssignTaskArgs
  | AskUserArgs
  | ComputerUseArgs
  | MemoryQueryArgs
  | MemoryExtractArgs
  | LspArgs
  | SkillArgs;

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

export function isGlobArgs(args: ToolArguments): args is GlobArgs {
  return 'pattern' in args && typeof args.pattern === 'string' && !('include' in args);
}

export function isGrepArgs(args: ToolArguments): args is GrepArgs {
  return 'pattern' in args && typeof args.pattern === 'string' && ('include' in args || !('path' in args && !args.path));
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

export function isComputerUseArgs(args: ToolArguments): args is ComputerUseArgs {
  return 'action' in args && typeof args.action === 'string';
}

export function isMemoryQueryArgs(args: ToolArguments): args is MemoryQueryArgs {
  return 'query' in args && typeof args.query === 'string' && !('count' in args);
}

export function isMemoryExtractArgs(args: ToolArguments): args is MemoryExtractArgs {
  return 'scope' in args || 'maxMessages' in args || 'minSimilarityScore' in args;
}

export function isLspArgs(args: ToolArguments): args is LspArgs {
  return (
    'operation' in args &&
    'filePath' in args &&
    'line' in args &&
    'character' in args &&
    typeof args.operation === 'string' &&
    typeof args.filePath === 'string' &&
    typeof args.line === 'number' &&
    typeof args.character === 'number'
  );
}

export function isSkillArgs(args: ToolArguments): args is SkillArgs {
  return 'name' in args && typeof args.name === 'string';
}

export type ToolParameterMap = {
  bash_tool: BashToolArgs;
  file_read: FileReadArgs;
  file_edit: FileEditArgs;
  file_new: FileNewArgs;
  ls_tool: LsArgs;
  glob_tool: GlobArgs;
  grep_tool: GrepArgs;
  web_search: WebSearchArgs;
  web_fetch: WebFetchArgs;
  todo_write: TodoWriteArgs;
  assign_task: AssignTaskArgs;
  computer: ComputerUseArgs;
  memory_query: MemoryQueryArgs;
  memory_extract: MemoryExtractArgs;
  lsp: LspArgs;
  skill: SkillArgs;
};

export type ToolName = keyof ToolParameterMap;

export type TypedToolInvocation<T extends ToolName = ToolName> = {
  id: string;
  name: T;
  parameters: ToolParameterMap[T];
};
