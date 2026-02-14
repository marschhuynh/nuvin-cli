import * as os from 'node:os';
import * as path from 'node:path';
import { FileLogger } from '@/utils/file-logger.js';

function isEnabled(flag: string | undefined): boolean {
  if (!flag) return false;
  const normalized = flag.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseMaxEntries(raw: string | undefined): number {
  if (!raw) return 30000;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 30000;
  return parsed;
}

function asBuffer(chunk: unknown, encoding: BufferEncoding | undefined): Buffer | null {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (typeof chunk === 'string') {
    return Buffer.from(chunk, encoding ?? 'utf8');
  }

  return null;
}

function escapeForLog(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const char = input[i] ?? '';
    const code = char.charCodeAt(0);

    if (char === '\x1b') out += '<ESC>';
    else if (char === '\n') out += '\\n';
    else if (char === '\r') out += '\\r';
    else if (char === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`;
    else out += char;
  }
  return out;
}

function classifyChunk(text: string): {
  hasEsc: boolean;
  hasCursorMove: boolean;
  hasClear: boolean;
  hasAltScreenSwitch: boolean;
} {
  const hasEsc = text.includes('\x1b');
  const hasCursorMove = /\x1b\[[0-9;?]*[ABCDHFGJKfmsu]/.test(text);
  const hasClear = text.includes('\x1b[2J') || text.includes('\x1b[J') || text.includes('\x1b[K');
  const hasAltScreenSwitch = text.includes('\x1b[?1049h') || text.includes('\x1b[?1049l');

  return {
    hasEsc,
    hasCursorMove,
    hasClear,
    hasAltScreenSwitch,
  };
}

type WritableWithPatched = NodeJS.WriteStream & { write: NodeJS.WriteStream['write'] };

function patchWrite(
  stream: WritableWithPatched,
  streamName: 'stdout' | 'stderr',
  logger: FileLogger,
  options: {
    maxEntries: number;
    verbose: boolean;
    state: { count: number; warned: boolean; seq: number };
  },
): () => void {
  const originalWrite = stream.write;

  stream.write = function patchedWrite(
    chunk: unknown,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean {
    const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
    const buffer = asBuffer(chunk, encoding);

    if (buffer) {
      if (options.state.count < options.maxEntries) {
        options.state.count += 1;
        options.state.seq += 1;

        const text = buffer.toString(encoding ?? 'utf8');
        const escaped = escapeForLog(text);
        const previewLimit = options.verbose ? 4000 : 400;

        logger.debug('terminal write', {
          seq: options.state.seq,
          stream: streamName,
          bytes: buffer.length,
          encoding: encoding ?? 'buffer/utf8',
          preview: escaped.slice(0, previewLimit),
          truncated: escaped.length > previewLimit,
          ...classifyChunk(text),
        });
      } else if (!options.state.warned) {
        options.state.warned = true;
        logger.warn('terminal write log reached max entries', {
          maxEntries: options.maxEntries,
        });
      }
    }

    return originalWrite.call(stream, chunk as never, encodingOrCallback as never, callback as never);
  } as NodeJS.WriteStream['write'];

  return () => {
    stream.write = originalWrite;
  };
}

export function installTerminalWriteDebugLogger(): () => void {
  if (!isEnabled(process.env.NUVIN_TERMINAL_WRITE_DEBUG)) {
    return () => {};
  }

  const verbose = isEnabled(process.env.NUVIN_TERMINAL_WRITE_DEBUG_VERBOSE);
  const includeStderr = isEnabled(process.env.NUVIN_TERMINAL_WRITE_DEBUG_STDERR);
  const maxEntries = parseMaxEntries(process.env.NUVIN_TERMINAL_WRITE_DEBUG_MAX_ENTRIES);
  const logFileName = process.env.NUVIN_TERMINAL_WRITE_DEBUG_FILE || 'terminal-write-debug';

  const logger = new FileLogger({
    logDir: path.join(os.homedir(), '.nuvin', 'logs'),
    logFileName,
    minLevel: 'debug',
    maxFileSize: 50 * 1024 * 1024,
    maxFiles: 3,
    includeTimestamp: true,
    logToConsole: false,
  });

  logger.debug('terminal write debug started', {
    pid: process.pid,
    term: process.env.TERM,
    termProgram: process.env.TERM_PROGRAM,
    verbose,
    includeStderr,
    maxEntries,
    logFile: logger.getLogFilePath(),
  });

  const state = { count: 0, warned: false, seq: 0 };
  const restoreStdout = patchWrite(process.stdout as WritableWithPatched, 'stdout', logger, {
    maxEntries,
    verbose,
    state,
  });

  const restoreStderr = includeStderr
    ? patchWrite(process.stderr as WritableWithPatched, 'stderr', logger, {
        maxEntries,
        verbose,
        state,
      })
    : () => {};

  return () => {
    restoreStdout();
    restoreStderr();
    logger.debug('terminal write debug stopped', {
      totalEntries: state.count,
    });
    logger.close();
  };
}
