import { Agent } from "../agent/agent.ts";
import { getTextFromMessage } from "../formats/message-format.ts";
import { addAbortListener, isAbortError } from "../shared/abort.ts";
import type {
  AgentDefinitionFactoryContext,
  AgentOptions,
  JsonObject,
  TurnResult,
} from "../shared/types.ts";
import { createToolOutput, defineTool, ToolExecutionError } from "./tools.ts";

export interface DelegatedAgentFactoryContext extends AgentDefinitionFactoryContext {
  parentSessionId: string;
  runId: string;
}

export type DelegatedAgentDefinition =
  | AgentOptions
  | ((ctx: DelegatedAgentFactoryContext) => AgentOptions | Promise<AgentOptions>);

export interface CreateDelegationToolsOptions {
  agents?: Record<string, DelegatedAgentDefinition>;
}

interface DelegatedAgentRun {
  agentId: string;
  runId: string;
  sessionId: string;
  status: "aborted" | "completed" | "failed" | "running";
  parentSessionId: string;
  originToolCallId?: string;
  result?: TurnResult;
  errorMessage?: string;
}

let delegatedRunCounter = 0;

function createDelegatedRunId(): string {
  delegatedRunCounter += 1;
  return `delegated-run-${delegatedRunCounter}`;
}

async function resolveDelegatedAgentOptions(
  definition: DelegatedAgentDefinition,
  ctx: DelegatedAgentFactoryContext,
): Promise<AgentOptions> {
  return typeof definition === "function" ? await definition(ctx) : definition;
}

function getDelegatedAgentDefinition(
  options: CreateDelegationToolsOptions,
  agentId: string,
): DelegatedAgentDefinition | undefined {
  return options.agents?.[agentId];
}

function createRunSummary(run: DelegatedAgentRun): JsonObject {
  return {
    runId: run.runId,
    agentId: run.agentId,
    sessionId: run.sessionId,
    status: run.status,
    parentSessionId: run.parentSessionId,
    ...(run.originToolCallId !== undefined ? { originToolCallId: run.originToolCallId } : {}),
    ...(run.errorMessage !== undefined ? { errorMessage: run.errorMessage } : {}),
    ...(run.result?.finalMessage !== undefined
      ? {
          finalMessageText: getTextFromMessage(run.result.finalMessage),
        }
      : {}),
  };
}

function createRunSummaryOutput(
  run: DelegatedAgentRun,
  fallbackText: string,
): ReturnType<typeof createToolOutput> {
  const structured = createRunSummary(run);
  const finalMessageText = structured.finalMessageText;

  return createToolOutput(
    typeof finalMessageText === "string" && finalMessageText.length > 0
      ? finalMessageText
      : fallbackText,
    structured,
  );
}

function getRunTerminalErrorMessage(result: TurnResult | undefined): string | undefined {
  const lastToolResult = result?.state.toolResults.at(-1);
  if (lastToolResult?.status === "error" && lastToolResult.output.trim().length > 0) {
    return lastToolResult.output;
  }

  return undefined;
}

function formatAbortedRunMessage(runId: string, cause?: string): string {
  const baseMessage = `Agent run ${runId} was aborted.`;

  if (!cause || cause.trim().length === 0 || cause === baseMessage) {
    return baseMessage;
  }

  return `${baseMessage} Cause: ${cause}`;
}

export function createAssignTaskTool(options: CreateDelegationToolsOptions) {
  return defineTool({
    name: "AssignTask",
    description: "Delegates a task to another agent and waits for completion",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
        },
        task: {
          type: "string",
        },
      },
      required: ["agentId", "task"],
    },
    async *execute(input, ctx) {
      const runId = createDelegatedRunId();
      const factoryContext: DelegatedAgentFactoryContext = {
        agentId: input.agentId,
        parentSessionId: ctx.sessionId,
        runId,
        ...(ctx.toolCallId !== undefined ? { toolCallId: ctx.toolCallId } : {}),
      };
      const definition = getDelegatedAgentDefinition(options, input.agentId);

      if (!definition) {
        throw new ToolExecutionError(`Unknown delegated agent: ${input.agentId}`, {
          agentId: input.agentId,
        });
      }

      const childAgent = new Agent(await resolveDelegatedAgentOptions(definition, factoryContext));
      let run: DelegatedAgentRun = {
        runId,
        agentId: input.agentId,
        sessionId: childAgent.sessionId,
        status: "running",
        parentSessionId: ctx.sessionId,
        ...(ctx.toolCallId !== undefined ? { originToolCallId: ctx.toolCallId } : {}),
      };

      // Cascade parent abort to the child run so Esc immediately stops the
      // entire delegation chain instead of waiting for the child to finish.
      const childAbort = new AbortController();
      const removeAbortListener = addAbortListener(ctx.signal, () => {
        childAbort.abort(ctx.signal?.reason);
      });

      yield createToolOutput(`Started agent run ${run.runId}.`, {
        runId: run.runId,
        agentId: run.agentId,
        sessionId: run.sessionId,
        status: run.status,
      });

      try {
        const result = await childAgent.send(input.task, {
          signal: childAbort.signal,
        });
        run = {
          ...run,
          status: result.status,
          result,
        };

        if (result.status !== "completed") {
          const terminalErrorMessage = getRunTerminalErrorMessage(result);
          const errorMessage = formatAbortedRunMessage(run.runId, terminalErrorMessage);
          throw new ToolExecutionError(errorMessage, {
            ...createRunSummary(run),
            aborted: true,
            errorMessage,
          });
        }

        return createRunSummaryOutput(run, `Agent run ${run.runId} completed.`);
      } catch (error) {
        if (error instanceof ToolExecutionError) {
          throw error;
        }

        if (isAbortError(error) || childAbort.signal.aborted || ctx.signal.aborted) {
          const terminalErrorMessage =
            getRunTerminalErrorMessage(run.result) ??
            (error instanceof Error ? error.message : String(error));
          const errorMessage = formatAbortedRunMessage(run.runId, terminalErrorMessage);
          run = {
            ...run,
            status: "aborted",
            errorMessage,
          };

          throw new ToolExecutionError(errorMessage, {
            ...createRunSummary(run),
            aborted: true,
            errorMessage,
          });
        }

        const errorMessage =
          getRunTerminalErrorMessage(run.result) ??
          (error instanceof Error ? error.message : String(error)) ??
          `Agent run ${run.runId} failed.`;
        run = {
          ...run,
          status: "failed",
          errorMessage,
        };

        throw new ToolExecutionError(errorMessage, {
          ...createRunSummary(run),
          errorMessage,
        });
      } finally {
        removeAbortListener();
      }
    },
  });
}

export const createDelegateToAgentTool = createAssignTaskTool;

export function createDelegationTools(options: CreateDelegationToolsOptions) {
  return [createAssignTaskTool(options)];
}
