import { promises as fs } from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import type { FileReadMetadata } from './tool-result-metadata.js';
import type { FileMetadata, LineRangeMetadata } from './metadata-types.js';

export type FileReadParams = {
  path: string;
  lineStart?: number;
  lineEnd?: number;
};

export type FileReadSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata?: FileReadMetadata;
};

export type FileReadErrorResult = ExecResultError & {
  metadata?: {
    path?: string;
    errorReason?: ErrorReason;
  };
};

export type FileReadResult = FileReadSuccessResult | FileReadErrorResult;

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

export class FileReadTool implements FunctionTool<FileReadParams, ToolExecutionContext, FileReadResult> {
  name = 'file_read' as const;

  private readonly rootDir: string;
  private readonly maxBytesDefault: number;
  private readonly maxBytesHard: number;
  private readonly maxContentBytes: number;
  private readonly allowAbsolute: boolean;

  constructor(opts: FileReadToolOptions = {}) {
    this.rootDir = path.resolve(opts.rootDir ?? process.cwd());
    this.maxBytesDefault = Math.max(1, opts.maxBytesDefault ?? 256 * 1024);
    this.maxBytesHard = Math.max(this.maxBytesDefault, opts.maxBytesHard ?? 1024 * 1024);
    this.maxContentBytes = 20_000;
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

  /**
   * Read file contents with optional line range selection
   *
   * @param params - File path and optional line range (lineStart, lineEnd)
   * @param context - Execution context with optional workspace directory
   * @returns File content as text with metadata including path, size, and line range
   *
   * @example
   * ```typescript
   * const result = await fileReadTool.execute({ path: 'package.json' });
   * if (result.status === 'success' && result.type === 'text') {
   *   console.log(result.result); // file contents
   *   console.log(result.metadata?.path); // resolved file path
   *   console.log(result.metadata?.size); // file size in bytes
   * }
   * ```
   */
  async execute(params: FileReadParams, context?: ToolExecutionContext): Promise<FileReadResult> {
    try {
      if (!params.path || typeof params.path !== 'string') {
        return err('Parameter "path" must be a non-empty string', undefined, ErrorReason.InvalidInput);
      }

      const abs = this.resolveSafePath(params.path, context);
      const st = await fs.stat(abs).catch(() => null);
      if (!st || !st.isFile()) return err(`File not found: ${params.path}`, { path: params.path }, ErrorReason.NotFound);

      if (st.size > this.maxBytesHard) {
        const fd = await fs.open(abs, 'r');
        const buf = Buffer.alloc(this.maxContentBytes);
        const { bytesRead } = await fd.read(buf, 0, this.maxContentBytes, 0);
        await fd.close();
        let preview = buf.slice(0, bytesRead).toString('utf8');
        preview = stripUtfBom(preview);
        // Trim to last complete line to avoid cutting mid-line
        const lastNl = preview.lastIndexOf('\n');
        if (lastNl > 0) preview = preview.slice(0, lastNl);
        const totalLines = preview.split(/\r?\n/).length;

        const result = preview
          + `\n\n<system-reminder>\nFile too large to read in full (${formatBytes(st.size)}). Showing first ${formatBytes(this.maxContentBytes)} preview (${totalLines} lines). Use lineStart/lineEnd parameters to read specific sections.\n</system-reminder>`;

        return okText(result, {
          path: params.path,
          created: st.birthtime.toISOString(),
          modified: st.mtime.toISOString(),
          size: st.size,
          encoding: 'utf8',
          bomStripped: false,
          truncated: true,
          totalLines,
        });
      }

      const payload = await fs.readFile(abs);
      let text = payload.toString('utf8');
      const bomStripped = text.charCodeAt(0) === 0xfeff;
      text = stripUtfBom(text);

      const metadata: FileMetadata & { lineRange?: LineRangeMetadata; encoding?: string; bomStripped?: boolean; truncated?: boolean; totalLines?: number } = {
        path: params.path,
        created: st.birthtime.toISOString(),
        modified: st.mtime.toISOString(),
        size: st.size,
        encoding: 'utf8',
        bomStripped,
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

        return okText(slice, {
          ...metadata,
          lineRange: {
            lineStart: lo,
            lineEnd: hi,
            linesTotal: totalLines,
          },
        });
      }

      // Truncate large full-file reads to keep LLM context manageable
      const textBytes = Buffer.byteLength(text, 'utf8');
      if (textBytes > this.maxContentBytes) {
        const totalLines = text.split(/\r?\n/).length;
        const truncated = truncateToByteLimit(text, this.maxContentBytes);
        const truncatedLineCount = truncated.split(/\r?\n/).length;

        const result = truncated
          + `\n\n<system-reminder>\nFile content has been truncated. Showing first ${truncatedLineCount} of ${totalLines} lines (${formatBytes(this.maxContentBytes)} of ${formatBytes(st.size)}). Use lineStart/lineEnd parameters to read specific sections of this file.\n</system-reminder>`;

        return okText(result, {
          ...metadata,
          truncated: true,
          totalLines,
        });
      }

      return okText(text, { ...metadata, truncated: false, totalLines: text.split(/\r?\n/).length });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return err(message, { path: params.path }, ErrorReason.Unknown);
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

/** Truncate a string to fit within a byte limit without cutting mid-line */
function truncateToByteLimit(text: string, maxBytes: number): string {
  const lines = text.split(/\r?\n/);
  let byteCount = 0;
  let lastLineIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineBytes = Buffer.byteLength(lines[i], 'utf8') + 1; // +1 for newline
    if (byteCount + lineBytes > maxBytes) break;
    byteCount += lineBytes;
    lastLineIndex = i + 1;
  }

  // Always include at least one line
  if (lastLineIndex === 0) lastLineIndex = 1;

  return lines.slice(0, lastLineIndex).join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
