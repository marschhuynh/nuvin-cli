/**
 * Tool icon displayed in header
 */
export const TOOL_ICON = '⚙︎';

/**
 * Get the main argument to display inline with tool name.
 * 
 * This extracts the most important argument from a tool call
 * to show as a summary (e.g., file path for file_read, command for bash_tool).
 */
export function getMainArg(toolName: string, args: Record<string, unknown>): string | undefined {
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
    case 'web_search':
      return args.query as string | undefined;
    case 'bash_tool': {
      const cmd = args.cmd as string | undefined;
      const cwd = args.cwd as string | undefined;
      if (!cmd) return undefined;
      return cwd ? `${cmd} at ${cwd}` : cmd;
    }
    case 'skill':
      return args.name as string | undefined;
    case 'todo_write':
      return undefined; // No simple main arg for todo
    default:
      return undefined;
  }
}
