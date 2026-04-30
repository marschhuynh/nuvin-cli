import assert from "node:assert/strict";
import { test } from "vitest";

import { getTextFromMessage } from "../formats/message-format.ts";
import { MockModel } from "../models/mock-model.ts";
import type { AgentEvent, ChatResponse, RunTurnDeps } from "../shared/types.ts";
import { createInternalToolRuntime } from "../tools/internal-tool-runtime.ts";
import { createMockToolRuntime } from "../tools/mock-tool-runtime.ts";
import { defineTool } from "../tools/tools.ts";
import { createExtensionRegistry } from "./extension-registry.ts";
import { runTurn } from "./turn-engine.ts";

function createDeps(overrides: Partial<RunTurnDeps> = {}): RunTurnDeps {
  const registry = overrides.registry ?? createExtensionRegistry();
  const chatModel = overrides.chatModel ?? new MockModel();
  const toolRuntime = overrides.toolRuntime ?? createMockToolRuntime();

  return {
    registry,
    chatModel,
    toolRuntime,
    ...overrides,
  };
}

test("runTurn compiles a model request and returns a final assistant message", async () => {
  const chatModel = new MockModel();
  const result = await runTurn(
    {
      sessionId: "session-1",
      turnId: "turn-1",
      system: [
        {
          type: "text",
          text: "Be direct.",
        },
      ],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "hello there",
          },
        ],
      },
    },
    createDeps({ chatModel }),
  );

  assert.ok(result.finalMessage);
  assert.equal(result.finalMessage.role, "assistant");
  assert.equal(result.finalMessage.content[0].type, "text");
  assert.match(getTextFromMessage(result.finalMessage), /direct answer/i);

  assert.equal("trace" in result, false);
  assert.equal(chatModel.requests.length, 1);
  assert.deepEqual(chatModel.requests[0].system, [
    {
      type: "text",
      text: "Be direct.",
    },
  ]);
  assert.equal(chatModel.requests[0].messages[0].role, "user");
  assert.equal(chatModel.requests[0].messages[0].content[0].type, "text");
  assert.equal("history" in result.state, false);
  assert.equal("context" in result.state, false);
});

test("runTurn extension context exposes state without policy", async () => {
  let sawPolicy = true;
  const registry = createExtensionRegistry();

  registry.register({
    id: "inspect-extension-context",
    stage: "beforeModelRequest",
    kind: "observer",
    order: 10,
    enabled: true,
    run(_request, ctx) {
      sawPolicy = "policy" in ctx;
      assert.equal(ctx.state.sessionId, "session-extension-context");
    },
  });

  await runTurn(
    {
      sessionId: "session-extension-context",
      turnId: "turn-extension-context",
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "hello",
          },
        ],
      },
    },
    createDeps({ registry }),
  );

  assert.equal(sawPolicy, false);
});

test("runTurn emits a reasoning_message event before assistant_message when reasoning is present", async () => {
  const events: AgentEvent[] = [];

  const chatModel: RunTurnDeps["chatModel"] = {
    model: "gpt-5.4",
    maxTokens: 1024,
    async complete() {
      return {
        id: "resp-1",
        content: [
          {
            type: "openai_reasoning",
            summary: [
              {
                type: "summary_text",
                text: "Inspect files first.",
              },
            ],
          },
          {
            type: "text",
            text: "Done",
          },
        ],
        stopReason: "end_turn",
        usage: {
          inputTokens: 3,
          outputTokens: 2,
        },
      };
    },
  };

  await runTurn(
    {
      sessionId: "session-reasoning-event",
      turnId: "turn-reasoning-event",
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "hello",
          },
        ],
      },
    },
    createDeps({
      chatModel,
      onEvent(event) {
        events.push(structuredClone(event));
      },
    }),
  );

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "user_message",
      "model_request",
      "model_response",
      "reasoning_message",
      "assistant_message",
      "final_message",
      "turn_complete",
    ],
  );

  const reasoningMessageEvent = events[3];
  assert.equal(reasoningMessageEvent.type, "reasoning_message");
  assert.equal(reasoningMessageEvent.message.id, "turn-reasoning-event:assistant:1:reasoning");
  assert.equal(reasoningMessageEvent.message.content.length, 1);
  assert.equal(reasoningMessageEvent.message.content[0].type, "openai_reasoning");

  const assistantMessageEvent = events[4];
  assert.equal(assistantMessageEvent.type, "assistant_message");
  assert.equal(assistantMessageEvent.message.id, "turn-reasoning-event:assistant:1");
  assert.equal(assistantMessageEvent.message.content.length, 1);
  assert.equal(assistantMessageEvent.message.content[0].type, "text");

  const finalMessageEvent = events[5];
  assert.equal(finalMessageEvent.type, "final_message");
  assert.equal(finalMessageEvent.message.id, "turn-reasoning-event:assistant:1");
});

test("runTurn emits assistant and reasoning chunk events when streaming is enabled", async () => {
  const events: AgentEvent[] = [];

  const chatModel: RunTurnDeps["chatModel"] = {
    model: "gpt-5.4",
    maxTokens: 1024,
    async complete() {
      throw new Error("complete should not be called when streaming is enabled");
    },
    async *stream() {
      yield {
        type: "anthropic_thinking_delta",
        index: 0,
        thinking: "Inspect first.",
      };
      yield {
        type: "content_delta",
        text: "Done",
      };
      yield {
        type: "done",
        response: {
          id: "resp-stream-turn-1",
          content: [
            {
              type: "anthropic_thinking",
              thinking: "Inspect first.",
              signature: "sig-1",
            },
            {
              type: "text",
              text: "Done",
            },
          ],
          stopReason: "end_turn",
          usage: {
            inputTokens: 2,
            outputTokens: 1,
          },
        },
      };
    },
  };

  await runTurn(
    {
      sessionId: "session-streaming-events",
      turnId: "turn-streaming-events",
      streaming: true,
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "hello",
          },
        ],
      },
    },
    createDeps({
      chatModel,
      onEvent(event) {
        events.push(structuredClone(event));
      },
    }),
  );

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "user_message",
      "model_request",
      "reasoning_chunk",
      "assistant_chunk",
      "model_response",
      "reasoning_message",
      "assistant_message",
      "final_message",
      "turn_complete",
    ],
  );

  const reasoningChunkEvent = events[2];
  assert.equal(reasoningChunkEvent.type, "reasoning_chunk");
  assert.equal(reasoningChunkEvent.index, 0);
  assert.equal(reasoningChunkEvent.messageId, "turn-streaming-events:assistant:1:reasoning");
  assert.equal(reasoningChunkEvent.text, "Inspect first.");

  const assistantChunkEvent = events[3];
  assert.equal(assistantChunkEvent.type, "assistant_chunk");
  assert.equal(assistantChunkEvent.index, 0);
  assert.equal(assistantChunkEvent.messageId, "turn-streaming-events:assistant:1");
  assert.equal(assistantChunkEvent.chunk.text, "Done");

  const assistantMessageEvent = events[6];
  assert.equal(assistantMessageEvent.type, "assistant_message");
  assert.equal(assistantMessageEvent.message.id, "turn-streaming-events:assistant:1");

  const finalMessageEvent = events[7];
  assert.equal(finalMessageEvent.type, "final_message");
  assert.equal(finalMessageEvent.message.id, "turn-streaming-events:assistant:1");
});

test("runTurn emits reasoning and assistant chunks for streamed tool-use turns", async () => {
  const events: AgentEvent[] = [];
  let streamCallCount = 0;

  const chatModel: RunTurnDeps["chatModel"] = {
    model: "gpt-5.4",
    maxTokens: 1024,
    async complete() {
      throw new Error("complete should not be called when streaming is enabled");
    },
    async *stream() {
      streamCallCount += 1;

      if (streamCallCount === 1) {
        yield {
          type: "anthropic_thinking_delta",
          index: 0,
          thinking: "Inspect ",
        };
        yield {
          type: "anthropic_thinking_delta",
          index: 0,
          thinking: "files first.",
        };
        yield {
          type: "content_delta",
          text: "I will inspect the workspace.",
        };
        yield {
          type: "tool_use_delta",
          id: "call-stream-1",
          index: 1,
          name: "Bash",
        };
        yield {
          type: "tool_use_delta",
          id: "call-stream-1",
          index: 1,
          inputDelta: '{"command":"ls -la"}',
        };
        yield {
          type: "done",
          response: {
            id: "resp-stream-tool-turn-1",
            content: [
              {
                type: "anthropic_thinking",
                thinking: "Inspect files first.",
                signature: "sig-stream-1",
              },
              {
                type: "text",
                text: "I will inspect the workspace.",
              },
              {
                type: "tool_use",
                id: "call-stream-1",
                name: "Bash",
                input: {
                  command: "ls -la",
                },
              },
            ],
            stopReason: "tool_use",
            usage: {
              inputTokens: 2,
              outputTokens: 1,
            },
          },
        };
        return;
      }

      yield {
        type: "content_delta",
        text: "Done",
      };
      yield {
        type: "done",
        response: {
          id: "resp-stream-tool-turn-2",
          content: [
            {
              type: "text",
              text: "Done",
            },
          ],
          stopReason: "end_turn",
          usage: {
            inputTokens: 2,
            outputTokens: 1,
          },
        },
      };
    },
  };

  await runTurn(
    {
      sessionId: "session-streaming-tool-events",
      turnId: "turn-streaming-tool-events",
      streaming: true,
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "hello",
          },
        ],
      },
    },
    createDeps({
      chatModel,
      onEvent(event) {
        events.push(structuredClone(event));
      },
    }),
  );

  const reasoningChunkEvents = events.filter((event) => event.type === "reasoning_chunk");
  assert.equal(reasoningChunkEvents.length, 2);
  assert.equal(reasoningChunkEvents[0].type, "reasoning_chunk");
  assert.equal(reasoningChunkEvents[0].index, 0);
  assert.equal(
    reasoningChunkEvents[0].messageId,
    "turn-streaming-tool-events:assistant:1:reasoning",
  );
  assert.equal(reasoningChunkEvents[0].text, "Inspect ");
  assert.equal(reasoningChunkEvents[1].type, "reasoning_chunk");
  assert.equal(reasoningChunkEvents[1].index, 0);
  assert.equal(
    reasoningChunkEvents[1].messageId,
    "turn-streaming-tool-events:assistant:1:reasoning",
  );
  assert.equal(reasoningChunkEvents[1].text, "files first.");

  const assistantChunkEvents = events.filter((event) => event.type === "assistant_chunk");
  assert.equal(assistantChunkEvents.length, 2);
  assert.equal(assistantChunkEvents[0].type, "assistant_chunk");
  assert.equal(assistantChunkEvents[0].index, 0);
  assert.equal(assistantChunkEvents[0].messageId, "turn-streaming-tool-events:assistant:1");
  assert.equal(assistantChunkEvents[0].chunk.text, "I will inspect the workspace.");
  assert.equal(assistantChunkEvents[1].type, "assistant_chunk");
  assert.equal(assistantChunkEvents[1].index, 0);
  assert.equal(assistantChunkEvents[1].messageId, "turn-streaming-tool-events:assistant:2");
  assert.equal(assistantChunkEvents[1].chunk.text, "Done");

  const toolUseChunkEvents = events.filter((event) => event.type === "tool_use_chunk");
  assert.equal(toolUseChunkEvents.length, 2);
  assert.equal(toolUseChunkEvents[0].type, "tool_use_chunk");
  assert.equal(toolUseChunkEvents[0].messageId, "turn-streaming-tool-events:assistant:1");
  assert.equal(toolUseChunkEvents[0].index, 1);
  assert.deepEqual(toolUseChunkEvents[0].chunk, {
    type: "tool_use_delta",
    id: "call-stream-1",
    index: 1,
    name: "Bash",
  });
  assert.equal(toolUseChunkEvents[1].type, "tool_use_chunk");
  assert.equal(toolUseChunkEvents[1].messageId, "turn-streaming-tool-events:assistant:1");
  assert.equal(toolUseChunkEvents[1].index, 1);
  assert.deepEqual(toolUseChunkEvents[1].chunk, {
    type: "tool_use_delta",
    id: "call-stream-1",
    index: 1,
    inputDelta: '{"command":"ls -la"}',
  });

  const firstAssistantMessageEvent = events.find(
    (event): event is Extract<AgentEvent, { type: "assistant_message" }> => {
      return (
        event.type === "assistant_message" &&
        event.message.id === "turn-streaming-tool-events:assistant:1"
      );
    },
  );
  assert.ok(firstAssistantMessageEvent);
  assert.equal(firstAssistantMessageEvent.message.content.length, 1);
  assert.equal(firstAssistantMessageEvent.message.content[0].type, "text");

  const toolUseMessageEvent = events.find(
    (event): event is Extract<AgentEvent, { type: "tool_use_message" }> => {
      return (
        event.type === "tool_use_message" &&
        event.message.id === "turn-streaming-tool-events:assistant:1"
      );
    },
  );
  assert.ok(toolUseMessageEvent);
  assert.equal(toolUseMessageEvent.message.content.length, 1);
  assert.equal(toolUseMessageEvent.message.content[0].type, "tool_use");

  const finalMessageEvent = events.find((event) => event.type === "final_message");
  assert.ok(finalMessageEvent);
  assert.equal(finalMessageEvent.message.id, "turn-streaming-tool-events:assistant:2");
});

test("runTurn appends assistant tool_use and user tool_result messages to the canonical transcript", async () => {
  const chatModel = new MockModel();
  const registry = createExtensionRegistry();
  const maxToolResultBytes = 120;

  registry.register({
    id: "truncate-shell-output",
    stage: "afterToolResult",
    kind: "transformer",
    order: 10,
    enabled: true,
    async run(result) {
      if (!result.output || result.output.length <= maxToolResultBytes) {
        return result;
      }

      return {
        ...result,
        output: `Truncated tool output for ${result.toolName}.`,
        meta: {
          ...result.meta,
          truncated: true,
          originalBytes: result.output.length,
          transforms: [...(result.meta.transforms ?? []), "truncate-shell-output"],
        },
      };
    },
  });

  const result = await runTurn(
    {
      sessionId: "session-2",
      turnId: "turn-2",
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "please list the files in the workspace",
          },
        ],
      },
    },
    createDeps({ registry, chatModel }),
  );

  assert.equal(chatModel.requests.length, 2);
  assert.equal(result.state.messages.length, 4);
  assert.equal(result.state.messages[1].role, "assistant");
  assert.equal(result.state.messages[1].content[0].type, "tool_use");
  assert.equal(result.state.messages[2].role, "user");
  assert.equal(result.state.messages[2].content[0].type, "tool_result");
  assert.equal(result.state.messages[2].content[0].is_error, false);
  assert.equal(typeof result.state.messages[2].content[0].content, "string");
  assert.equal(
    String(result.state.messages[2].content[0].content),
    "Truncated tool output for Bash.",
  );
  assert.match(getTextFromMessage(result.finalMessage), /truncated tool output/i);
});

test("runTurn routes assistant and tool-result append through distinct stages", async () => {
  const chatModel = new MockModel();
  const registry = createExtensionRegistry();

  registry.register({
    id: "annotate-assistant-append",
    stage: "beforeAssistantAppend",
    kind: "transformer",
    order: 10,
    enabled: true,
    async run(message) {
      return {
        ...message,
        content: [
          {
            type: "text",
            text: "Planning tool call.",
          },
          ...message.content,
        ],
      };
    },
  });

  registry.register({
    id: "summarize-tool-result-append",
    stage: "beforeToolResultAppend",
    kind: "transformer",
    order: 10,
    enabled: true,
    async run(message) {
      return {
        ...message,
        content: message.content.map((block) => {
          if (block.type !== "tool_result") {
            return block;
          }

          return {
            ...block,
            content: "Tool result summary.",
          };
        }),
      };
    },
  });

  const result = await runTurn(
    {
      sessionId: "session-2a",
      turnId: "turn-2a",
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "please list the files in the workspace",
          },
        ],
      },
    },
    createDeps({ registry, chatModel }),
  );

  assert.equal(result.state.messages[1].role, "assistant");
  assert.equal(result.state.messages[1].content[0].type, "text");
  assert.equal(getTextFromMessage(result.state.messages[1]), "Planning tool call.");
  assert.equal(result.state.messages[1].content[1].type, "tool_use");
  assert.equal(result.state.messages[2].role, "user");
  assert.equal(result.state.messages[2].content.length, 1);
  assert.equal(result.state.messages[2].content[0].type, "tool_result");
  assert.equal(String(result.state.messages[2].content[0].content), "Tool result summary.");
  assert.match(getTextFromMessage(result.finalMessage), /tool result summary/i);
});

test("runTurn applies beforeToolExecution before dispatch and keeps the transcript aligned", async () => {
  const chatModel = new MockModel();
  const registry = createExtensionRegistry();

  registry.register({
    id: "rewrite-tool-command",
    stage: "beforeToolExecution",
    kind: "transformer",
    order: 10,
    enabled: true,
    async run(toolCall) {
      return {
        ...toolCall,
        input: {
          command: "pwd",
        },
      };
    },
  });

  const result = await runTurn(
    {
      sessionId: "session-2b",
      turnId: "turn-2b",
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "please list the files in the workspace",
          },
        ],
      },
    },
    createDeps({ registry, chatModel }),
  );

  assert.equal(chatModel.requests.length, 2);
  assert.equal(result.state.messages[1].content[0].type, "tool_use");
  assert.deepEqual(result.state.messages[1].content[0].input, {
    command: "pwd",
  });
  assert.equal(result.state.toolResults[0].structured.command, "pwd");
  assert.equal(chatModel.requests[1].messages[1].content[0].type, "tool_use");
  assert.deepEqual(chatModel.requests[1].messages[1].content[0].input, {
    command: "pwd",
  });
});

test("extensions can rewrite the user message block and inject top-level system text", async () => {
  const chatModel = new MockModel({ maxTokens: 1024 });
  const registry = createExtensionRegistry();
  const seenRequests: Array<{
    maxTokens: number;
    metadata: {
      turnId: string;
    };
  }> = [];

  registry.register({
    id: "normalize-command",
    stage: "onUserMessage",
    kind: "transformer",
    order: 10,
    enabled: true,
    async run(message) {
      return {
        ...message,
        content: [
          {
            type: "text",
            text: "status",
          },
        ],
      };
    },
  });

  registry.register({
    id: "inject-system",
    stage: "beforeModelRequest",
    kind: "transformer",
    order: 10,
    enabled: true,
    async run(request) {
      seenRequests.push({
        maxTokens: request.maxTokens,
        metadata: {
          turnId: request.metadata.turnId,
        },
      });

      return {
        ...request,
        system: [
          {
            type: "text",
            text: "System reminder: keep the loop deterministic.",
          },
          ...request.system,
        ],
        maxTokens: 2048,
      };
    },
  });

  const result = await runTurn(
    {
      sessionId: "session-3",
      turnId: "turn-3",
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "/ask status",
          },
        ],
      },
    },
    createDeps({ registry, chatModel }),
  );

  assert.equal(getTextFromMessage(result.state.messages[0]), "status");
  assert.equal(seenRequests[0].maxTokens, 1024);
  assert.equal(seenRequests[0].metadata.turnId, "turn-3");
  assert.equal(chatModel.requests[0].maxTokens, 2048);
  assert.equal(chatModel.requests[0].system[0].type, "text");
  assert.match(chatModel.requests[0].system[0].text, /deterministic/i);
});

test("runTurn emits finalized agent events in loop order", async () => {
  const chatModel = new MockModel();
  const registry = createExtensionRegistry();
  const events: AgentEvent[] = [];

  registry.register({
    id: "rewrite-tool-command-for-events",
    stage: "beforeToolExecution",
    kind: "transformer",
    order: 10,
    enabled: true,
    async run(toolCall) {
      return {
        ...toolCall,
        input: {
          command: "pwd",
        },
      };
    },
  });

  registry.register({
    id: "normalize-tool-result-for-events",
    stage: "afterToolResult",
    kind: "transformer",
    order: 10,
    enabled: true,
    async run(result) {
      return {
        ...result,
        output: "Normalized tool output.",
        meta: {
          ...result.meta,
          transforms: [...result.meta.transforms, "normalize-tool-result-for-events"],
        },
      };
    },
  });

  registry.register({
    id: "summarize-tool-result-message-for-events",
    stage: "beforeToolResultAppend",
    kind: "transformer",
    order: 10,
    enabled: true,
    async run(message) {
      return {
        ...message,
        content: message.content.map((block) => {
          if (block.type !== "tool_result") {
            return block;
          }

          return {
            ...block,
            content: "Tool result summary.",
          };
        }),
      };
    },
  });

  const result = await runTurn(
    {
      sessionId: "session-events",
      turnId: "turn-events",
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "please list the files in the workspace",
          },
        ],
      },
    },
    createDeps({
      registry,
      chatModel,
      onEvent(event) {
        events.push(structuredClone(event));
      },
    }),
  );

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "user_message",
      "model_request",
      "model_response",
      "tool_use_message",
      "tool_call",
      "tool_result",
      "tool_result_message",
      "model_request",
      "model_response",
      "assistant_message",
      "final_message",
      "turn_complete",
    ],
  );

  const firstAssistantMessageEvent = events[3];
  assert.equal(firstAssistantMessageEvent.type, "tool_use_message");
  assert.equal(firstAssistantMessageEvent.message.content[0].type, "tool_use");
  assert.deepEqual(firstAssistantMessageEvent.message.content[0].input, {
    command: "pwd",
  });

  const toolCallEvent = events[4];
  assert.equal(toolCallEvent.type, "tool_call");
  assert.deepEqual(toolCallEvent.toolCall.input, {
    command: "pwd",
  });

  const toolResultEvent = events[5];
  assert.equal(toolResultEvent.type, "tool_result");
  assert.equal(toolResultEvent.result.output, "Normalized tool output.");
  assert.deepEqual(toolResultEvent.result.meta.transforms, ["normalize-tool-result-for-events"]);

  const toolResultMessageEvent = events[6];
  assert.equal(toolResultMessageEvent.type, "tool_result_message");
  const toolResultBlock = toolResultMessageEvent.message.content[0];
  assert.equal(toolResultBlock.type, "tool_result");
  assert.equal(String(toolResultBlock.content), "Tool result summary.");

  const finalMessageEvent = events[10];
  assert.equal(finalMessageEvent.type, "final_message");
  assert.match(getTextFromMessage(finalMessageEvent.message), /tool result summary/i);

  const turnCompleteEvent = events[11];
  assert.equal(turnCompleteEvent.type, "turn_complete");
  assert.deepEqual(turnCompleteEvent.state.finalMessage, result.finalMessage);
  assert.match(getTextFromMessage(result.finalMessage), /tool result summary/i);
});

test("runTurn resolves an aborted in-flight model request and preserves the appended user message", async () => {
  const events: AgentEvent[] = [];
  const controller = new AbortController();
  let notifyModelRequest: (() => void) | undefined;
  const modelRequestEmitted = new Promise<void>((resolve) => {
    notifyModelRequest = resolve;
  });

  const chatModel: RunTurnDeps["chatModel"] = {
    model: "abort-aware-model",
    maxTokens: 1024,
    async complete(_request, options?: { signal?: AbortSignal }) {
      const signal = options?.signal;

      if (!signal) {
        throw new Error("missing abort signal");
      }

      return await new Promise<ChatResponse>((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }

        signal.addEventListener(
          "abort",
          () => {
            reject(signal.reason);
          },
          { once: true },
        );
      });
    },
  };

  const pending = runTurn(
    {
      sessionId: "session-abort",
      turnId: "turn-abort",
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "stop immediately",
          },
        ],
      },
      signal: controller.signal,
    },
    createDeps({
      chatModel,
      onEvent(event) {
        events.push(structuredClone(event));

        if (event.type === "model_request") {
          notifyModelRequest?.();
        }
      },
    }),
  );

  await modelRequestEmitted;
  controller.abort(new Error("user abort"));

  const result = await pending;

  assert.equal(result.status, "aborted");
  assert.equal(result.finalMessage, undefined);
  assert.equal(result.state.messages.at(-1)?.role, "user");
  assert.deepEqual(
    events.map((event) => event.type),
    ["user_message", "model_request"],
  );
  assert.equal(
    events.some((event) => event.type === "final_message"),
    false,
  );
  assert.equal(
    events.some((event) => event.type === "turn_complete"),
    false,
  );
});

test("runTurn records an aborted tool result and returns an interrupted turn without terminal events", async () => {
  const events: AgentEvent[] = [];
  const controller = new AbortController();

  const chatModel: RunTurnDeps["chatModel"] = {
    model: "tool-abort-model",
    maxTokens: 1024,
    async complete(request) {
      const lastMessage = request.messages.at(-1);
      const lastBlock = lastMessage?.content[0];

      if (lastBlock?.type === "tool_result") {
        throw new Error("runTurn should stop after recording the aborted tool result");
      }

      return {
        id: "resp-tool-abort",
        content: [
          {
            type: "tool_use",
            id: "tool-call-abort",
            name: "demo.abort",
            input: {},
          },
        ],
        stopReason: "tool_use",
        usage: {
          inputTokens: 3,
          outputTokens: 2,
        },
      };
    },
  };

  const toolRuntime = createInternalToolRuntime(
    [
      defineTool({
        name: "demo.abort",
        description: "Waits for abort",
        inputSchema: {
          type: "object",
          properties: {},
        },
        async *execute(_input, ctx) {
          await new Promise<never>((_resolve, reject) => {
            if (ctx.signal.aborted) {
              reject(ctx.signal.reason);
              return;
            }

            ctx.signal.addEventListener(
              "abort",
              () => {
                reject(ctx.signal.reason);
              },
              { once: true },
            );
          });
        },
      }),
    ],
    {
      onEvent(event) {
        events.push(structuredClone(event));

        if (event.type === "tool_started") {
          controller.abort(new Error("User aborted this tool call."));
        }
      },
    },
  );

  const result = await runTurn(
    {
      sessionId: "session-tool-abort",
      turnId: "turn-tool-abort",
      system: [],
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "run the tool",
          },
        ],
      },
      signal: controller.signal,
    },
    createDeps({
      chatModel,
      toolRuntime,
      onEvent(event) {
        events.push(structuredClone(event));
      },
    }),
  );

  assert.equal(result.status, "aborted");
  assert.equal(result.finalMessage, undefined);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "user_message",
      "model_request",
      "model_response",
      "tool_use_message",
      "tool_call",
      "tool_started",
      "tool_completed",
      "tool_result",
      "tool_result_message",
    ],
  );

  const toolResultEvent = events.find(
    (event): event is Extract<AgentEvent, { type: "tool_result" }> => {
      return event.type === "tool_result";
    },
  );
  assert.ok(toolResultEvent);
  assert.equal(toolResultEvent.result.status, "error");
  assert.equal(toolResultEvent.result.output, "User aborted this tool call.");

  const toolResultMessage = result.state.messages.at(-1);
  assert.ok(toolResultMessage);
  assert.equal(toolResultMessage.role, "user");
  assert.equal(toolResultMessage.content[0].type, "tool_result");
  assert.equal(String(toolResultMessage.content[0].content), "User aborted this tool call.");
  assert.equal(toolResultMessage.content[0].is_error, true);
  assert.equal(
    events.some((event) => event.type === "final_message"),
    false,
  );
  assert.equal(
    events.some((event) => event.type === "turn_complete"),
    false,
  );
});
