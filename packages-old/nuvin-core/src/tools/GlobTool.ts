import * as path from 'node:path';
import { stat } from 'node:fs/promises';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import * as Ripgrep from './ripgrep.js';
import type { GlobToolMetadata } from './tool-result-metadata.js';

export type GlobParams = {
  pattern: string;
  path?: string;
};

export type GlobSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata?: GlobToolMetadata;
};

export type GlobResult = GlobSuccessResult | ExecResultError;

type GlobToolOptions = {
  rootDir?: string;
  allowAbsolute?: boolean;
};

export class GlobTool implements FunctionTool<GlobParams, ToolExecutionContext, GlobResult> {
  name = 'glob_tool' as const;

  private readonly rootDir: string;
  private readonly allowAbsolute: boolean;

  constructor(opts: GlobToolOptions = {}) {
    this.rootDir = path.resolve(opts.rootDir ?? process.cwd());
    this.allowAbsolute = !!opts.allowAbsolute;
  }

  parameters = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files (e.g., "*.ts", "src/**/*.js", "**/*.test.ts")',
      },
      path: {
        type: 'string',
        description: 'Directory to search in. Defaults to current working directory.',
      },
    },
    required: ['pattern'],
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: [
        'Search for files matching a glob pattern.',
        'Uses ripgrep for fast file discovery.',
        'Returns up to 100 files sorted by modification time (most recent first).',
        '',
        'Examples:',
        '- "*.ts" - All TypeScript files in current directory',
        '- "src/**/*.js" - All JS files under src/',
        '- "**/*.test.ts" - All test files recursively',
      ].join('\n'),
      parameters: this.parameters,
    };
  }

  async execute(params: GlobParams, context?: ToolExecutionContext): Promise<GlobResult> {
    try {
      if (!params.pattern) {
        return err('pattern is required', undefined, ErrorReason.InvalidInput);
      }

      const searchPath = this.resolveSafePath(params.path ?? '.', context);

      const pathStat = await stat(searchPath).catch(() => null);
      if (!pathStat?.isDirectory()) {
        return err(`Directory not found: ${params.path ?? '.'}`, undefined, ErrorReason.NotFound);
      }

      const limit = 100;
      const files: { path: string; mtime: number }[] = [];
      let truncated = false;

      for await (const file of Ripgrep.files({ cwd: searchPath, glob: [params.pattern] })) {
        if (files.length >= limit) {
          truncated = true;
          break;
        }

        const fullPath = path.join(searchPath, file);
        const fileStat = await stat(fullPath).catch(() => null);
        const mtime = fileStat?.mtimeMs ?? 0;

        files.push({ path: file, mtime });
      }

      files.sort((a, b) => b.mtime - a.mtime);

      const relativePath = path.relative(this.rootDir, searchPath) || '.';
      let output = files.map((f) => f.path).join('\n');

      if (truncated) {
        output += '\n(Results are truncated. Consider using a more specific path or pattern.)';
      }

      if (files.length === 0) {
        output = `No files found matching pattern: ${params.pattern}`;
      }

      const result: GlobSuccessResult = okText(output, {
        searchPath: relativePath,
        pattern: params.pattern,
        count: files.length,
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
