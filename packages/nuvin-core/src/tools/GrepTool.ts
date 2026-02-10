import * as path from 'node:path';
import { stat } from 'node:fs/promises';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import * as Ripgrep from './ripgrep.js';
import type { GrepToolMetadata } from './tool-result-metadata.js';

export type GrepParams = {
  pattern: string;
  path?: string;
  include?: string;
  limit?: number;
  context?: number;
};

export type GrepSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata?: GrepToolMetadata;
};

export type GrepResult = GrepSuccessResult | ExecResultError;

type GrepToolOptions = {
  rootDir?: string;
  allowAbsolute?: boolean;
};

const MAX_LINE_LENGTH = 2000;

export class GrepTool implements FunctionTool<GrepParams, ToolExecutionContext, GrepResult> {
  name = 'grep_tool' as const;

  private readonly rootDir: string;
  private readonly allowAbsolute: boolean;

  constructor(opts: GrepToolOptions = {}) {
    this.rootDir = path.resolve(opts.rootDir ?? process.cwd());
    this.allowAbsolute = !!opts.allowAbsolute;
  }

  parameters = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for in file contents',
      },
      path: {
        type: 'string',
        description: 'File or directory to search in. Defaults to current working directory.',
      },
      include: {
        type: 'string',
        description: 'File pattern filter (e.g., "*.js", "*.{ts,tsx}"). Only applies when path is a directory.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of matches to return. Defaults to 100.',
        minimum: 1,
      },
      context: {
        type: 'integer',
        description: 'Number of lines to show before and after each match.',
        minimum: 1,
      },
    },
    required: ['pattern'],
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: [
        'Search for a regex pattern in file contents.',
        'Uses ripgrep for fast content search.',
        'Returns up to 100 matches sorted by file modification time (most recent first).',
        '',
        'Examples:',
        '- pattern: "function.*export" - Find exported functions',
        '- pattern: "TODO|FIXME", include: "*.ts" - Find todos in TypeScript files',
        '- pattern: "import.*react", path: "src" - Find React imports in src/',
        '- pattern: "^import", path: "src/file.ts" - Search a single file',
        '- pattern: "handleClick", path: "src/component.tsx", context: 5 - Show 5 lines before/after matches',
      ].join('\n'),
      parameters: this.parameters,
    };
  }

  async execute(params: GrepParams, context?: ToolExecutionContext): Promise<GrepResult> {
    try {
      if (!params.pattern) {
        return err('pattern is required', undefined, ErrorReason.InvalidInput);
      }

      const searchPath = this.resolveSafePath(params.path ?? '.', context);

      const pathStat = await stat(searchPath).catch(() => null);
      const isFile = pathStat?.isFile() ?? false;
      const isDir = pathStat?.isDirectory() ?? false;

      if (!isFile && !isDir) {
        return err(`Path not found: ${params.path ?? '.'}`, undefined, ErrorReason.NotFound);
      }

      const limit = params.limit ?? 100;
      const matches = await Ripgrep.search({
        cwd: isDir ? searchPath : path.dirname(searchPath),
        pattern: params.pattern,
        glob: isDir ? params.include : undefined,
        limit,
        file: isFile ? searchPath : undefined,
        context: params.context,
      });

      const filesWithMtime: Map<string, { mtime: number; matches: typeof matches }> = new Map();

      for (const match of matches) {
        const fullPath = match.filePath;
        if (!filesWithMtime.has(fullPath)) {
          const fileStat = await stat(fullPath).catch(() => null);
          filesWithMtime.set(fullPath, {
            mtime: fileStat?.mtimeMs ?? 0,
            matches: [],
          });
        }
        filesWithMtime.get(fullPath)!.matches.push(match);
      }

      const sortedFiles = Array.from(filesWithMtime.entries()).sort((a, b) => b[1].mtime - a[1].mtime);

      const truncated = matches.length >= limit;
      const relativePath = path.relative(this.rootDir, searchPath) || '.';
      const baseDir = isFile ? path.dirname(searchPath) : searchPath;
      const matchCount = matches.filter((m) => !m.isContext).length;

      let output = '';
      if (matches.length === 0) {
        output = `No matches found for pattern: ${params.pattern}`;
      } else {
        output = `Found ${matchCount} match${matchCount === 1 ? '' : 'es'}\n`;

        for (const [filePath, fileData] of sortedFiles) {
          const relFilePath = isFile ? path.basename(filePath) : path.relative(baseDir, filePath);
          output += `\n${relFilePath}:\n`;

          for (const match of fileData.matches) {
            const lineText =
              match.lineText.length > MAX_LINE_LENGTH
                ? match.lineText.substring(0, MAX_LINE_LENGTH) + '...'
                : match.lineText;
            const prefix = match.isContext ? '  ' : '> ';
            output += `${prefix}Line ${match.lineNum}: ${lineText}\n`;
          }
        }

        if (truncated) {
          output += '\n(Results are truncated. Consider using a more specific path or pattern.)';
        }
      }

      const result: GrepSuccessResult = okText(output.trim(), {
        searchPath: relativePath,
        pattern: params.pattern,
        include: isDir ? params.include : undefined,
        matchCount,
        fileCount: filesWithMtime.size,
        truncated,
      });

      return result;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
        return err(message, undefined, ErrorReason.NotFound);
      }
      return err(message, undefined, ErrorReason.Unknown);
    }
  }

  private resolveSafePath(target: string, context?: ToolExecutionContext): string {
    const baseFromCtx = context?.workspaceRoot || context?.cwd || this.rootDir;
    const base = path.resolve(String(baseFromCtx ?? this.rootDir));
    const abs = path.resolve(base, target);

    if (!this.allowAbsolute && path.isAbsolute(target) && !abs.startsWith(base)) {
      throw new Error('Absolute paths are not allowed. Provide a path relative to the workspace root.');
    }

    if (!this.allowAbsolute) {
      const rel = path.relative(base, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path escapes workspace root: ${target}`);
      }
    }

    return abs;
  }
}
