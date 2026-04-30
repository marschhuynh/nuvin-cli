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
  let mainArg: string | undefined;

  switch (toolName) {
    case 'file_read':
    case 'ls_tool': {
      const path = args.path as string | undefined;
      if (!path) return undefined;
      const lineStart = args.lineStart as number | undefined;
      const lineEnd = args.lineEnd as number | undefined;
      if (lineStart !== undefined && lineEnd !== undefined) {
        mainArg = `${path}:${lineStart}-${lineEnd}`;
      } else if (lineStart !== undefined) {
        mainArg = `${path}:${lineStart}`;
      } else {
        mainArg = path;
      }
      break;
    }
    case 'file_new':
    case 'file_edit':
      mainArg = args.file_path as string | undefined;
      break;
    case 'grep_tool': {
      const pattern = args.pattern as string | undefined;
      const path = args.path as string | undefined;
      if (!pattern) {
        mainArg = undefined;
      } else if (path) {
        mainArg = `${pattern} at ${path}`;
      } else {
        mainArg = pattern;
      }
      break;
    }
    case 'glob_tool':
      mainArg = args.pattern as string | undefined;
      break;
    case 'lsp': {
      const operation = args.operation as string | undefined;
      const filePath = args.filePath as string | undefined;
      const line = args.line as number | undefined;
      if (!filePath) {
        mainArg = operation;
      } else {
        let formatted = filePath;
        if (line !== undefined) {
          formatted += `:${line}`;
          const character = args.character as number | undefined;
          if (character !== undefined) formatted += `:${character}`;
        }
        mainArg = operation ? `${operation} ${formatted}` : formatted;
      }
      break;
    }
    case 'web_fetch':
      mainArg = args.url as string | undefined;
      break;
    case 'web_search':
      mainArg = args.query as string | undefined;
      break;
    case 'bash_tool': {
      const cmd = args.cmd as string | undefined;
      const cwd = args.cwd as string | undefined;
      if (!cmd) return undefined;
      mainArg = cwd ? `${cmd} at ${cwd}` : cmd;
      break;
    }
    case 'skill':
      mainArg = args.name as string | undefined;
      break;
    case 'todo_write':
      return undefined; // No simple main arg for todo
    default:
      return undefined;
  }

  // Append limit if present
  if (mainArg && args.limit !== undefined) {
    const limit = args.limit as number;
    mainArg += ` with limit: ${limit}`;
  }

  return mainArg;
}
