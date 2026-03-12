import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type SpillOptions = {
  /** Full output content to write */
  content: string | Buffer;
  /** Tool name, e.g. 'bash_tool' */
  toolName: string;
  /** Unique tool call ID */
  toolCallId: string;
  /** Session directory — if null, falls back to os.tmpdir() */
  sessionDir?: string | null;
};

/**
 * Write tool output to a session-scoped file.
 *
 * File is written as `{toolName}_{toolCallId}.log` inside the session
 * directory (or os.tmpdir() if no session dir is available).
 *
 * @returns The absolute path of the written file
 */
export function spillToolOutput(opts: SpillOptions): string {
  const dir = opts.sessionDir || os.tmpdir();

  // Sanitize toolCallId for safe filename (replace non-alphanumeric except - and _)
  const safeId = opts.toolCallId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${opts.toolName}_${safeId}.log`;
  const filePath = path.join(dir, filename);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, opts.content);

  return filePath;
}

/**
 * Open a spill file for incremental writing.
 *
 * Returns an object with `write()` to append chunks and `close()` to finalize.
 * Call `close()` to get the final file path.
 */
export function openToolOutputSpill(opts: Omit<SpillOptions, 'content'>): ToolOutputSpillHandle {
  const dir = opts.sessionDir || os.tmpdir();
  const safeId = opts.toolCallId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${opts.toolName}_${safeId}.log`;
  const filePath = path.join(dir, filename);

  fs.mkdirSync(dir, { recursive: true });
  const stream = fs.createWriteStream(filePath);

  return {
    path: filePath,
    write(chunk: string | Buffer) {
      stream.write(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    },
    close() {
      stream.end();
    },
  };
}

export interface ToolOutputSpillHandle {
  /** Absolute path of the spill file */
  readonly path: string;
  /** Append a chunk to the spill file */
  write(chunk: string | Buffer): void;
  /** Close the file descriptor */
  close(): void;
}
