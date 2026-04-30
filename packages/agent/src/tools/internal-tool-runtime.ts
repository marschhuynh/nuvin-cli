import { addAbortListener, isAbortError, throwIfAborted, toAbortError } from "../shared/abort.ts";
import type {
  AnyToolDefinition,
  JsonObject,
  ToolExecutionContext,
  ToolResult,
  ToolResultChunk,
  ToolRuntime,
  ToolRuntimeDispatchDecision,
  ToolRuntimeEvent,
  ToolRuntimeEventHandler,
  ToolRuntimeToolCallHandler,
  ToolUseBlock,
} from "../shared/types.ts";
import {
  deriveFinalToolOutput,
  normalizeToolOutputValue,
  ToolExecutionError,
  ToolRegistry,
  validateToolInput,
} from "./tools.ts";

interface InternalToolRuntimeOptions {
  onEvent?: ToolRuntimeEventHandler;
  onToolCall?: ToolRuntimeToolCallHandler;
}

function createToolMeta(): ToolResult["meta"] {
  return {
    transforms: [],
  };
}

function createErrorToolResult(
  toolCall: ToolUseBlock,
  errorMessage: string,
  structured: JsonObject,
  chunks: ToolResultChunk[] = [],
): ToolResult {
  return {
    callId: toolCall.id,
    toolName: toolCall.name,
    status: "error",
    output: errorMessage,
    structured,
    chunks,
    meta: createToolMeta(),
  };
}

function createRejectedToolResult(toolCall: ToolUseBlock, reason?: string): ToolResult {
  const output = reason?.trim().length ? reason : `Tool execution rejected for ${toolCall.name}`;

  return createErrorToolResult(toolCall, output, {
    error: "tool_rejected",
    ...(reason?.trim().length ? { reason } : {}),
  });
}

function createAbortedToolResult(
  toolCall: ToolUseBlock,
  reason: unknown,
  chunks: ToolResultChunk[] = [],
): ToolResult {
  const abortError = toAbortError(reason);

  return createErrorToolResult(
    toolCall,
    abortError.message,
    {
      error: abortError.message,
      aborted: true,
    },
    chunks,
  );
}

function createSuccessToolResult(
  toolCall: ToolUseBlock,
  finalOutput: ToolResultChunk,
  chunks: ToolResultChunk[],
): ToolResult {
  return {
    callId: toolCall.id,
    toolName: toolCall.name,
    status: "ok",
    output: finalOutput.output,
    structured: finalOutput.structured,
    chunks,
    meta: createToolMeta(),
  };
}

function createUnknownToolResult(toolCall: ToolUseBlock): ToolResult {
  return createErrorToolResult(toolCall, `Unknown tool: ${toolCall.name}`, {
    error: "unknown_tool",
  });
}

function isDispatchDecision(value: unknown): value is ToolRuntimeDispatchDecision {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    (value as { action?: unknown }).action === "reject" ||
    (value as { action?: unknown }).action === "run"
  );
}

function normalizeExecutionError(error: unknown): {
  errorMessage: string;
  structured: JsonObject;
} {
  if (error instanceof ToolExecutionError) {
    return {
      errorMessage: error.message,
      structured: {
        error: error.message,
        ...error.structured,
      },
    };
  }

  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      structured: {
        error: error.message,
      },
    };
  }

  const errorMessage = String(error);
  return {
    errorMessage,
    structured: {
      error: errorMessage,
    },
  };
}

async function emitEvent(
  onEvent: ToolRuntimeEventHandler | undefined,
  event: ToolRuntimeEvent,
  ctx: ToolExecutionContext,
): Promise<void> {
  await onEvent?.(event, ctx);
}

async function resolveDispatchDecision(
  onToolCall: ToolRuntimeToolCallHandler | undefined,
  toolCall: ToolUseBlock,
  ctx: ToolExecutionContext,
): Promise<ToolRuntimeDispatchDecision> {
  if (!onToolCall) {
    return { action: "run" };
  }

  const handlerPromise = Promise.resolve().then(() => onToolCall(toolCall, ctx));

  if (!ctx.signal) {
    const result = await handlerPromise;
    return isDispatchDecision(result) ? result : { action: "run" };
  }

  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = (): void => {
      ctx.signal?.removeEventListener("abort", onAbort);
      reject(toAbortError(ctx.signal?.reason));
    };

    if (ctx.signal?.aborted) {
      reject(toAbortError(ctx.signal.reason));
      return;
    }

    ctx.signal?.addEventListener("abort", onAbort, { once: true });
  });

  const result = await Promise.race([handlerPromise, abortPromise]);
  return isDispatchDecision(result) ? result : { action: "run" };
}

async function executeToolCall(
  registry: ToolRegistry,
  toolCall: ToolUseBlock,
  ctx: ToolExecutionContext,
  onToolCall: ToolRuntimeToolCallHandler | undefined,
  onEvent: ToolRuntimeEventHandler | undefined,
): Promise<ToolResult> {
  const toolCtx: ToolExecutionContext = {
    ...ctx,
    toolCallId: toolCall.id,
  };
  throwIfAborted(toolCtx.signal);
  const decision = await resolveDispatchDecision(onToolCall, toolCall, toolCtx);
  throwIfAborted(toolCtx.signal);

  if (decision.action === "reject") {
    const result = createRejectedToolResult(toolCall, decision.reason);
    await emitEvent(
      onEvent,
      {
        type: "tool_rejected",
        toolCall,
        result,
      },
      toolCtx,
    );
    return result;
  }

  const tool = registry.get(toolCall.name);

  if (!tool) {
    const result = createUnknownToolResult(toolCall);
    await emitEvent(
      onEvent,
      {
        type: "tool_completed",
        toolCall,
        result,
      },
      toolCtx,
    );
    return result;
  }

  throwIfAborted(toolCtx.signal);
  await emitEvent(
    onEvent,
    {
      type: "tool_started",
      toolCall,
    },
    toolCtx,
  );

  try {
    throwIfAborted(toolCtx.signal);
    const validatedInput = validateToolInput(toolCall.input, tool.inputSchema);
    const execution = await tool.execute(validatedInput, toolCtx);
    const chunks: ToolResultChunk[] = [];
    const removeAbortListener = addAbortListener(toolCtx.signal, () => {
      void execution.return(undefined).catch(() => {});
    });

    try {
      throwIfAborted(toolCtx.signal);
      let next = await execution.next();

      while (!next.done) {
        throwIfAborted(toolCtx.signal);
        const chunk = normalizeToolOutputValue(next.value);
        chunks.push(chunk);
        await emitEvent(
          onEvent,
          {
            type: "tool_output_chunk",
            toolCall,
            chunk,
          },
          toolCtx,
        );
        throwIfAborted(toolCtx.signal);
        next = await execution.next();
      }

      throwIfAborted(toolCtx.signal);
      const finalOutput =
        next.value === undefined
          ? deriveFinalToolOutput(chunks)
          : normalizeToolOutputValue(next.value);
      const result = createSuccessToolResult(toolCall, finalOutput, chunks);

      await emitEvent(
        onEvent,
        {
          type: "tool_completed",
          toolCall,
          result,
        },
        toolCtx,
      );

      return result;
    } catch (error) {
      if (isAbortError(error)) {
        const result = createAbortedToolResult(toolCall, error, chunks);

        await emitEvent(
          onEvent,
          {
            type: "tool_completed",
            toolCall,
            result,
          },
          toolCtx,
        );

        return result;
      }

      const { errorMessage, structured } = normalizeExecutionError(error);
      const result = createErrorToolResult(toolCall, errorMessage, structured, chunks);

      await emitEvent(
        onEvent,
        {
          type: "tool_completed",
          toolCall,
          result,
        },
        toolCtx,
      );

      return result;
    } finally {
      removeAbortListener();
    }
  } catch (error) {
    if (isAbortError(error)) {
      const result = createAbortedToolResult(toolCall, error);

      await emitEvent(
        onEvent,
        {
          type: "tool_completed",
          toolCall,
          result,
        },
        toolCtx,
      );

      return result;
    }

    const { errorMessage, structured } = normalizeExecutionError(error);
    const result = createErrorToolResult(toolCall, errorMessage, structured);

    await emitEvent(
      onEvent,
      {
        type: "tool_completed",
        toolCall,
        result,
      },
      toolCtx,
    );

    return result;
  }
}

export function createInternalToolRuntime(
  tools: AnyToolDefinition[] = [],
  options: InternalToolRuntimeOptions = {},
): ToolRuntime {
  const registry = new ToolRegistry(tools);

  return {
    listToolSchemas(): ReturnType<ToolRegistry["listToolSchemas"]> {
      return registry.listToolSchemas();
    },
    async executeCalls(
      toolCalls: ToolUseBlock[],
      ctx: ToolExecutionContext,
    ): Promise<ToolResult[]> {
      return await Promise.all(
        toolCalls.map(async (toolCall) => {
          return await executeToolCall(
            registry,
            toolCall,
            ctx,
            options.onToolCall,
            options.onEvent,
          );
        }),
      );
    },
    async execute(toolCall: ToolUseBlock, ctx: ToolExecutionContext): Promise<ToolResult> {
      const [result] = await this.executeCalls([toolCall], ctx);
      return result;
    },
  };
}
