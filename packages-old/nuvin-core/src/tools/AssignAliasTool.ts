import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { AssignResult, AssignTool } from './AssignTool.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { err } from './result-helpers.js';

export type AssignAliasTask = {
  description: string;
  task: string;
  resume?: string;
};

export type AssignAliasHiddenAgentResolver<I> = string | ((input: I, context?: ToolExecutionContext) => string);

export type AssignAliasToolOptions<I extends Record<string, unknown>> = {
  name: string;
  description: string;
  parameters: ToolDefinition['function']['parameters'];
  getAssignTool: () => AssignTool | undefined;
  hiddenAgentName: AssignAliasHiddenAgentResolver<I>;
  buildAssignTask: (input: I, context?: ToolExecutionContext) => Promise<AssignAliasTask> | AssignAliasTask;
  validateInput?: (input: I) => ExecResultError | null;
};

export class AssignAliasTool<I extends Record<string, unknown>>
  implements FunctionTool<I, ToolExecutionContext, AssignResult>
{
  readonly name: string;
  readonly parameters: ToolDefinition['function']['parameters'];

  constructor(private readonly options: AssignAliasToolOptions<I>) {
    this.name = options.name;
    this.parameters = options.parameters;
  }

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: this.options.description,
      parameters: this.parameters,
    };
  }

  async execute(input: I, context?: ToolExecutionContext): Promise<AssignResult> {
    const assignTool = this.options.getAssignTool();
    if (!assignTool) {
      return this.toError(
        `Alias tool "${this.name}" is unavailable because assign_task is not initialized.`,
        ErrorReason.ToolNotFound,
      );
    }

    const inputError = this.options.validateInput?.(input);
    if (inputError) {
      return inputError as AssignResult;
    }

    try {
      const request = await this.options.buildAssignTask(input, context);
      if (!request.task || typeof request.task !== 'string') {
        return this.toError(`Alias tool "${this.name}" produced an invalid task payload.`, ErrorReason.InvalidInput);
      }
      if (!request.description || typeof request.description !== 'string') {
        return this.toError(
          `Alias tool "${this.name}" produced an invalid description payload.`,
          ErrorReason.InvalidInput,
        );
      }

      const agent =
        typeof this.options.hiddenAgentName === 'function'
          ? this.options.hiddenAgentName(input, context)
          : this.options.hiddenAgentName;

      if (!agent || typeof agent !== 'string') {
        return this.toError(`Alias tool "${this.name}" produced an invalid agent identifier.`, ErrorReason.InvalidInput);
      }

      return await assignTool.execute(
        {
          agent,
          description: request.description,
          task: request.task,
          ...(request.resume ? { resume: request.resume } : {}),
        },
        context,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.toError(`Alias tool "${this.name}" failed: ${message}`, ErrorReason.Unknown);
    }
  }

  protected toError(message: string, errorReason: ErrorReason): ExecResultError {
    return err(message, undefined, errorReason);
  }
}
