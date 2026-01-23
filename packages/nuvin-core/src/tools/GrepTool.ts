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
        description: 'Directory to search in. Defaults to current working directory.',
      },
      include: {
        type: 'string',
        description: 'File pattern filter (e.g., "*.js", "*.{ts,tsx}")',
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of matches to return. Defaults to 100.',
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
      if (!pathStat?.isDirectory()) {
        return err(`Directory not found: ${params.path ?? '.'}`, undefined, ErrorReason.NotFound);
      }

      const limit = params.limit ?? 100;
      const matches = await Ripgrep.search({
        cwd: searchPath,
        pattern: params.pattern,
        glob: params.include,
        limit,
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

      let output = '';
      if (matches.length === 0) {
        output = `No matches found for pattern: ${params.pattern}`;
      } else {
        output = `Found ${matches.length} match${matches.length === 1 ? '' : 'es'}\n`;

        for (const [filePath, fileData] of sortedFiles) {
          const relFilePath = path.relative(searchPath, filePath);
          output += `\n${relFilePath}:\n`;

          for (const match of fileData.matches) {
            const lineText =
              match.lineText.length > MAX_LINE_LENGTH
                ? match.lineText.substring(0, MAX_LINE_LENGTH) + '...'
                : match.lineText;
            output += `  Line ${match.lineNum}: ${lineText}\n`;
          }
        }

        if (truncated) {
          output += '\n(Results are truncated. Consider using a more specific path or pattern.)';
        }
      }

      const result: GrepSuccessResult = okText(output.trim(), {
        searchPath: relativePath,
        pattern: params.pattern,
        include: params.include,
        matchCount: matches.length,
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
