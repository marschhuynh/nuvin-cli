import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError, ExecResultSuccess } from './types.js';
import { okText, err } from './result-helpers.js';
import type { DelegationService } from '../delegation/types.js';

export interface TaskOutputParams {
  session_id: string;
  blocking?: boolean;
  timeout_ms?: number;
}

export interface TaskOutputMetadata {
  sessionId: string;
  state: 'running' | 'completed' | 'failed' | 'not_found';
  metrics?: {
    tokensUsed?: number;
    toolCallsExecuted?: number;
    executionTimeMs?: number;
  };
}

export type TaskOutputSuccessResult = ExecResultSuccess & { metadata: TaskOutputMetadata };
export type TaskOutputResult = TaskOutputSuccessResult | ExecResultError;

const DEFAULT_TIMEOUT_MS = 300000;

export class TaskOutputTool implements FunctionTool<TaskOutputParams, ToolExecutionContext, TaskOutputResult> {
  name = 'task_output';

  parameters = {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'Session ID of the background agent (returned by assign_task with run_in_background=true)',
      },
      blocking: {
        type: 'boolean',
        description: 'If true, wait for the agent to complete. If false, return current status immediately.',
      },
      timeout_ms: {
        type: 'number',
        description: 'Maximum time to wait in blocking mode (default: 300000ms / 5 minutes)',
      },
    },
    required: ['session_id'],
  } as const;

  constructor(private readonly delegationService: DelegationService) {}

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: `Retrieve results from a background agent launched with assign_task.

Use this tool to:
- Check if a background agent has completed
- Get the final result once completed
- Wait for completion with blocking=true

Example workflow:
1. Launch agent: assign_task with run_in_background=true → returns session_id
2. Continue other work...
3. Get result: task_output with session_id → returns agent's output`,
      parameters: this.parameters,
    };
  }

  async execute(params: TaskOutputParams, _context?: ToolExecutionContext): Promise<TaskOutputResult> {
    if (!params.session_id || typeof params.session_id !== 'string') {
      return err(
        'Parameter "session_id" is required and must be a string',
        undefined,
        ErrorReason.InvalidInput,
      );
    }

    const blocking = params.blocking ?? false;
    const timeoutMs = params.timeout_ms ?? DEFAULT_TIMEOUT_MS;

    try {
      if (blocking) {
        return await this.waitForResult(params.session_id, timeoutMs);
      } else {
        return await this.checkResult(params.session_id);
      }
    } catch (error) {
      return err(
        `Failed to get task output: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId: params.session_id, state: 'failed' as const },
        ErrorReason.Unknown,
      );
    }
  }

  private async checkResult(sessionId: string): Promise<TaskOutputResult> {
    if (!this.delegationService.getBackgroundResult) {
      return err(
        'Background execution is not supported by this delegation service.',
        { sessionId, state: 'not_found' as const },
        ErrorReason.Unknown,
      );
    }

    const result = await this.delegationService.getBackgroundResult(sessionId, false);

    if (result === null) {
      if (this.delegationService.isBackgroundAgentRunning?.(sessionId)) {
        return okText('Agent is still running. Use blocking=true to wait for completion.', {
          sessionId,
          state: 'running' as const,
        });
      }

      return err(`No agent found with session ID: ${sessionId}`, { sessionId, state: 'not_found' as const }, ErrorReason.NotFound);
    }

    if (!result.success) {
      return err(result.error ?? 'Agent execution failed', { sessionId, state: 'failed' as const }, ErrorReason.Unknown);
    }

    return okText(result.summary ?? 'Task completed', {
      sessionId,
      state: 'completed' as const,
      metrics: result.metadata?.metrics as TaskOutputMetadata['metrics'],
    });
  }

  private async waitForResult(sessionId: string, timeoutMs: number): Promise<TaskOutputResult> {
    if (!this.delegationService.getBackgroundResult || !this.delegationService.isBackgroundAgentRunning) {
      return err(
        'Background execution is not supported by this delegation service.',
        { sessionId, state: 'not_found' as const },
        ErrorReason.Unknown,
      );
    }

    if (!this.delegationService.isBackgroundAgentRunning(sessionId)) {
      const result = await this.delegationService.getBackgroundResult(sessionId, false);
      if (result === null) {
        return err(`No agent found with session ID: ${sessionId}`, { sessionId, state: 'not_found' as const }, ErrorReason.NotFound);
      }
    }

    const result = await Promise.race([
      this.delegationService.getBackgroundResult(sessionId, true),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
    ]);

    if (result === 'timeout') {
      return err(
        `Timeout waiting for agent after ${timeoutMs}ms. Agent may still be running.`,
        { sessionId, state: 'running' as const },
        ErrorReason.Timeout,
      );
    }

    if (result === null || !result.success) {
      return err(result?.error ?? 'Agent execution failed', { sessionId, state: 'failed' as const }, ErrorReason.Unknown);
    }

    return okText(result.summary ?? 'Task completed', {
      sessionId,
      state: 'completed' as const,
      metrics: result.metadata?.metrics as TaskOutputMetadata['metrics'],
    });
  }
}
