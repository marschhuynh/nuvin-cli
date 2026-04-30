import { promises as fs } from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import type { FileNewMetadata } from './tool-result-metadata.js';

export type FileNewParams = {
  file_path: string;
  content: string;
};

export type FileNewSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata: FileNewMetadata;
};

export type FileNewResult = FileNewSuccessResult | ExecResultError;

export class FileNewTool implements FunctionTool<FileNewParams, ToolExecutionContext, FileNewResult> {
  name = 'file_new' as const;
  private readonly rootDir: string;

  constructor(opts: { rootDir?: string } = {}) {
    this.rootDir = path.resolve(opts.rootDir ?? process.cwd());
  }

  parameters = {
    type: 'object',
    properties: {
      // description: { type: 'string', description: 'Explanation of what file is being created and its purpose (e.g., "Create configuration file for database connection")' },
      file_path: { type: 'string', description: 'Path where the new file will be created' },
      content: { type: 'string', description: 'Text content to write to the new file' },
    },
    required: ['file_path', 'content'],
    additionalProperties: false,
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: 'Create a new file with text content. IMPORTANT: The file_path must be absolute, not relative',
      parameters: this.parameters,
    };
  }

  async execute(p: FileNewParams, ctx?: ToolExecutionContext): Promise<FileNewResult> {
    try {
      if (!p.file_path?.trim()) return err('Parameter "file_path" is required.', undefined, ErrorReason.InvalidInput);
      if (typeof p.content !== 'string') return err('"content" must be a string.', undefined, ErrorReason.InvalidInput);

      const abs = this.resolveSafePath(p.file_path, ctx);

      const existsBefore = await fs.stat(abs).then(() => true).catch(() => false);

      await fs.mkdir(path.dirname(abs), { recursive: true });

      const bytes = Buffer.from(p.content, 'utf8');
      const lines = p.content.split(/\r?\n/).length;
      await this.writeAtomic(abs, bytes);

      return okText(`File written at ${p.file_path}.`, { 
        file_path: p.file_path, 
        bytes: bytes.length,
        lines,
        created: new Date().toISOString(),
        overwritten: existsBefore,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return err(message, undefined, ErrorReason.Unknown);
    }
  }

  // helpers
  private async writeAtomic(target: string, bytes: Buffer) {
    const dir = path.dirname(target);
    const tmp = path.join(dir, `.tmp.${path.basename(target)}.${Math.random().toString(36).slice(2, 8)}`);
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, target);
  }
  private resolveSafePath(target: string, ctx?: ToolExecutionContext): string {
    const base = path.resolve(String(ctx?.workspaceRoot ?? ctx?.cwd ?? this.rootDir));
    const abs = path.resolve(base, target);
    // const rel = path.relative(base, abs);
    // if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Path escapes workspace: ${target}`);
    return abs;
  }
}
