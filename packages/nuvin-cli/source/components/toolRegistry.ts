import type { ToolParamRendererComponent } from '@/components/ToolCallViewer/params/index.js';
import {
  FileEditParamRender,
  FileNewParamRender,
  DefaultParamRender,
  AssignTaskParamRender,
} from '@/components/ToolCallViewer/params/index.js';
import type { StatusStrategy } from '@/components/ToolCallViewer/ToolResultView/statusStrategies/index.js';
import {
  assignTaskStrategy,
  bashToolStrategy,
  defaultStrategy,
  dirLsStrategy,
  globStrategy,
  grepStrategy,
  fileEditStrategy,
  fileNewStrategy,
  fileReadStrategy,
  todoWriteStrategy,
  webFetchStrategy,
  webSearchStrategy,
} from '@/components/ToolCallViewer/ToolResultView/statusStrategies/strategies.js';

export type ToolMetadata = {
  displayName: string;
  statusStrategy: StatusStrategy;
  paramRenderer: ToolParamRendererComponent | null;
  collapsedByDefault: boolean;
};

const TOOL_REGISTRY: Record<string, ToolMetadata> = {
  file_read: {
    displayName: 'Read file',
    statusStrategy: fileReadStrategy,
    paramRenderer: DefaultParamRender,
    collapsedByDefault: true,
  },
  file_edit: {
    displayName: 'Edit file',
    statusStrategy: fileEditStrategy,
    paramRenderer: FileEditParamRender,
    collapsedByDefault: false,
  },
  file_new: {
    displayName: 'Create file',
    statusStrategy: fileNewStrategy,
    paramRenderer: FileNewParamRender,
    collapsedByDefault: true,
  },
  bash_tool: {
    displayName: 'Run command',
    statusStrategy: bashToolStrategy,
    paramRenderer: DefaultParamRender,
    collapsedByDefault: false,
  },
  web_search: {
    displayName: 'Search web',
    statusStrategy: webSearchStrategy,
    paramRenderer: DefaultParamRender,
    collapsedByDefault: false,
  },
  web_fetch: {
    displayName: 'Fetch page',
    statusStrategy: webFetchStrategy,
    paramRenderer: DefaultParamRender,
    collapsedByDefault: false,
  },
  ls_tool: {
    displayName: 'List directory',
    statusStrategy: dirLsStrategy,
    paramRenderer: DefaultParamRender,
    collapsedByDefault: true,
  },
  glob_tool: {
    displayName: 'Find files',
    statusStrategy: globStrategy,
    paramRenderer: DefaultParamRender,
    collapsedByDefault: false,
  },
  grep_tool: {
    displayName: 'Search content',
    statusStrategy: grepStrategy,
    paramRenderer: DefaultParamRender,
    collapsedByDefault: false,
  },
  todo_write: {
    displayName: 'Update todo',
    statusStrategy: todoWriteStrategy,
    paramRenderer: null,
    collapsedByDefault: false,
  },
  assign_task: {
    displayName: 'Delegate task',
    statusStrategy: assignTaskStrategy,
    paramRenderer: AssignTaskParamRender,
    collapsedByDefault: true,
  },
  lsp: {
    displayName: 'Language server',
    statusStrategy: defaultStrategy,
    paramRenderer: DefaultParamRender,
    collapsedByDefault: false,
  },
};

const DEFAULT_METADATA: ToolMetadata = {
  displayName: '',
  statusStrategy: defaultStrategy,
  paramRenderer: DefaultParamRender,
  collapsedByDefault: false,
};

export function getToolMetadata(toolName: string): ToolMetadata {
  return TOOL_REGISTRY[toolName] ?? { ...DEFAULT_METADATA, displayName: toolName };
}

export function getToolDisplayName(toolName: string): string {
  return TOOL_REGISTRY[toolName]?.displayName || toolName;
}

export function isCollapsedTool(toolName: string): boolean {
  return TOOL_REGISTRY[toolName]?.collapsedByDefault ?? false;
}
