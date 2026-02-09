import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import { stripAnsiAndControls } from '../string-utils.js';
import type { BashToolMetadata } from './tool-result-metadata.js';

export type BashParams = {
  cmd: string;
  cwd?: string;
  timeoutMs?: number;
  ignoreOutput?: boolean;
};

export type BashSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata?: BashToolMetadata;
};

export type BashErrorResult = ExecResultError & {
  metadata?: BashToolMetadata & {
    errorReason?: ErrorReason;
  };
};

export type BashResult = BashSuccessResult | BashErrorResult;

const DEFAULTS = {
  maxOutputBytes: 1 * 1024 * 1024,
  timeoutMs: 30_000,
  stripAnsi: true,
};

export class BashTool implements FunctionTool<BashParams, ToolExecutionContext, BashResult> {
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
      ignoreOutput: {
        type: 'boolean',
        description:
          'If true, discard stdout/stderr and return only the exit code. Useful when you only care whether the command succeeded or failed.',
      },
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

  /**
   * Execute bash command with timeout protection
   *
   * @param p - Command parameters including cmd, cwd, and optional timeout
   * @param ctx - Execution context with optional abort signal
   * @returns Structured result with command output and execution metadata
   *
   * @example
   * ```typescript
   * const result = await bashTool.execute({ cmd: 'ls -la' });
   * if (result.status === 'success' && result.type === 'text') {
   *   console.log(result.result); // command output
   *   console.log(result.metadata?.code); // exit code
   *   console.log(result.metadata?.cwd); // working directory
   * }
   * ```
   */
  async execute(p: BashParams, ctx?: ToolExecutionContext): Promise<BashResult> {
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

  private async execOnce(p: BashParams, signal?: AbortSignal): Promise<BashResult> {
    if (signal?.aborted) {
      return err('Command execution aborted by user', undefined, ErrorReason.Aborted);
    }
    const { cmd, cwd = process.cwd(), timeoutMs = DEFAULTS.timeoutMs, ignoreOutput = false } = p;

    const maxOutputBytes = DEFAULTS.maxOutputBytes;
    const stripAnsi = DEFAULTS.stripAnsi;

    const executable = this.defaultShell();
    const execArgs = this.shellArgs(cmd, executable);

    let child: ReturnType<typeof spawn>;
    const isWindows = os.platform() === 'win32';
    try {
      child = spawn(executable, execArgs, {
        cwd,
        env: process.env,
        stdio: ignoreOutput ? ['ignore', 'ignore', 'ignore'] : ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
        detached: !isWindows,
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return err(`Shell not found: ${executable}`, undefined, ErrorReason.NotFound);
      }
      throw error;
    }

    child.once('error', (err) => {
      if ('code' in err && err.code === 'ENOENT') {
        if (!child.killed) {
          child.emit('close', -1, null);
        }
      }
    });

    let timer: NodeJS.Timeout | null = null;
    let abortKillTimer: NodeJS.Timeout | null = null;
    let abortHandler: (() => void) | null = null;
    let timedOut = false;
    let truncated = false;

    const deadline = new Promise<never>((_, rej) => {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          this.killProcessGroup(child, isWindows);
        } catch {}
        rej(new Error(`Command timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    });

    const abort = new Promise<never>((_, rej) => {
      if (signal) {
        abortHandler = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          try {
            this.killProcessGroup(child, isWindows, 'SIGTERM');
            abortKillTimer = setTimeout(() => {
              if (child && !child.killed) {
                this.killProcessGroup(child, isWindows);
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

    const stdoutHandler = (chunk: Buffer) => {
      if (truncated) return;
      total += chunk.length;
      if (total > maxOutputBytes) {
        truncated = true;
        stdout.push(Buffer.from(`\n[truncated at ${maxOutputBytes} bytes]\n`));
        this.killProcessGroup(child, isWindows);
        return;
      }
      stdout.push(chunk);
    };

    const stderrHandler = (chunk: Buffer) => {
      if (truncated) return;
      total += chunk.length;
      if (total > maxOutputBytes) {
        truncated = true;
        stderr.push(Buffer.from(`\n[truncated at ${maxOutputBytes} bytes]\n`));
        this.killProcessGroup(child, isWindows);
        return;
      }
      stderr.push(chunk);
    };

    if (child.stdout) {
      child.stdout.on('data', stdoutHandler);
    }
    if (child.stderr) {
      child.stderr.on('data', stderrHandler);
    }

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (abortKillTimer) {
        clearTimeout(abortKillTimer);
        abortKillTimer = null;
      }
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
      if (child.stdout) {
        child.stdout.off('data', stdoutHandler);
      }
      if (child.stderr) {
        child.stderr.off('data', stderrHandler);
      }
      if (child && child.pid && !child.killed) {
        try {
          this.killProcessGroup(child, isWindows);
        } catch {}
      }
    };

    const exit = new Promise<{ code: number | null; signal: string | null }>((res) => {
      child.on('close', (code, signal) => res({ code, signal }));
    });

    try {
      const { code, signal: exitSignal } = await Promise.race([exit, deadline, abort]);

      if (signal?.aborted) {
        if (ignoreOutput) {
          return err('Command execution aborted by user', { cwd }, ErrorReason.Aborted);
        }
        const outText = Buffer.concat(stdout).toString('utf8');
        const errText = Buffer.concat(stderr).toString('utf8');
        const output = stripAnsi ? stripAnsiAndControls(outText + errText) : outText + errText;
        const partialOutput = output ? `\nOutput before abort:\n${output}` : '';
        return err(`Command execution aborted by user${partialOutput}`, { cwd }, ErrorReason.Aborted);
      }

      if (ignoreOutput) {
        if (code !== 0) {
          return err(`exit code ${code}`, { code, signal: exitSignal, cwd });
        }
        return okText(`exit code 0`, { code, signal: exitSignal, cwd });
      }

      const outText = Buffer.concat(stdout).toString('utf8');
      const errText = Buffer.concat(stderr).toString('utf8');
      const output = stripAnsi ? stripAnsiAndControls(outText + errText) : outText + errText;

      if (code !== 0) {
        const metadata: Record<string, unknown> = { code, signal: exitSignal, cwd };
        if (output.toLowerCase().includes('permission denied')) {
          return err(output, { ...metadata, errorReason: ErrorReason.PermissionDenied });
        }
        if (output.toLowerCase().includes('command not found') || output.toLowerCase().includes('not found')) {
          return err(output, { ...metadata, errorReason: ErrorReason.NotFound });
        }
        return err(output, metadata);
      }

      return okText(output, { code, signal: exitSignal, cwd, stripped: stripAnsi });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);

      if (message === 'ABORTED' || signal?.aborted) {
        if (ignoreOutput) {
          return err('Command execution aborted by user', { cwd }, ErrorReason.Aborted);
        }
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
    } finally {
      cleanup();
    }
  }

  private killProcessGroup(child: ReturnType<typeof spawn>, isWindows: boolean, signal: NodeJS.Signals = 'SIGKILL') {
    if (!child.pid) return;

    if (isWindows) {
      try {
        spawn('taskkill', ['/pid', child.pid.toString(), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        child.kill(signal);
      }
    } else {
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
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
