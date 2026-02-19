import type { ToolExecutionResult } from '../ports.js';
import type { BashSuccessResult as BashSuccess } from './BashTool.js';
import type { FileReadSuccessResult as FileReadSuccess } from './FileReadTool.js';
import type { FileEditSuccessResult as FileEditSuccess } from './FileEditTool.js';
import type { FileNewSuccessResult as FileNewSuccess } from './FileNewTool.js';
import type { LsSuccessResult as LsSuccess } from './LsTool.js';
import type { GlobSuccessResult as GlobSuccess } from './GlobTool.js';
import type { GrepSuccessResult as GrepSuccess } from './GrepTool.js';
import type { WebSearchSuccessResult as WebSearchSuccess } from './WebSearchTool.js';
import type { WebFetchSuccessResult as WebFetchSuccess } from './WebFetchTool.js';
import type { TodoWriteSuccessResult as TodoWriteSuccess } from './TodoWriteTool.js';
import type { AssignSuccessResult as AssignSuccess } from './AssignTool.js';

type WithToolExecutionFields<T extends { status: string; type: string; result: unknown; metadata?: unknown }> = Omit<
  T,
  'metadata'
> & {
  id: string;
  name: string;
  durationMs?: number;
  metadata: T['metadata'];
};

type BashSuccessResult = WithToolExecutionFields<BashSuccess>;
type FileReadSuccessResult = WithToolExecutionFields<FileReadSuccess>;
type FileEditSuccessResult = WithToolExecutionFields<FileEditSuccess>;
type FileNewSuccessResult = WithToolExecutionFields<FileNewSuccess>;
type LsSuccessResult = WithToolExecutionFields<LsSuccess>;
type GlobSuccessResult = WithToolExecutionFields<GlobSuccess>;
type GrepSuccessResult = WithToolExecutionFields<GrepSuccess>;
type WebSearchSuccessResult = WithToolExecutionFields<WebSearchSuccess>;
type WebFetchSuccessResult = WithToolExecutionFields<WebFetchSuccess>;
type TodoWriteSuccessResult = WithToolExecutionFields<TodoWriteSuccess>;
type AssignSuccessResult = WithToolExecutionFields<AssignSuccess>;

export function isBashResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'bash_tool';
}

export function isBashSuccess(result: ToolExecutionResult): result is BashSuccessResult {
  return result.name === 'bash_tool' && result.status === 'success' && result.type === 'text';
}

export function isFileReadResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'file_read';
}

export function isFileReadSuccess(result: ToolExecutionResult): result is FileReadSuccessResult {
  return result.name === 'file_read' && result.status === 'success' && result.type === 'text';
}

export function isFileEditResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'file_edit';
}

export function isFileEditSuccess(result: ToolExecutionResult): result is FileEditSuccessResult {
  return result.name === 'file_edit' && result.status === 'success' && result.type === 'text';
}

export function isFileNewResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'file_new';
}

export function isFileNewSuccess(result: ToolExecutionResult): result is FileNewSuccessResult {
  return result.name === 'file_new' && result.status === 'success' && result.type === 'text';
}

export function isLsToolResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'ls_tool';
}

export function isLsToolSuccess(result: ToolExecutionResult): result is LsSuccessResult {
  return result.name === 'ls_tool' && result.status === 'success' && result.type === 'text';
}

export function isGlobResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'glob_tool';
}

export function isGlobSuccess(result: ToolExecutionResult): result is GlobSuccessResult {
  return result.name === 'glob_tool' && result.status === 'success' && result.type === 'text';
}

export function isGrepResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'grep_tool';
}

export function isGrepSuccess(result: ToolExecutionResult): result is GrepSuccessResult {
  return result.name === 'grep_tool' && result.status === 'success' && result.type === 'text';
}

export function isWebSearchResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'web_search';
}

export function isWebSearchSuccess(result: ToolExecutionResult): result is WebSearchSuccessResult {
  return result.name === 'web_search' && result.status === 'success' && result.type === 'json';
}

export function isWebFetchResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'web_fetch';
}

export function isWebFetchSuccess(result: ToolExecutionResult): result is WebFetchSuccessResult {
  return result.name === 'web_fetch' && result.status === 'success' && result.type === 'text';
}

export function isTodoWriteResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'todo_write';
}

export function isTodoWriteSuccess(result: ToolExecutionResult): result is TodoWriteSuccessResult {
  return result.name === 'todo_write' && result.status === 'success' && result.type === 'text';
}

export function isAssignResult(result: ToolExecutionResult): result is ToolExecutionResult {
  return result.name === 'assign_task';
}

export function isAssignSuccess(result: ToolExecutionResult): result is AssignSuccessResult {
  return result.name === 'assign_task' && result.status === 'success' && result.type === 'text';
}
