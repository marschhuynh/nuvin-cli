/**
 * Tool call title formatting and kind inference for ACP session/update events.
 * Extracted from AcpServer to keep the server class focused on protocol handling.
 */

export type AcpToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other';

export function inferToolKind(toolName: string): AcpToolKind {
  switch (toolName) {
    case 'file_read':
    case 'ls_tool':
      return 'read';
    case 'file_edit':
    case 'file_new':
      return 'edit';
    case 'web_search':
      return 'search';
    case 'web_fetch':
      return 'fetch';
    case 'bash_tool':
      return 'execute';
    default:
      return 'other';
  }
}

export function formatToolCallTitle(toolName: string, rawInput?: unknown): string {
  const input = asObject(rawInput);
  const description = getString(input, 'description');

  switch (toolName) {
    case 'bash_tool': {
      const cmd = getString(input, 'cmd');
      return cmd ? `Command: ${truncate(cmd, 80)}` : 'Run command';
    }
    case 'file_read': {
      const filePath = getString(input, 'path');
      return filePath ? `Read file: ${truncate(filePath, 80)}` : 'Read file';
    }
    case 'file_edit': {
      const filePath = getString(input, 'file_path');
      return filePath ? `Edit file: ${truncate(filePath, 80)}` : 'Edit file';
    }
    case 'file_new': {
      const filePath = getString(input, 'file_path');
      return filePath ? `Create file: ${truncate(filePath, 80)}` : 'Create file';
    }
    case 'ls_tool': {
      const targetPath = getString(input, 'path');
      return targetPath ? `List files: ${truncate(targetPath, 80)}` : 'List files';
    }
    case 'glob_tool': {
      const pattern = getString(input, 'pattern');
      const targetPath = getString(input, 'path');
      if (pattern && targetPath) return `Find files: ${truncate(pattern, 50)} in ${truncate(targetPath, 30)}`;
      if (pattern) return `Find files: ${truncate(pattern, 80)}`;
      return 'Find files';
    }
    case 'grep_tool': {
      const pattern = getString(input, 'pattern');
      const targetPath = getString(input, 'path');
      if (pattern && targetPath) return `Search text: ${truncate(pattern, 40)} in ${truncate(targetPath, 30)}`;
      if (pattern) return `Search text: ${truncate(pattern, 80)}`;
      return 'Search text';
    }
    case 'web_search': {
      const query = getString(input, 'query');
      return query ? `Web search: ${truncate(query, 80)}` : 'Web search';
    }
    case 'web_fetch': {
      const url = getString(input, 'url');
      return url ? `Fetch URL: ${truncate(url, 80)}` : 'Fetch URL';
    }
    case 'todo_write': {
      const todos = input?.todos;
      if (Array.isArray(todos)) {
        return `Update todo list (${todos.length})`;
      }
      return 'Update todo list';
    }
    case 'assign_task': {
      const agent = getString(input, 'agent');
      const task = getString(input, 'task');
      if (agent && task) return `Delegate to ${agent}: ${truncate(task, 60)}`;
      if (task) return `Delegate task: ${truncate(task, 80)}`;
      return 'Delegate task';
    }
    case 'skill': {
      const name = getString(input, 'name');
      return name ? `Load skill: ${name}` : 'Load skill';
    }
    case 'lsp': {
      const operation = getString(input, 'operation');
      const filePath = getString(input, 'filePath');
      if (operation && filePath) return `Code intel: ${operation} (${truncate(filePath, 50)})`;
      if (operation) return `Code intel: ${operation}`;
      return 'Code intelligence query';
    }
    default: {
      if (description) return truncate(description, 90);
      return humanizeToolName(toolName);
    }
  }
}

export function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char: string) => char.toUpperCase());
}

export function safeParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────

function asObject(input: unknown): Record<string, unknown> | null {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return null;
}

function getString(input: Record<string, unknown> | null, key: string): string {
  const value = input?.[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '';
  }
  return '';
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}
