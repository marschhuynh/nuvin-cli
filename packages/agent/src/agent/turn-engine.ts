import {
  createAssistantTextMessage,
  createReasoningMessage,
  createToolResultUserMessage,
  createToolUseMessage,
  getToolUseBlocks,
  normalizeMessage,
  normalizeSystem,
  responseToAssistantMessage,
} from "../formats/message-format.ts";
import { throwIfAborted } from "../shared/abort.ts";
import type {
  AgentEvent,
  ChatRequest,
  ChatResponse,
  ChatResponseChunk,
  ExtensionContext,
  IdentifiedMessage,
  Message,
  PayloadByStage,
  RunTurnDeps,
  Stage,
  ToolExecutionContext,
  ToolResult,
  ToolUseBlock,
  TurnInput,
  TurnResult,
  TurnState,
} from "../shared/types.ts";

function makeExtensionContext(state: TurnState): ExtensionContext {
  return {
    state,
  };
}

async function runStage<S extends Stage>(
  registry: RunTurnDeps["registry"],
  stage: S,
  payload: PayloadByStage[S],
  ctx: ExtensionContext,
): Promise<PayloadByStage[S]> {
  const transformed = await registry.runTransformers(stage, payload, ctx);
  await registry.runObservers(stage, transformed, ctx);
  return transformed;
}

async function emitEvent(
  onEvent: RunTurnDeps["onEvent"],
  event: AgentEvent,
  ctx: ToolExecutionContext,
): Promise<void> {
  await onEvent?.(event, ctx);
}

function replaceToolUseBlocks(message: Message, toolUseBlocks: ToolUseBlock[]): Message {
  let toolUseIndex = 0;

  return {
    ...message,
    content: message.content.map((block) => {
      if (block.type !== "tool_use") {
        return block;
      }

      const nextToolUseBlock = toolUseBlocks[toolUseIndex];
      toolUseIndex += 1;
      return structuredClone(nextToolUseBlock);
    }),
  };
}

function createAssistantMessageId(turnId: string, index: number): string {
  return `${turnId}:assistant:${index}`;
}

function createReasoningMessageId(assistantMessageId: string): string {
  return `${assistantMessageId}:reasoning`;
}

function withMessageId(message: Message, id: string): IdentifiedMessage {
  if (message.id === id) {
    return message as IdentifiedMessage;
  }

  return {
    ...message,
    id,
  };
}

function createAssistantChunkEvent(
  chunk: ChatResponseChunk,
  messageId: string,
): AgentEvent | undefined {
  if (chunk.type !== "content_delta") {
    return undefined;
  }

  if (chunk.text === undefined) {
    return undefined;
  }

  return {
    type: "assistant_chunk",
    index: chunk.index ?? 0,
    messageId,
    chunk: {
      type: "content_delta",
      index: chunk.index ?? 0,
      text: chunk.text,
    },
  };
}

function createToolUseChunkEvent(
  chunk: ChatResponseChunk,
  messageId: string,
): AgentEvent | undefined {
  if (chunk.type !== "tool_use_delta") {
    return undefined;
  }

  return {
    type: "tool_use_chunk",
    index: chunk.index ?? 0,
    messageId,
    chunk: {
      type: "tool_use_delta",
      id: chunk.id ?? "",
      index: chunk.index ?? 0,
      ...(chunk.name !== undefined ? { name: chunk.name } : {}),
      ...(chunk.inputDelta !== undefined ? { inputDelta: chunk.inputDelta } : {}),
    },
  };
}

function resolveReasoningEventIndex(chunk: ChatResponseChunk): number {
  return chunk.index ?? chunk.contentIndex ?? chunk.summaryIndex ?? chunk.outputIndex ?? 0;
}

function createReasoningChunkEvent(
  chunk: ChatResponseChunk,
  messageId: string,
): AgentEvent | undefined {
  switch (chunk.type) {
    case "anthropic_thinking_delta":
      return {
        type: "reasoning_chunk",
        index: resolveReasoningEventIndex(chunk),
        messageId,
        chunk: {
          type: "anthropic_thinking_delta",
          index: chunk.index ?? 0,
          thinking: chunk.thinking ?? "",
        },
        text: chunk.thinking ?? "",
      };

    case "openai_reasoning_delta":
      return {
        type: "reasoning_chunk",
        index: resolveReasoningEventIndex(chunk),
        messageId,
        chunk: {
          type: "openai_reasoning_delta",
          contentIndex: chunk.contentIndex ?? 0,
          delta: chunk.delta ?? "",
          itemId: chunk.itemId ?? "",
          outputIndex: chunk.outputIndex ?? 0,
        },
        text: chunk.delta ?? "",
      };

    case "openai_reasoning_summary_delta":
      return {
        type: "reasoning_chunk",
        index: resolveReasoningEventIndex(chunk),
        messageId,
        chunk: {
          type: "openai_reasoning_summary_delta",
          delta: chunk.delta ?? "",
          itemId: chunk.itemId ?? "",
          outputIndex: chunk.outputIndex ?? 0,
          summaryIndex: chunk.summaryIndex ?? 0,
        },
        text: chunk.delta ?? "",
      };

    default:
      return undefined;
  }
}

function isAbortedToolResult(result: ToolResult): boolean {
  return result.status === "error" && result.structured.aborted === true;
}

async function executeModelRequest(
  request: ChatRequest,
  input: TurnInput,
  deps: RunTurnDeps,
  ctx: ToolExecutionContext,
  options: {
    assistantMessageId: string;
    reasoningMessageId: string;
  },
): Promise<ChatResponse> {
  throwIfAborted(input.signal);

  if (!input.streaming || !deps.chatModel.stream) {
    return await deps.chatModel.complete(request, {
      signal: input.signal,
    });
  }

  let finalResponse: ChatResponse | undefined;

  for await (const chunk of deps.chatModel.stream(request, {
    signal: input.signal,
  })) {
    throwIfAborted(input.signal);

    if (chunk.type === "done") {
      finalResponse = chunk.response;
      continue;
    }

    const reasoningEvent = createReasoningChunkEvent(chunk, options.reasoningMessageId);

    if (
      reasoningEvent &&
      reasoningEvent.type === "reasoning_chunk" &&
      reasoningEvent.text.length > 0
    ) {
      await emitEvent(deps.onEvent, reasoningEvent, ctx);
      continue;
    }

    const assistantEvent = createAssistantChunkEvent(chunk, options.assistantMessageId);

    if (assistantEvent) {
      await emitEvent(deps.onEvent, assistantEvent, ctx);
      continue;
    }

    const toolUseEvent = createToolUseChunkEvent(chunk, options.assistantMessageId);

    if (toolUseEvent) {
      await emitEvent(deps.onEvent, toolUseEvent, ctx);
    }
  }

  if (!finalResponse) {
    throw new Error("Model stream ended without a final response");
  }

  return finalResponse;
}

interface TurnGuards {
  /** Runs an extension stage. Throws if the signal is aborted before dispatch. */
  stage<S extends Stage>(stageName: S, payload: PayloadByStage[S]): Promise<PayloadByStage[S]>;
  /** Emits an event. Throws if the signal is aborted before dispatch. */
  emit(event: AgentEvent): Promise<void>;
  /** Same as stage() but does not check the signal — for post-abort flushing. */
  stageUnchecked<S extends Stage>(
    stageName: S,
    payload: PayloadByStage[S],
  ): Promise<PayloadByStage[S]>;
  /** Same as emit() but does not check the signal — for post-abort flushing. */
  emitUnchecked(event: AgentEvent): Promise<void>;
}

function makeTurnGuards(
  signal: AbortSignal,
  registry: RunTurnDeps["registry"],
  onEvent: RunTurnDeps["onEvent"],
  ctx: ExtensionContext,
  eventCtx: ToolExecutionContext,
): TurnGuards {
  return {
    async stage(stageName, payload) {
      throwIfAborted(signal);
      return await runStage(registry, stageName, payload, ctx);
    },
    async emit(event) {
      throwIfAborted(signal);
      await emitEvent(onEvent, event, eventCtx);
    },
    async stageUnchecked(stageName, payload) {
      return await runStage(registry, stageName, payload, ctx);
    },
    async emitUnchecked(event) {
      await emitEvent(onEvent, event, eventCtx);
    },
  };
}

export async function runTurn(input: TurnInput, deps: RunTurnDeps): Promise<TurnResult> {
  const signal = input.signal ?? new AbortController().signal;
  const state: TurnState = {
    sessionId: input.sessionId,
    turnId: input.turnId,
    system: normalizeSystem(input.system),
    messages: (input.messages ?? []).map(normalizeMessage),
    lastResponse: undefined,
    toolResults: [],
    finalMessage: undefined,
  };

  const ctx = makeExtensionContext(state);
  const eventCtx: ToolExecutionContext = {
    sessionId: state.sessionId,
    turnId: state.turnId,
    state,
    signal,
  };
  const { stage, emit, stageUnchecked, emitUnchecked } = makeTurnGuards(
    signal,
    deps.registry,
    deps.onEvent,
    ctx,
    eventCtx,
  );
  let assistantMessageIndex = 0;

  try {
    const userMessage = await stage("onUserMessage", normalizeMessage(input.message));
    state.messages.push(userMessage);
    await emit({ type: "user_message", message: userMessage });

    while (true) {
      // Single loop-edge guard. All subsequent awaits are guarded by stage()/emit()
      // or by signal-aware leaves (executeModelRequest, toolRuntime.executeCalls).
      throwIfAborted(signal);

      assistantMessageIndex += 1;
      const assistantMessageId = createAssistantMessageId(state.turnId, assistantMessageIndex);
      const reasoningMessageId = createReasoningMessageId(assistantMessageId);

      let modelRequest: ChatRequest = {
        model: deps.chatModel.model,
        maxTokens: deps.chatModel.maxTokens ?? 16384,
        system: structuredClone(state.system),
        messages: structuredClone(state.messages),
        tools: deps.toolRuntime.listToolSchemas(),
        metadata: {
          sessionId: state.sessionId,
          turnId: state.turnId,
        },
      };
      modelRequest = await stage("beforeModelRequest", modelRequest);
      await emit({ type: "model_request", request: modelRequest });

      let modelResponse = await executeModelRequest(modelRequest, input, deps, eventCtx, {
        assistantMessageId,
        reasoningMessageId,
      });
      modelResponse = await stage("afterModelResponse", modelResponse);
      await emit({ type: "model_response", response: modelResponse });

      state.lastResponse = modelResponse;

      let assistantMessage = await stage(
        "beforeAssistantAppend",
        withMessageId(responseToAssistantMessage(modelResponse), assistantMessageId),
      );
      assistantMessage = withMessageId(assistantMessage, assistantMessageId);

      const toolUseBlocks = getToolUseBlocks(assistantMessage);
      const executableToolUseBlocks = await Promise.all(
        toolUseBlocks.map((toolUseBlock) => stage("beforeToolExecution", toolUseBlock)),
      );

      if (executableToolUseBlocks.length > 0) {
        assistantMessage = replaceToolUseBlocks(assistantMessage, executableToolUseBlocks);
      }

      const identifiedAssistantMessage = withMessageId(assistantMessage, assistantMessageId);
      assistantMessage = identifiedAssistantMessage;

      const reasoningMessage = createReasoningMessage(assistantMessage);
      const assistantTextMessage = createAssistantTextMessage(assistantMessage);
      const toolUseMessage = createToolUseMessage(assistantMessage);

      if (reasoningMessage) {
        await emit({
          type: "reasoning_message",
          message: withMessageId(reasoningMessage, reasoningMessageId),
        });
      }

      if (assistantTextMessage) {
        await emit({
          type: "assistant_message",
          message: withMessageId(assistantTextMessage, assistantMessageId),
        });
      }

      if (toolUseMessage) {
        await emit({
          type: "tool_use_message",
          message: withMessageId(toolUseMessage, assistantMessageId),
        });
      }

      state.messages.push(identifiedAssistantMessage);

      for (const toolUseBlock of executableToolUseBlocks) {
        await emit({ type: "tool_call", toolCall: toolUseBlock });
      }

      if (executableToolUseBlocks.length === 0) {
        const finalMessage = await stage("beforeFinalOutput", assistantMessage);
        const identifiedFinalMessage = withMessageId(finalMessage, assistantMessageId);
        state.finalMessage = identifiedFinalMessage;
        state.messages[state.messages.length - 1] = identifiedFinalMessage;
        await emit({ type: "final_message", message: identifiedFinalMessage });
        throwIfAborted(signal);
        await deps.registry.runObservers("afterTurnComplete", state, ctx);
        await emit({ type: "turn_complete", state });

        return {
          status: "completed",
          finalMessage: identifiedFinalMessage,
          state,
        };
      }

      let toolResults: ToolResult[] = await deps.toolRuntime.executeCalls(
        executableToolUseBlocks,
        eventCtx,
      );
      const turnAborted = toolResults.some(isAbortedToolResult);

      // Post-abort flush: once a tool reports aborted, drain the remaining
      // afterToolResult stage + tool_result events + tool_result_message without
      // re-throwing on the already-aborted signal, then return "aborted".
      const runStageOrFlush = turnAborted ? stageUnchecked : stage;
      const emitOrFlush = turnAborted ? emitUnchecked : emit;

      toolResults = await Promise.all(
        toolResults.map((toolResult) => runStageOrFlush("afterToolResult", toolResult)),
      );

      state.toolResults.push(...toolResults);

      for (const toolResult of toolResults) {
        await emitOrFlush({ type: "tool_result", result: toolResult });
      }

      const toolResultMessage = await runStageOrFlush(
        "beforeToolResultAppend",
        createToolResultUserMessage(toolResults),
      );

      await emitOrFlush({ type: "tool_result_message", message: toolResultMessage });
      state.messages.push(toolResultMessage);

      if (turnAborted) {
        return {
          status: "aborted",
          state,
        };
      }
    }
  } catch (error) {
    if (!signal.aborted) {
      throw error;
    }

    return {
      status: "aborted",
      state,
    };
  }
}
