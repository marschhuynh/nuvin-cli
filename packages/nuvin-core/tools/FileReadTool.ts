import { promises as fs } from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../ports.js';
import type { FunctionTool, ExecResult, ToolExecutionContext } from './types.js';
import { ok, err } from './result-helpers.js';

export type FileReadParams = {
  path: string;
  lineStart?: number;
  lineEnd?: number;
};

type FileReadToolOptions = {
  /** Workspace root for safe path resolution. Defaults to context.workspaceRoot or process.cwd(). */
  rootDir?: string;

  /** Default max bytes when caller omits limit (soft cap). Default: 256 KiB */
  maxBytesDefault?: number;

  /** Hard cap – never read beyond this amount in a single call. Default: 1 MiB */
  maxBytesHard?: number;

  /** Allow absolute paths (still must reside inside rootDir). Default: false */
  allowAbsolute?: boolean;
};

export class FileReadTool implements FunctionTool<FileReadParams, ToolExecutionContext> {
  name = 'file_read' as const;

  private readonly rootDir: string;
  private readonly maxBytesDefault: number;
  private readonly maxBytesHard: number;
  private readonly allowAbsolute: boolean;

  constructor(opts: FileReadToolOptions = {}) {
    this.rootDir = path.resolve(opts.rootDir ?? process.cwd());
    this.maxBytesDefault = Math.max(1, opts.maxBytesDefault ?? 256 * 1024);
    this.maxBytesHard = Math.max(this.maxBytesDefault, opts.maxBytesHard ?? 1024 * 1024);
    this.allowAbsolute = !!opts.allowAbsolute;
  }

  parameters = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Explanation of what file is being read and why (e.g., "Read package.json to check dependencies")',
      },
      path: { type: 'string', description: 'Read contents of this file' },
      lineStart: { type: 'integer', minimum: 1, description: 'Start reading from this line number (1-based)' },
      lineEnd: { type: 'integer', minimum: 1, description: 'Stop reading at this line number (inclusive)' },
    },
    required: ['path'],
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: 'Read files from workspace. Optionally specify line ranges (lineStart, lineEnd).',
      parameters: this.parameters,
    };
  }

  async execute(params: FileReadParams, context?: ToolExecutionContext): Promise<ExecResult> {
    try {
      if (!params.path || typeof params.path !== 'string') {
        return err('Parameter "path" must be a non-empty string');
      }

      const abs = this.resolveSafePath(params.path, context);
      const st = await fs.stat(abs).catch(() => null);
      if (!st || !st.isFile()) return err(`File not found: ${params.path}`);

      if (st.size > this.maxBytesHard) {
        return err(`File too large (${st.size} bytes). Hard cap is ${this.maxBytesHard} bytes.`);
      }

      const payload = await fs.readFile(abs);
      let text = payload.toString('utf8');
      text = stripUtfBom(text);

      const metadata = {
        path: params.path,
        created: st.birthtime.toISOString(),
        modified: st.mtime.toISOString(),
      };

      if (params.lineStart || params.lineEnd) {
        const lines = text.split(/\r?\n/);
        const totalLines = lines.length;
        const a = clamp(params.lineStart ?? 1, 1, totalLines);
        const b = clamp(params.lineEnd ?? totalLines, 1, totalLines);
        const [lo, hi] = a <= b ? [a, b] : [b, a];

        const numberedLines = lines.slice(lo - 1, hi).map((line, index) => {
          const lineNum = lo + index;
          return `${lineNum}│${line}`;
        });
        const slice = numberedLines.join('\n');

        return ok(slice, {
          ...metadata,
          linesTotal: totalLines,
          lineStart: lo,
          lineEnd: hi,
        });
      }

      return ok(text, metadata);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return err(message);
    }
  }

  // ---------- helpers ----------

  private resolveSafePath(target: string, context?: ToolExecutionContext): string {
    const baseFromCtx = context?.workspaceRoot || context?.cwd || this.rootDir;
    const base = path.resolve(String(baseFromCtx ?? this.rootDir));
    const abs = path.resolve(base, target);

    if (!this.allowAbsolute && path.isAbsolute(target) && !abs.startsWith(base)) {
      throw new Error('Absolute paths are not allowed. Provide a path relative to the workspace root.');
    }

    if (!this.allowAbsolute) {
      // Prevent escaping root
      const rel = path.relative(base, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path escapes workspace root: ${target}`);
      }
    }

    return abs;
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function stripUtfBom(s: string) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
