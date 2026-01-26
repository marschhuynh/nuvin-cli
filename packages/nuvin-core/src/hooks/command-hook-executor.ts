import { exec, type ExecOptions } from 'child_process';
import { promisify } from 'util';
import type { HookContext, HookResult, HookDecisionType } from './types.js';

const execAsync = promisify(exec);

/**
 * CommandHookExecutor - Executes bash commands as hooks and parses their JSON output.
 *
 * Exit code semantics:
 * - Exit 0: Success, continue
 * - Exit 1: Error but continue (e.g., validation warning)
 * - Exit 2: Block/deny, do not continue
 * - Timeout: Continue with error logged
 *
 * The executor sets NUVIN_ environment variables for hook scripts to use:
 * - NUVIN_SESSION_ID
 * - NUVIN_CONVERSATION_ID
 * - NUVIN_MESSAGE_ID
 * - NUVIN_HOOK_EVENT
 * - NUVIN_CWD
 * - NUVIN_TOOL_NAME
 * - NUVIN_TOOL_USE_ID
 * - NUVIN_TOOL_INPUT (JSON)
 */
export class CommandHookExecutor {
  /**
   * Execute a command hook and parse its output.
   *
   * @param command - The bash command to execute
   * @param context - The hook context with session/tool information
   * @param timeoutSeconds - Maximum time to wait for command (default: 60s)
   * @returns The parsed hook result
   */
  async execute(
    command: string,
    context: HookContext,
    timeoutSeconds: number = 60,
  ): Promise<HookResult> {
    const startTime = Date.now();

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      NUVIN_SESSION_ID: context.sessionId,
      NUVIN_CONVERSATION_ID: context.conversationId,
      NUVIN_MESSAGE_ID: context.messageId,
      NUVIN_HOOK_EVENT: context.hookEvent,
      NUVIN_CWD: context.cwd,
      NUVIN_TOOL_NAME: context.toolName || '',
      NUVIN_TOOL_USE_ID: context.toolUseId || '',
    };

    if (context.toolInput) {
      env.NUVIN_TOOL_INPUT = JSON.stringify(context.toolInput);
    }

    const options: ExecOptions = {
      cwd: context.cwd,
      env,
      timeout: timeoutSeconds * 1000,
      shell: '/bin/bash',
    };

    try {
      const { stdout, stderr } = await execAsync(command, options);
      const durationMs = Date.now() - startTime;
      const stdoutStr = typeof stdout === 'string' ? stdout : stdout.toString();
      const stderrStr = typeof stderr === 'string' ? stderr : stderr.toString();
      return this.parseOutput(stdoutStr.trim(), stderrStr, 0, durationMs);
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const execError = error as {
        killed?: boolean;
        code?: number;
        stderr?: string;
        message?: string;
      };

      // Timeout killed the process
      if (execError.killed) {
        return {
          continue: true,
          exitCode: -1,
          error: `Hook timed out after ${timeoutSeconds}s`,
          durationMs,
        };
      }

      const exitCode = execError.code ?? -1;
      const stderr = execError.stderr || execError.message || '';

      // Exit code 2 means block/deny
      if (exitCode === 2) {
        return {
          continue: false,
          exitCode,
          error: stderr,
          durationMs,
        };
      }

      // Other exit codes (including 1) continue with error
      return {
        continue: true,
        exitCode,
        error: stderr,
        durationMs,
      };
    }
  }

  /**
   * Parse command output, attempting JSON parsing first.
   *
   * @param stdout - Standard output from the command
   * @param stderr - Standard error from the command
   * @param exitCode - The command's exit code
   * @param durationMs - How long the command took
   * @returns Parsed hook result
   */
  private parseOutput(
    stdout: string,
    stderr: string,
    exitCode: number,
    durationMs: number,
  ): HookResult {
    // Try to parse as JSON
    let jsonOutput: Record<string, unknown> | null = null;
    try {
      jsonOutput = JSON.parse(stdout);
    } catch {
      // Not JSON, treat as plain text
    }

    if (jsonOutput && typeof jsonOutput === 'object') {
      return {
        decision: jsonOutput.decision as HookDecisionType | undefined,
        decisionReason: jsonOutput.decisionReason as string | undefined,
        updatedInput: jsonOutput.updatedInput as Record<string, unknown> | undefined,
        additionalContext: jsonOutput.additionalContext as string | undefined,
        continue: jsonOutput.continue !== false, // Default to true
        stopReason: jsonOutput.stopReason as string | undefined,
        suppressOutput: jsonOutput.suppressOutput as boolean | undefined,
        systemMessage: jsonOutput.systemMessage as string | undefined,
        rawOutput: stdout,
        exitCode,
        durationMs,
      };
    }

    // Plain text output
    return {
      continue: true,
      rawOutput: stdout,
      exitCode,
      durationMs,
      error: stderr || undefined,
    };
  }
}
