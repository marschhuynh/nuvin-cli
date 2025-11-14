import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ExecResult, ToolExecutionContext } from './types.js';
import { ok, err } from './result-helpers.js';
import { stripAnsiAndControls } from '../string-utils.js';

export type BashParams = {
  cmd: string;
  cwd?: string;
  timeoutMs?: number;
};

const DEFAULTS = {
  maxOutputBytes: 1 * 1024 * 1024,
  timeoutMs: 30_000,
  stripAnsi: true,
};

export class BashTool implements FunctionTool<BashParams, ToolExecutionContext> {
  name = 'bash_tool' as const;

  parameters = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Explanation of what this command will do (e.g., "Get git commit log")',
      },
      cmd: { type: 'string', description: 'Shell command to run.' },
      cwd: { type: 'string', description: 'Working directory.' },
      timeoutMs: { type: 'integer', minimum: 1, description: 'Timeout in ms. Default: 30000.' },
    },
    required: ['cmd'],
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description:
        'Execute shell commands with timeout protection. Captures stdout/stderr. Does not support interactive commands that require user input (e.g., npm init, pnpm changeset, interactive installers, git add -p, vim, nano).',
      parameters: this.parameters,
    };
  }

  async execute(p: BashParams, ctx?: ToolExecutionContext): Promise<ExecResult> {
    try {
      return await this.execOnce(p, ctx?.signal);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        return err('Command execution aborted by user', undefined, ErrorReason.Aborted);
      }
      const message = e instanceof Error ? e.message : String(e);
      return err(message, undefined, ErrorReason.Unknown);
    }
  }

  private async execOnce(p: BashParams, signal?: AbortSignal): Promise<ExecResult> {
    if (signal?.aborted) {
      return err('Command execution aborted by user', undefined, ErrorReason.Aborted);
    }
    const { cmd, cwd = process.cwd(), timeoutMs = DEFAULTS.timeoutMs } = p;

    const maxOutputBytes = DEFAULTS.maxOutputBytes;
    const stripAnsi = DEFAULTS.stripAnsi;

    const executable = this.defaultShell();
    const execArgs = this.shellArgs(cmd, executable);

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, execArgs, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return err(`Shell not found: ${executable}`, undefined, ErrorReason.NotFound);
      }
      throw error;
    }

    child.on('error', (err) => {
      if ('code' in err && err.code === 'ENOENT') {
        child.emit('close', -1, null);
      }
    });

    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    const deadline = new Promise<never>((_, rej) => {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {}
        rej(new Error(`Command timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    });

    const abort = new Promise<never>((_, rej) => {
      if (signal) {
        const abortHandler = () => {
          if (timer) clearTimeout(timer);
          try {
            child.kill('SIGTERM');
            setTimeout(() => {
              if (child && !child.killed) {
                child.kill('SIGKILL');
              }
            }, 1000);
          } catch {}
          rej(new Error('ABORTED'));
        };

        signal.addEventListener('abort', abortHandler);

        if (signal.aborted) {
          abortHandler();
        }
      }
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let total = 0;

    const capPush = (arr: Buffer[], chunk: Buffer) => {
      total += chunk.length;
      if (total > maxOutputBytes) {
        arr.push(Buffer.from(`\n[truncated at ${maxOutputBytes} bytes]\n`));
        child.kill('SIGKILL');
        return;
      }
      arr.push(chunk);
    };

    if (child.stdout) {
      child.stdout.on('data', (d: Buffer) => capPush(stdout, d));
    }
    if (child.stderr) {
      child.stderr.on('data', (d: Buffer) => capPush(stderr, d));
    }

    const exit = new Promise<{ code: number | null; signal: string | null }>((res) => {
      child.on('close', (code, signal) => res({ code, signal }));
    });

    try {
      const { code, signal: exitSignal } = await Promise.race([exit, deadline, abort]);
      if (timer) clearTimeout(timer);

      const outText = Buffer.concat(stdout).toString('utf8');
      const errText = Buffer.concat(stderr).toString('utf8');
      const output = stripAnsi ? stripAnsiAndControls(outText + errText) : outText + errText;

      if (signal?.aborted) {
        const partialOutput = output ? `\nOutput before abort:\n${output}` : '';
        return err(`Command execution aborted by user${partialOutput}`, { cwd }, ErrorReason.Aborted);
      }

      if (code !== 0) {
        const metadata: Record<string, unknown> = { code, signal: exitSignal, cwd };
        // Detect common error patterns
        if (output.toLowerCase().includes('permission denied')) {
          return err(output, { ...metadata, errorReason: ErrorReason.PermissionDenied });
        }
        if (output.toLowerCase().includes('command not found') || output.toLowerCase().includes('not found')) {
          return err(output, { ...metadata, errorReason: ErrorReason.NotFound });
        }
        return err(output, metadata);
      }

      return ok(output, { code, signal: exitSignal, cwd });
    } catch (e) {
      if (timer) clearTimeout(timer);
      const message = e instanceof Error ? e.message : String(e);

      if (message === 'ABORTED' || signal?.aborted) {
        const outText = Buffer.concat(stdout).toString('utf8');
        const errText = Buffer.concat(stderr).toString('utf8');
        const output = stripAnsi ? stripAnsiAndControls(outText + errText) : outText + errText;
        const partialOutput = output ? `\nOutput before abort:\n${output}` : '';
        return err(`Command execution aborted by user${partialOutput}`, { cwd }, ErrorReason.Aborted);
      }

      if (timedOut) {
        return err(message, { cwd }, ErrorReason.Timeout);
      }

      return err(message, { cwd }, ErrorReason.Unknown);
    }
  }

  private defaultShell(): string {
    if (os.platform() === 'win32') {
      // Prefer PowerShell if available, else cmd
      return process.env.ComSpec || 'cmd.exe';
    }

    // Check if SHELL env var points to an existing executable
    const shellEnv = process.env.SHELL;
    if (shellEnv && this.shellExists(shellEnv)) {
      return shellEnv;
    }

    // Fallback chain for Unix-like systems
    const fallbacks = ['/bin/bash', '/bin/sh', '/usr/bin/bash', '/usr/bin/sh'];
    for (const shell of fallbacks) {
      if (this.shellExists(shell)) {
        return shell;
      }
    }

    // Last resort - use bash and let it fail if not found
    return '/bin/bash';
  }

  private shellExists(shellPath: string): boolean {
    try {
      const stat = fs.statSync(shellPath);
      return stat.isFile() && (stat.mode & fs.constants.X_OK || stat.mode & 0o111) !== 0;
    } catch {
      return false;
    }
  }

  private shellArgs(cmd: string, shellPath: string): string[] {
    if (os.platform() === 'win32') {
      // cmd.exe: /d /s /c "cmd"
      // If powershell is desired, pass shellPath=PowerShell and /c changes.
      const isCmd = /cmd(\.exe)?$/i.test(shellPath);
      return isCmd ? ['/d', '/s', '/c', cmd] : ['-NoLogo', '-NoProfile', '-Command', cmd];
    }
    // bash/zsh/sh
    return ['-lc', cmd];
  }
}
