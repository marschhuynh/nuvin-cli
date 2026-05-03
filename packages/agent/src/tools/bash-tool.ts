import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { stripVTControlCharacters } from "node:util";

import { addAbortListener, throwIfAborted, toAbortError } from "../shared/abort.ts";
import { createToolOutput, defineTool, ToolExecutionError } from "./tools.ts";

const DEFAULT_DESCRIPTION =
  "Execute a shell command with timeout protection. Captures stdout and stderr. Do not use for interactive commands that require user input.";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface BashToolInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  ignoreOutput?: boolean;
}

export interface BashToolOptions {
  defaultCwd?: string;
  defaultTimeoutMs?: number;
  description?: string;
  env?: NodeJS.ProcessEnv;
  name?: string;
  shellPath?: string;
  stripAnsi?: boolean;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function shellExists(shellPath: string): boolean {
  try {
    const stats = statSync(shellPath);
    return stats.isFile() && (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function resolveDefaultShell(shellPath?: string): string {
  if (shellPath) {
    return shellPath;
  }

  if (os.platform() === "win32") {
    return process.env.ComSpec || "cmd.exe";
  }

  const fallbacks = ["/bin/bash", "/bin/sh", "/usr/bin/bash", "/usr/bin/sh"];
  for (const fallback of fallbacks) {
    if (shellExists(fallback)) {
      return fallback;
    }
  }

  const shellFromEnvironment = process.env.SHELL;
  if (shellFromEnvironment && shellExists(shellFromEnvironment)) {
    return shellFromEnvironment;
  }

  return "/bin/bash";
}

function buildShellArgs(command: string, shellPath: string): string[] {
  if (os.platform() === "win32") {
    const isCmd = /cmd(\.exe)?$/i.test(shellPath);
    return isCmd ? ["/d", "/s", "/c", command] : ["-NoLogo", "-NoProfile", "-Command", command];
  }

  // Avoid login-shell startup scripts leaking unrelated stderr/stdout into tool output.
  return ["-c", command];
}

function stripAnsiAndControls(s: string): string {
  // Use Node.js built-in util.stripVTControlCharacters for basic control char removal
  s = stripVTControlCharacters(s);

  const ESC = "\u001B";

  // util.stripVTControlCharacters may leave OSC remnants like ";Window Title\u0007"
  // or fragments from partially-stripped sequences. Clean these up aggressively.
  // Remove any sequence starting with ; and ending with BEL or ESC\
  s = s.replace(/;[^\u0007\n]*?\u0007/g, ""); // OSC remnants with BEL
  // biome-ignore lint/suspicious/noControlCharactersInRegex: OSC remnants with ST
  s = s.replace(new RegExp(`;[^\\n]*?${ESC}\\\\`, "g"), ""); // OSC remnants with ST

  // Remove any remaining BEL characters
  s = s.replace(/\u0007/g, "");

  // DCS/PM/APC … ST (ESC P|^|_ … ESC \\))
  // biome-ignore lint/suspicious/noControlCharactersInRegex: DCS/PM/APC sequences
  s = s.replace(new RegExp(`${ESC}[P_^][\\s\\S]*?${ESC}\\\\`, "g"), "");
  // Other ESC sequences (like ESC =, ESC >, ESC 7, ESC 8, etc.)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC sequences
  s = s.replace(new RegExp(`${ESC}[=>7-8()]`, "g"), "");
  // 8-bit C1 controls
  // biome-ignore lint/suspicious/noControlCharactersInRegex: C1 control characters
  s = s.replace(/[\u0080-\u009F]/g, "");
  // Zero-widths & NBSPs
  // biome-ignore lint/suspicious/noControlCharactersInRegex: zero-width and NBSP characters
  s = s.replace(/[\u200B-\u200F\u2060-\u2069\u00A0]/g, "");
  // Terminal visual indicators (⏎ return symbol, ␤ newline symbol, etc.)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal visual indicators
  s = s.replace(/[\u23CE\u2424]/g, "");

  return s;
}

function resolveWorkingDirectory(cwd: string | undefined, defaultCwd: string): string {
  const resolved = cwd ? (path.isAbsolute(cwd) ? cwd : path.resolve(defaultCwd, cwd)) : defaultCwd;

  try {
    const stats = statSync(resolved);
    if (!stats.isDirectory()) {
      throw new ToolExecutionError(`Working directory is not a directory: ${resolved}`, {
        cwd: resolved,
      });
    }

    return resolved;
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      throw error;
    }

    throw new ToolExecutionError(`Working directory not found: ${resolved}`, {
      cwd: resolved,
    });
  }
}

function killProcessGroup(
  child: ReturnType<typeof spawn>,
  isWindows: boolean,
  signal: NodeJS.Signals = "SIGKILL",
): void {
  if (!child.pid) {
    return;
  }

  if (isWindows) {
    try {
      spawn("taskkill", ["/pid", child.pid.toString(), "/T", "/F"], {
        stdio: "ignore",
      });
      return;
    } catch {
      child.kill(signal);
      return;
    }
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function appendChunk(
  output: string[],
  pending: string[],
  chunk: string,
  stripAnsi: boolean,
  notify: () => void,
): void {
  const normalized = stripAnsi ? stripAnsiAndControls(chunk) : chunk;
  if (normalized.length === 0) {
    return;
  }

  output.push(normalized);
  pending.push(normalized);
  notify();
}

export function createBashTool(options: BashToolOptions = {}) {
  const defaultCwd = path.resolve(options.defaultCwd ?? process.cwd());
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stripAnsi = options.stripAnsi ?? true;
  const name = options.name ?? "Bash";

  return defineTool({
    name,
    description: options.description ?? DEFAULT_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
        },
        cwd: {
          type: "string",
        },
        timeoutMs: {
          type: "number",
        },
        ignoreOutput: {
          type: "boolean",
        },
      },
      required: ["command"] as const,
    },
    async *execute(input, ctx) {
      const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
        throw new ToolExecutionError("Invalid timeoutMs: expected a positive number", {
          command: input.command,
        });
      }

      throwIfAborted(ctx.signal);
      const cwd = resolveWorkingDirectory(input.cwd, defaultCwd);
      const ignoreOutput = input.ignoreOutput ?? false;
      const shellPath = resolveDefaultShell(options.shellPath);
      const shellArgs = buildShellArgs(input.command, shellPath);
      const isWindows = os.platform() === "win32";

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(shellPath, shellArgs, {
          cwd,
          env: {
            ...process.env,
            ...(options.env ?? {}),
          },
          stdio: ignoreOutput ? ["ignore", "ignore", "ignore"] : ["ignore", "pipe", "pipe"],
          shell: false,
          windowsHide: true,
          detached: !isWindows,
        });
      } catch (error) {
        if (isErrnoException(error) && error.code === "ENOENT") {
          throw new ToolExecutionError(`Shell not found: ${shellPath}`, {
            command: input.command,
            cwd,
            shellPath,
          });
        }

        throw new ToolExecutionError(error instanceof Error ? error.message : String(error), {
          command: input.command,
          cwd,
          shellPath,
        });
      }

      const output: string[] = [];
      const pendingChunks: string[] = [];
      const stdoutDecoder = new StringDecoder("utf8");
      const stderrDecoder = new StringDecoder("utf8");

      let resolvePending: (() => void) | undefined;
      let executionSettled = false;
      let abortError: Error | undefined;

      const notifyPendingChunk = () => {
        if (!resolvePending) {
          return;
        }

        const resolve = resolvePending;
        resolvePending = undefined;
        resolve();
      };

      const waitForPendingChunk = async () => {
        if (pendingChunks.length > 0 || executionSettled) {
          return;
        }

        await new Promise<void>((resolve) => {
          resolvePending = resolve;
        });
      };

      const onStdout = (chunk: Buffer) => {
        appendChunk(
          output,
          pendingChunks,
          stdoutDecoder.write(chunk),
          stripAnsi,
          notifyPendingChunk,
        );
      };

      const onStderr = (chunk: Buffer) => {
        appendChunk(
          output,
          pendingChunks,
          stderrDecoder.write(chunk),
          stripAnsi,
          notifyPendingChunk,
        );
      };

      child.stdout?.on("data", onStdout);
      child.stderr?.on("data", onStderr);

      let exitObserved = false;
      let timer: NodeJS.Timeout | undefined;
      const removeAbortListener = addAbortListener(ctx.signal, () => {
        abortError = toAbortError(ctx.signal.reason);
        executionSettled = true;
        notifyPendingChunk();

        try {
          killProcessGroup(child, isWindows);
        } catch {
          // best effort cleanup only
        }
      });

      try {
        const exitPromise = new Promise<{
          code: number | null;
          signal: string | null;
        }>((resolve, reject) => {
          const cleanupListeners = () => {
            if (timer) {
              clearTimeout(timer);
              timer = undefined;
            }

            child.off("error", onError);
            child.off("close", onClose);
          };

          const onError = (error: Error) => {
            executionSettled = true;
            notifyPendingChunk();
            cleanupListeners();
            reject(abortError ?? error);
          };

          const onClose = (code: number | null, signal: string | null) => {
            exitObserved = true;
            appendChunk(output, pendingChunks, stdoutDecoder.end(), stripAnsi, notifyPendingChunk);
            appendChunk(output, pendingChunks, stderrDecoder.end(), stripAnsi, notifyPendingChunk);
            executionSettled = true;
            notifyPendingChunk();
            cleanupListeners();
            if (abortError) {
              reject(abortError);
              return;
            }
            resolve({ code, signal });
          };

          timer = setTimeout(() => {
            executionSettled = true;
            notifyPendingChunk();
            cleanupListeners();
            try {
              killProcessGroup(child, isWindows);
            } catch {
              // best effort cleanup only
            }
            reject(
              new ToolExecutionError(`Command timed out after ${timeoutMs} ms`, {
                command: input.command,
                cwd,
                shellPath,
                timeoutMs,
                timedOut: true,
              }),
            );
          }, timeoutMs);

          child.once("error", onError);
          child.once("close", onClose);
        });

        while (pendingChunks.length > 0 || !executionSettled) {
          if (pendingChunks.length === 0) {
            await waitForPendingChunk();
            continue;
          }

          const nextChunk = pendingChunks.shift();
          if (nextChunk !== undefined) {
            yield nextChunk;
          }
        }

        const exit = await exitPromise;

        const finalOutput = ignoreOutput ? `exit code ${exit.code ?? 0}` : output.join("");

        const structured = {
          command: input.command,
          cwd,
          exitCode: exit.code ?? 0,
          signal: exit.signal,
          ignoreOutput,
          shellPath,
          timeoutMs,
        };

        if (exit.code !== 0) {
          throw new ToolExecutionError(
            finalOutput || `Command exited with code ${exit.code ?? 0}`,
            structured,
          );
        }

        return createToolOutput(finalOutput, structured);
      } catch (error) {
        while (pendingChunks.length > 0) {
          const nextChunk = pendingChunks.shift();
          if (nextChunk !== undefined) {
            yield nextChunk;
          }
        }

        if (error instanceof ToolExecutionError) {
          throw error;
        }

        if (abortError) {
          throw abortError;
        }

        if (isErrnoException(error) && error.code === "ENOENT") {
          throw new ToolExecutionError(`Shell not found: ${shellPath}`, {
            command: input.command,
            cwd,
            shellPath,
          });
        }

        throw new ToolExecutionError(error instanceof Error ? error.message : String(error), {
          command: input.command,
          cwd,
          shellPath,
        });
      } finally {
        if (timer) {
          clearTimeout(timer);
        }

        removeAbortListener();

        child.stdout?.off("data", onStdout);
        child.stderr?.off("data", onStderr);

        if (!exitObserved && child.pid && !child.killed) {
          try {
            killProcessGroup(child, isWindows);
          } catch {
            // best effort cleanup only
          }
        }
      }
    },
  });
}

export function createShellExecTool(options: BashToolOptions = {}) {
  return createBashTool(options);
}
