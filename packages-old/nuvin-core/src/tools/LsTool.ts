import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import type { LsMetadata } from './tool-result-metadata.js';

export type LsParams = {
  path?: string;
  limit?: number;
};

type LsToolOptions = {
  /** Workspace root for safe path resolution. Defaults to process.cwd(). */
  rootDir?: string;

  /** Allow absolute paths (still must reside inside rootDir). Default: false */
  allowAbsolute?: boolean;
};

export type DirEntry = {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
  mtime?: number;
  mode?: number;
  lineCount?: number;
};

export type LsSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata?: LsMetadata;
};

export type LsResult = LsSuccessResult | ExecResultError;

export class LsTool implements FunctionTool<LsParams, ToolExecutionContext, LsResult> {
  name = 'ls_tool' as const;

  private readonly rootDir: string;
  private readonly allowAbsolute: boolean;

  constructor(opts: LsToolOptions = {}) {
    this.rootDir = path.resolve(opts.rootDir ?? process.cwd());
    this.allowAbsolute = !!opts.allowAbsolute;
  }

  parameters = {
    type: 'object',
    properties: {
      // description: { type: 'string', description: 'Explanation of what directory is being listed and why (e.g., "List source files in the components directory")' },
      path: {
        type: 'string',
        description: 'List contents of this directory path',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        description: 'Maximum number of directory entries to return',
      },
    },
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: [
        'List files and directories in a specified directory.',
        'Returns entries sorted alphabetically by name as structured JSON.',
        '',
        'Typical uses:',
        '1) List all files in current directory',
        '2) List only directories with metadata',
        '3) List files including hidden ones',
      ].join('\n'),
      parameters: this.parameters,
    };
  }

  private async isTextFile(filePath: string): Promise<boolean> {
    try {
      const buffer = await fs.readFile(filePath, { encoding: null });
      const chunk = buffer.slice(0, Math.min(1024, buffer.length));

      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  private async countLines(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.split('\n').length;
    } catch {
      return 0;
    }
  }

  /**
   * List directory contents as structured JSON
   *
   * @param params - Directory path and optional limit
   * @param context - Execution context with optional workspace directory
   * @returns Structured JSON with directory entries including name, type, size, and metadata
   *
   * @example
   * ```typescript
   * const result = await lsTool.execute({ path: 'src/tools', limit: 50 });
   * if (result.status === 'success' && result.type === 'json') {
   *   console.log(result.result.path); // 'src/tools'
   *   console.log(result.result.total); // number of entries
   *   result.result.entries.forEach(entry => {
   *     console.log(`${entry.name} (${entry.type}): ${entry.size} bytes`);
   *   });
   * }
   * ```
   */
  async execute(params: LsParams, context?: ToolExecutionContext): Promise<LsResult> {
    try {
      const targetPath = params.path ?? '.';
      const includeHidden = true;
      const limit = Math.min(params.limit ?? 1000, 10000);

      const abs = this.resolveSafePath(targetPath, context);

      const st = await fs.stat(abs).catch(() => null);
      if (!st) {
        return err(`Directory not found: ${targetPath}`, undefined, ErrorReason.NotFound);
      }
      if (!st.isDirectory()) {
        return err(`Path is not a directory: ${targetPath}`, undefined, ErrorReason.InvalidInput);
      }

      const entries = await fs.readdir(abs);
      const results: DirEntry[] = [];

      for (const entry of entries) {
        if (!includeHidden && entry.startsWith('.')) {
          continue;
        }

        if (results.length >= limit) {
          break;
        }

        const entryPath = path.join(abs, entry);
        let entryStat: Awaited<ReturnType<typeof fs.stat>> | null = null;

        try {
          entryStat = await fs.stat(entryPath);
        } catch {
          continue;
        }

        let entryType: DirEntry['type'] = 'other';
        if (entryStat.isFile()) entryType = 'file';
        else if (entryStat.isDirectory()) entryType = 'directory';
        else if (entryStat.isSymbolicLink()) entryType = 'symlink';

        const dirEntry: DirEntry = {
          name: entry,
          type: entryType,
        };

        if (entryStat) {
          dirEntry.size = entryStat.size;
          dirEntry.mtime = entryStat.mtimeMs;
          dirEntry.mode = entryStat.mode;

          if (entryType === 'file' && (await this.isTextFile(entryPath))) {
            dirEntry.lineCount = await this.countLines(entryPath);
          }
        }

        results.push(dirEntry);
      }

      results.sort((a, b) => a.name.localeCompare(b.name));

      const yamlData = {
        path: targetPath,
        total: results.length,
        truncated: entries.length > limit,
        entries: results.map((entry) => {
          const e: Record<string, unknown> = { name: entry.name, type: entry.type };
          if (entry.size !== undefined) e.size = entry.size;
          if (entry.mode !== undefined) e.mode = entry.mode;
          if (entry.mtime !== undefined) e.mtime = entry.mtime;
          if (entry.lineCount !== undefined) e.lines = entry.lineCount;
          return e;
        }),
      };

      const result: LsSuccessResult = okText(
        yaml.stringify(yamlData, { indent: 2, lineWidth: 0 }),
        {
          limit,
          includeHidden,
        },
      );
      return result;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
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
