import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import type { FileEditMetadata } from './tool-result-metadata.js';

export type FileEditSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata: FileEditMetadata;
};

export type FileEditResult = FileEditSuccessResult | ExecResultError;

export class FileEditTool implements FunctionTool<FileWriteOrEditParams, ToolExecutionContext, FileEditResult> {
  name = 'file_edit' as const;

  private readonly rootDir: string;
  private readonly maxBytes: number;

  constructor(opts: { rootDir?: string; maxBytes?: number } = {}) {
    this.rootDir = path.resolve(opts.rootDir ?? process.cwd());
    this.maxBytes = Math.max(1, opts.maxBytes ?? 4 * 1024 * 1024); // 4MB default cap
  }

  // JSON schema for this tool
  parameters = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description:
          'Explanation of what changes are being made and why (e.g., "Update import path to use new module structure")',
      },
      file_path: {
        type: 'string',
        description:
          'Path to the target file. "~" expands to the user\'s home directory. Relative paths are resolved within the workspace root.',
      },
      old_text: {
        type: 'string',
        description: 'The exact text to find in the file. Must match precisely including whitespace and line breaks.',
      },
      new_text: {
        type: 'string',
        description: 'The text to replace it with. Can be empty string to delete the old_text.',
      },
      dry_run: {
        type: 'boolean',
        default: false,
        description: 'Validate only; do not write to disk.',
      },
    },
    required: ['file_path', 'old_text', 'new_text'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: `
      Edits an existing file by replacing exact text matches. The file must already exist.

      - Finds the first occurrence of old_text in the file
      - Replaces it with new_text
      - Preserves the file's line ending style (LF or CRLF)

      IMPORTANT: old_text must match exactly, including all whitespace, indentation, and line breaks.
      To make a unique match, include enough surrounding context.`,
      parameters: this.parameters,
    };
  }

  async execute(p: FileWriteOrEditParams, ctx?: ToolExecutionContext): Promise<FileEditResult> {
    try {
      if (!p.file_path?.trim()) return err('Parameter "file_path" is required.', undefined, ErrorReason.InvalidInput);
      const abs = resolveAbsoluteWithinRoot(p.file_path, ctx, this.rootDir);

      if (typeof p.old_text !== 'string') {
        return err('old_text must be a string.', undefined, ErrorReason.InvalidInput);
      }
      if (typeof p.new_text !== 'string') {
        return err('new_text must be a string.', undefined, ErrorReason.InvalidInput);
      }

      const st = await fs.stat(abs).catch(() => null);
      const exists = !!st && st.isFile();

      if (!exists || !st) {
        return err('File does not exist. Use a file creation tool to create new files.', undefined, ErrorReason.NotFound);
      }

      if (st.size > this.maxBytes) {
        return err(`File too large (${st.size} bytes). Cap is ${this.maxBytes}.`, undefined, ErrorReason.InvalidInput);
      }

      const originalBytes = await fs.readFile(abs);
      const originalEol = detectEol(originalBytes) ?? 'lf';
      const originalText = originalBytes.toString('utf8');
      const originalLF = normalizeToLF(originalText);

      const oldTextLF = normalizeToLF(p.old_text);
      const newTextLF = normalizeToLF(p.new_text);

      const idx = originalLF.indexOf(oldTextLF);
      if (idx === -1) {
        const preview = oldTextLF.slice(0, 100).replace(/\n/g, '\\n');
        return err(
          `old_text not found in file. Make sure it matches exactly including whitespace.\nSearching for: "${preview}${oldTextLF.length > 100 ? '...' : ''}"`,
          undefined,
          ErrorReason.NotFound
        );
      }

      const resultLF = originalLF.slice(0, idx) + newTextLF + originalLF.slice(idx + oldTextLF.length);

      const finalText = convertEol(resultLF, originalEol);
      const finalBytes = Buffer.from(finalText, 'utf8');

      if (finalBytes.length > this.maxBytes) {
        return err(`Resulting file too large (${finalBytes.length} bytes). Cap is ${this.maxBytes}.`, undefined, ErrorReason.InvalidInput);
      }

      const beforeSha = sha256(originalBytes);
      const afterSha = sha256(finalBytes);
      const noChange = beforeSha === afterSha;

      if (!p.dry_run && !noChange) {
        await atomicWrite(abs, finalBytes);
      }

      const lineNumbers = this.calculateLineNumbers(originalLF, oldTextLF, newTextLF, idx);

      return okText(
        noChange
          ? 'No changes (content identical).'
          : p.dry_run
            ? 'Validated (dry run: no write).'
            : 'Edit applied successfully.',
        {
          path: showPath(abs, this.rootDir),
          created: st.birthtime.toISOString(),
          modified: st.mtime.toISOString(),
          size: st.size,
          eol: originalEol,
          oldTextLength: oldTextLF.length,
          newTextLength: newTextLF.length,
          bytesWritten: noChange ? 0 : finalBytes.length,
          beforeSha,
          afterSha,
          dryRun: !!p.dry_run,
          lineNumbers,
          noChange,
        },
      );
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e), undefined, ErrorReason.Unknown);
    }
  }

  private calculateLineNumbers(
    originalText: string,
    oldText: string,
    newText: string,
    matchIndex: number,
  ): {
    oldStartLine: number;
    oldEndLine: number;
    newStartLine: number;
    newEndLine: number;
    oldLineCount: number;
    newLineCount: number;
  } {
    const textBeforeMatch = originalText.slice(0, matchIndex);
    const oldStartLine = textBeforeMatch.split('\n').length;

    const oldTextTrimmed = oldText.replace(/\n$/, '');
    const oldLineCount = oldTextTrimmed.length === 0 ? 0 : oldTextTrimmed.split('\n').length;
    const oldEndLine = oldStartLine + oldLineCount - 1;

    const newTextTrimmed = newText.replace(/\n$/, '');
    const newLineCount = newTextTrimmed.length === 0 ? 0 : newTextTrimmed.split('\n').length;
    const newStartLine = oldStartLine;
    const newEndLine = newStartLine + newLineCount - 1;

    return {
      oldStartLine,
      oldEndLine,
      newStartLine,
      newEndLine,
      oldLineCount,
      newLineCount,
    };
  }
}

/* ----------------- types ----------------- */

type Eol = 'lf' | 'crlf';

export type FileWriteOrEditParams = {
  /** Path to the file to edit. "~" allowed. Relative paths resolved within workspace root. */
  file_path: string;
  /** The exact text to find in the file. */
  old_text: string;
  /** The text to replace it with. */
  new_text: string;
  /** Validate only; do not write. */
  dry_run?: boolean;
};

/* ----------------- helpers ----------------- */

function resolveAbsoluteWithinRoot(target: string, ctx?: ToolExecutionContext, rootDir?: string): string {
  const base = path.resolve(
    (ctx as { workspaceRoot?: string })?.workspaceRoot ?? (ctx as { cwd?: string })?.cwd ?? rootDir ?? process.cwd(),
  );
  const expanded = expandTilde(target.trim());
  const candidate = path.isAbsolute(expanded) ? expanded : path.resolve(base, expanded);
  const abs = path.normalize(candidate);
  const normalizedRoot = path.resolve(base);
  const rel = path.relative(normalizedRoot, abs);

  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path outside workspace root: ${target}`);
  }
  return abs;
}

function expandTilde(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function showPath(abs: string, root: string) {
  const rel = path.relative(root, abs);
  return rel && !rel.startsWith('..') ? rel : abs;
}

function detectEol(buf: Buffer): Eol | null {
  const s = buf.toString('utf8');
  if (/\r\n/.test(s)) return 'crlf';
  if (/\n/.test(s)) return 'lf';
  return null;
}

function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function convertEol(textLF: string, eol: Eol): string {
  return eol === 'crlf' ? textLF.replace(/\n/g, '\r\n') : textLF;
}

async function atomicWrite(target: string, bytes: Buffer) {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.tmp.${path.basename(target)}.${Math.random().toString(36).slice(2, 8)}`);
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, target);
}

function sha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
