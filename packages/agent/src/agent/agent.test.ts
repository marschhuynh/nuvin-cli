import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import { getReasoningTextFromMessage, getTextFromMessage } from "../formats/message-format.ts";
import { AnthropicModel } from "../models/anthropic-model.ts";
import { MockModel } from "../models/mock-model.ts";
import type {
  AgentEvent,
  ChatRequest,
  ChatResponse,
  EngineChatModel,
  ToolResultBlock,
} from "../shared/types.ts";
import { defineTool } from "../tools/tools.ts";
import { Agent } from "./agent.ts";

function createSseResponse(events: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(new TextEncoder().encode(event));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
    },
  });
}

async function loadSseFixtureEvents(relativePath: string): Promise<string[]> {
  const fixture = await readFile(new URL(relativePath, import.meta.url), "utf8");

  return fixture
    .trim()
    .split(/\r?\n\r?\n/)
    .map((event) => `${event}\n\n`);
}

function createAnthropicTextFollowUpSseEvents(responseId: string, textDeltas: string[]): string[] {
  return [
    `event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: responseId,
        type: "message",
        role: "assistant",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      },
    })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "text",
        text: "",
      },
    })}\n\n`,
    ...textDeltas.map((text) => {
      return `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text,
        },
      })}\n\n`;
    }),
    `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: {
        stop_reason: "end_turn",
        stop_sequence: null,
      },
      usage: {
        input_tokens: 12,
        output_tokens: textDeltas.length,
      },
    })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({
      type: "message_stop",
    })}\n\n`,
  ];
}

function createAnthropicFollowUpSseEvents(): string[] {
  return createAnthropicTextFollowUpSseEvents("msg_follow_up_tests", ["Run ", "pnpm test."]);
}

test("Agent.send accepts a plain string input and returns the final turn result", async () => {
  const agent = new Agent({
    systemPrompt: "Be direct.",
    chatModel: new MockModel(),
  });

  const result = await agent.send("hello there");

  assert.ok(result.finalMessage);
  assert.equal(result.finalMessage.role, "assistant");
  assert.match(getTextFromMessage(result.finalMessage), /direct answer/i);
  assert.equal(agent.messages.length, 2);
  assert.equal(agent.messages[0].role, "user");
  assert.equal(agent.messages[1].role, "assistant");
});

test("Agent uses systemPrompt as the public system option", async () => {
  const chatModel = new MockModel();
  const agent = new Agent({
    systemPrompt: "Keep answers direct.",
    chatModel,
  });

  const result = await agent.send("hello there");

  assert.equal("trace" in result, false);
  assert.deepEqual(chatModel.requests[0].system, [
    {
      type: "text",
      text: "Keep answers direct.",
    },
  ]);
  assert.equal(agent.systemPrompt, "Keep answers direct.");
});

test("Agent uses reasoning configured on the chat model", async () => {
  const chatModel = new MockModel({
    reasoning: {
      visibility: "continuity-only",
      openai: {
        effort: "low",
      },
    },
  });
  const agent = new Agent({
    chatModel,
  });

  await agent.send("hello there");

  assert.equal(chatModel.requests.length, 1);
  assert.deepEqual(chatModel.requests[0].reasoning, {
    visibility: "continuity-only",
    openai: {
      effort: "low",
    },
  });
});

test("Agent.send can use the default constructor message when called with no argument", async () => {
  const agent = new Agent({
    message: "please list the files in the workspace",
    chatModel: new MockModel(),
    tools: [
      defineTool({
        name: "Bash",
        description: "Executes a shell command",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
        async *execute(input) {
          yield `command=${input.command}\n`;
          yield "src/agent.ts\n";
          yield "src/turn-engine.ts";
        },
      }),
    ],
  });

  const result = await agent.send();

  assert.match(getTextFromMessage(result.finalMessage), /src\/agent\.ts|mocked tool result/i);
  assert.equal(agent.messages[0].role, "user");
  assert.equal(result.state.toolResults[0].chunks.length, 3);
});

test("Agent preserves transcript state across multiple sends", async () => {
  const agent = new Agent({
    chatModel: new MockModel(),
    tools: [
      defineTool({
        name: "Bash",
        description: "Executes a shell command",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
        async *execute(input) {
          yield `command=${input.command}\n`;
          yield "src/agent.ts";
        },
      }),
    ],
  });

  await agent.send("hello there");
  await agent.send("please list the files in the workspace");

  assert.equal(agent.messages[0].role, "user");
  assert.equal(agent.messages[1].role, "assistant");
  assert.equal(agent.messages[2].role, "user");
  assert.equal(agent.messages[3].role, "assistant");
  assert.equal(agent.messages[4].role, "user");
  assert.equal(agent.messages[5].role, "assistant");
  assert.equal(agent.messages[1].id, "turn-1:assistant:1");
  assert.equal(agent.messages[3].id, "turn-2:assistant:1");
  assert.equal(agent.messages[5].id, "turn-2:assistant:2");
});

test("Agent builds the internal tool runtime from defineTool without exposing toolRuntime", async () => {
  const calls: string[] = [];

  const agent = new Agent({
    message: "please list the files in the workspace",
    chatModel: new MockModel(),
    tools: [
      defineTool({
        name: "Bash",
        description: "Executes a shell command",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
        async *execute(input) {
          calls.push(input.command);
          yield "src/agent.ts\n";
          yield "src/tools.ts";
        },
      }),
    ],
  });

  const result = await agent.send();

  assert.deepEqual(calls, ["ls -la"]);
  assert.match(getTextFromMessage(result.finalMessage), /src\/tools\.ts/);
  assert.deepEqual(
    result.state.toolResults[0].chunks.map((chunk) => chunk.output),
    ["src/agent.ts\n", "src/tools.ts"],
  );
});

test("Agent emits lifecycle events for a no-tool turn", async () => {
  const events: string[] = [];

  const agent = new Agent({
    chatModel: new MockModel(),
    onEvent(event) {
      events.push(event.type);
    },
  });

  await agent.send("hello there");

  assert.deepEqual(events, [
    "user_message",
    "model_request",
    "model_response",
    "assistant_message",
    "final_message",
    "turn_complete",
  ]);
});

test("Agent exposes reasoning_message events when the model returns reasoning blocks", async () => {
  const events: string[] = [];
  const messageIds: string[] = [];

  const chatModel: EngineChatModel = {
    model: "gpt-5.4",
    maxTokens: 1024,
    async complete(): Promise<ChatResponse> {
      return {
        id: "resp-1",
        content: [
          {
            type: "anthropic_thinking",
            thinking: "Inspect the request first.",
            signature: "sig-1",
          },
          {
            type: "text",
            text: "Done",
          },
        ],
        stopReason: "end_turn",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
        },
      };
    },
  };

  const agent = new Agent({
    chatModel,
    onEvent(event) {
      events.push(event.type);

      if (
        event.type === "reasoning_message" ||
        event.type === "assistant_message" ||
        event.type === "final_message"
      ) {
        messageIds.push(event.message.id);
      }
    },
  });

  await agent.send("hello there");

  assert.deepEqual(events, [
    "user_message",
    "model_request",
    "model_response",
    "reasoning_message",
    "assistant_message",
    "final_message",
    "turn_complete",
  ]);
  assert.deepEqual(messageIds, [
    "turn-1:assistant:1:reasoning",
    "turn-1:assistant:1",
    "turn-1:assistant:1",
  ]);
});

test("Agent keeps tool chunk consumers working while emitting broader events", async () => {
  const events: string[] = [];
  const chunkOutputs: string[] = [];

  const agent = new Agent({
    message: "please list the files in the workspace",
    chatModel: new MockModel(),
    onEvent(event) {
      events.push(event.type);

      if (event.type === "tool_output_chunk") {
        chunkOutputs.push(event.chunk.output);
      }
    },
    tools: [
      defineTool({
        name: "Bash",
        description: "Executes a shell command",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
        async *execute(input) {
          yield `command=${input.command}\n`;
          yield "src/agent.ts\n";
          yield "src/tools.ts";
        },
      }),
    ],
  });

  await agent.send();

  assert.deepEqual(chunkOutputs, ["command=ls -la\n", "src/agent.ts\n", "src/tools.ts"]);
  assert.deepEqual(events, [
    "user_message",
    "model_request",
    "model_response",
    "tool_use_message",
    "tool_call",
    "tool_started",
    "tool_output_chunk",
    "tool_output_chunk",
    "tool_output_chunk",
    "tool_completed",
    "tool_result",
    "tool_result_message",
    "model_request",
    "model_response",
    "assistant_message",
    "final_message",
    "turn_complete",
  ]);
});

test("Agent emits assistant and reasoning chunks when streaming is enabled", async () => {
  const events: string[] = [];
  const assistantChunks: string[] = [];
  const assistantChunkMessageIds: string[] = [];
  const reasoningChunkMessageIds: string[] = [];
  const reasoningChunks: string[] = [];

  const chatModel: EngineChatModel = {
    model: "gpt-5.4",
    maxTokens: 1024,
    async complete(): Promise<ChatResponse> {
      throw new Error("complete should not be called when streaming is enabled");
    },
    async *stream() {
      yield {
        type: "openai_reasoning_summary_delta",
        delta: "Inspect files first.",
        itemId: "rs_1",
        outputIndex: 0,
        summaryIndex: 0,
      };
      yield {
        type: "content_delta",
        text: "Hello",
      };
      yield {
        type: "content_delta",
        text: " world",
      };
      yield {
        type: "done",
        response: {
          id: "resp-stream-1",
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
              text: "Hello world",
            },
          ],
          stopReason: "end_turn",
          usage: {
            inputTokens: 2,
            outputTokens: 2,
          },
        },
      };
    },
  };

  const agent = new Agent({
    chatModel,
    onEvent(event) {
      events.push(event.type);

      if (event.type === "assistant_chunk" && event.chunk.text) {
        assistantChunks.push(event.chunk.text);
        assistantChunkMessageIds.push(event.messageId);
      }

      if (event.type === "reasoning_chunk") {
        reasoningChunks.push(event.text);
        reasoningChunkMessageIds.push(event.messageId);
      }
    },
  });

  await agent.send("hello there", {
    streaming: true,
  });

  assert.deepEqual(reasoningChunks, ["Inspect files first."]);
  assert.deepEqual(reasoningChunkMessageIds, ["turn-1:assistant:1:reasoning"]);
  assert.deepEqual(assistantChunks, ["Hello", " world"]);
  assert.deepEqual(assistantChunkMessageIds, ["turn-1:assistant:1", "turn-1:assistant:1"]);
  assert.deepEqual(events, [
    "user_message",
    "model_request",
    "reasoning_chunk",
    "assistant_chunk",
    "assistant_chunk",
    "model_response",
    "reasoning_message",
    "assistant_message",
    "final_message",
    "turn_complete",
  ]);
});

test("Agent emits the full event stream for an SSE fixture-backed Anthropic tool-use turn", async () => {
  const fixtureEvents = await loadSseFixtureEvents("./sse.txt");
  const followUpEvents = createAnthropicFollowUpSseEvents();
  const commands: string[] = [];
  const events: AgentEvent[] = [];
  let requestCount = 0;

  const chatModel = new AnthropicModel({
    apiKey: "sk-test",
    reasoning: {
      visibility: "user-visible",
      anthropic: {
        type: "enabled",
        budgetTokens: 2048,
      },
    },
    fetch: async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return createSseResponse(fixtureEvents);
      }

      if (requestCount === 2) {
        return createSseResponse(followUpEvents);
      }

      throw new Error(`Unexpected Anthropic request #${requestCount}`);
    },
  });

  const agent = new Agent({
    chatModel,
    tools: [
      defineTool({
        name: "Bash",
        description: "Executes a shell command",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
        async *execute(input) {
          commands.push(input.command);
          yield "package.json\n";
          yield "src\n";
        },
      }),
    ],
    onEvent(event) {
      events.push(structuredClone(event));
    },
  });

  const result = await agent.send("how do I run the tests?", {
    streaming: true,
  });

  assert.deepEqual(commands, ["ls -la"]);

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "user_message",
      "model_request",
      ...Array<string>(29).fill("reasoning_chunk"),
      ...Array<string>(16).fill("assistant_chunk"),
      "tool_use_chunk",
      "tool_use_chunk",
      "model_response",
      "reasoning_message",
      "assistant_message",
      "tool_use_message",
      "tool_call",
      "tool_started",
      "tool_output_chunk",
      "tool_output_chunk",
      "tool_completed",
      "tool_result",
      "tool_result_message",
      "model_request",
      "assistant_chunk",
      "assistant_chunk",
      "model_response",
      "assistant_message",
      "final_message",
      "turn_complete",
    ],
  );

  const modelRequestEvents = events.filter((event) => event.type === "model_request");
  assert.equal(modelRequestEvents.length, 2);
  assert.equal(modelRequestEvents[0].request.metadata.turnId, "turn-1");
  assert.equal(modelRequestEvents[1].request.messages.at(-1)?.role, "user");
  assert.equal(modelRequestEvents[1].request.messages.at(-1)?.content[0]?.type, "tool_result");

  const modelResponseEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "model_response" }> => {
      return event.type === "model_response";
    },
  );

  const reasoningMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "reasoning_message" }> => {
      return event.type === "reasoning_message";
    },
  );

  const assistantMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "assistant_message" }> => {
      return event.type === "assistant_message";
    },
  );

  const toolUseMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_use_message" }> => {
      return event.type === "tool_use_message";
    },
  );

  const toolCallEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_call" }> => {
      return event.type === "tool_call";
    },
  );

  const toolCompletedEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_completed" }> => {
      return event.type === "tool_completed";
    },
  );

  const toolResultEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_result" }> => {
      return event.type === "tool_result";
    },
  );

  const toolResultMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_result_message" }> => {
      return event.type === "tool_result_message";
    },
  );

  const finalMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "final_message" }> => {
      return event.type === "final_message";
    },
  );

  const turnCompleteEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "turn_complete" }> => {
      return event.type === "turn_complete";
    },
  );

  const reasoningChunkEvents = events.filter((event) => event.type === "reasoning_chunk");
  assert.equal(reasoningChunkEvents.length, 29);
  assert.ok(reasoningChunkEvents.every((event) => event.index === 0));
  assert.ok(
    reasoningChunkEvents.every((event) => event.messageId === "turn-1:assistant:1:reasoning"),
  );
  assert.equal(
    reasoningChunkEvents.map((event) => event.text).join(""),
    "The user wants to run tests. Let me first look at the project structure to understand what kind of project this is and how to run tests.",
  );

  const assistantChunkEvents = events.filter((event) => event.type === "assistant_chunk");
  assert.equal(assistantChunkEvents.length, 18);

  const firstAssistantChunks = assistantChunkEvents.filter(
    (event) => event.messageId === "turn-1:assistant:1",
  );
  assert.equal(firstAssistantChunks.length, 16);
  assert.ok(firstAssistantChunks.every((event) => event.index === 1));
  assert.equal(
    firstAssistantChunks
      .filter((event) => typeof event.chunk.text === "string")
      .map((event) => event.chunk.text ?? "")
      .join(""),
    "I'll start by exploring the project structure to understand how to run the tests.",
  );

  const secondAssistantChunks = assistantChunkEvents.filter(
    (event) => event.messageId === "turn-1:assistant:2",
  );
  assert.equal(secondAssistantChunks.length, 2);
  assert.ok(secondAssistantChunks.every((event) => event.index === 0));
  assert.equal(
    secondAssistantChunks.map((event) => event.chunk.text ?? "").join(""),
    "Run pnpm test.",
  );

  const toolUseChunkEvents = events.filter((event) => event.type === "tool_use_chunk");
  assert.equal(toolUseChunkEvents.length, 2);
  assert.deepEqual(
    toolUseChunkEvents.map((event) => ({
      index: event.index,
      messageId: event.messageId,
      chunk: event.chunk,
    })),
    [
      {
        index: 2,
        messageId: "turn-1:assistant:1",
        chunk: {
          type: "tool_use_delta",
          id: "call_238959ddd11a4d16923943b5",
          index: 2,
          name: "Bash",
        },
      },
      {
        index: 2,
        messageId: "turn-1:assistant:1",
        chunk: {
          type: "tool_use_delta",
          id: "call_238959ddd11a4d16923943b5",
          index: 2,
          inputDelta: '{"command":"ls -la"}',
        },
      },
    ],
  );

  const firstModelResponseEvent = modelResponseEvents.find((event) => {
    return event.response.id === "msg_2026041917321165c360b2df284a49";
  });
  assert.ok(firstModelResponseEvent);
  assert.equal(firstModelResponseEvent.response.stopReason, "tool_use");

  const reasoningMessageEvent = reasoningMessageEvents[0];
  assert.ok(reasoningMessageEvent);
  assert.equal(reasoningMessageEvent.message.id, "turn-1:assistant:1:reasoning");
  assert.equal(
    getReasoningTextFromMessage(reasoningMessageEvent.message),
    "The user wants to run tests. Let me first look at the project structure to understand what kind of project this is and how to run tests.",
  );

  assert.equal(assistantMessageEvents.length, 2);
  assert.equal(assistantMessageEvents[0].message.id, "turn-1:assistant:1");
  assert.equal(
    getTextFromMessage(assistantMessageEvents[0].message),
    "I'll start by exploring the project structure to understand how to run the tests.",
  );
  assert.equal(assistantMessageEvents[0].message.content.length, 1);
  assert.equal(assistantMessageEvents[0].message.content[0].type, "text");
  assert.equal(assistantMessageEvents[1].message.id, "turn-1:assistant:2");
  assert.equal(getTextFromMessage(assistantMessageEvents[1].message), "Run pnpm test.");

  assert.equal(toolUseMessageEvents.length, 1);
  assert.equal(toolUseMessageEvents[0].message.id, "turn-1:assistant:1");
  assert.deepEqual(toolUseMessageEvents[0].message.content, [
    {
      type: "tool_use",
      id: "call_238959ddd11a4d16923943b5",
      name: "Bash",
      input: {
        command: "ls -la",
      },
    },
  ]);

  const toolCallEvent = toolCallEvents[0];
  assert.ok(toolCallEvent);
  assert.equal(toolCallEvent.toolCall.id, "call_238959ddd11a4d16923943b5");
  assert.deepEqual(toolCallEvent.toolCall.input, {
    command: "ls -la",
  });

  const toolOutputChunkEvents = events.filter((event) => event.type === "tool_output_chunk");
  assert.deepEqual(
    toolOutputChunkEvents.map((event) => event.chunk.output),
    ["package.json\n", "src\n"],
  );

  const toolCompletedEvent = toolCompletedEvents[0];
  assert.ok(toolCompletedEvent);
  assert.equal(toolCompletedEvent.result.output, "package.json\nsrc\n");

  const toolResultEvent = toolResultEvents[0];
  assert.ok(toolResultEvent);
  assert.equal(toolResultEvent.result.output, "package.json\nsrc\n");

  const toolResultMessageEvent = toolResultMessageEvents[0];
  assert.ok(toolResultMessageEvent);
  assert.equal(toolResultMessageEvent.message.role, "user");
  assert.equal(toolResultMessageEvent.message.content[0].type, "tool_result");
  assert.equal(String(toolResultMessageEvent.message.content[0].content), "package.json\nsrc\n");

  const finalMessageEvent = finalMessageEvents[0];
  assert.ok(finalMessageEvent);
  assert.equal(finalMessageEvent.message.id, "turn-1:assistant:2");
  assert.equal(getTextFromMessage(finalMessageEvent.message), "Run pnpm test.");

  const turnCompleteEvent = turnCompleteEvents[0];
  assert.ok(turnCompleteEvent);
  assert.equal(turnCompleteEvent.state.finalMessage?.id, "turn-1:assistant:2");
  assert.equal(getTextFromMessage(result.finalMessage), "Run pnpm test.");
});

test("Agent emits the full event stream for an SSE fixture-backed Anthropic multi-tool turn", async () => {
  const fixtureEvents = await loadSseFixtureEvents("./sse.2.txt");
  const followUpEvents = createAnthropicTextFollowUpSseEvents("msg_follow_up_review", [
    "I found ",
    "the key project files.",
  ]);
  const findCommand =
    "find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/__pycache__/*' -not -path '*.pyc' | head -100";
  const events: AgentEvent[] = [];
  const commands: string[] = [];
  let requestCount = 0;

  const chatModel = new AnthropicModel({
    apiKey: "sk-test",
    reasoning: {
      visibility: "user-visible",
      anthropic: {
        type: "enabled",
        budgetTokens: 2048,
      },
    },
    fetch: async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return createSseResponse(fixtureEvents);
      }

      if (requestCount === 2) {
        return createSseResponse(followUpEvents);
      }

      throw new Error(`Unexpected Anthropic request #${requestCount}`);
    },
  });

  const agent = new Agent({
    chatModel,
    tools: [
      defineTool({
        name: "Bash",
        description: "Executes a shell command",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
        async *execute(input) {
          commands.push(input.command);

          if (input.command === findCommand) {
            yield "src/agent/agent.ts\n";
            yield "src/models/anthropic-model.ts\n";
            return;
          }

          yield "package.json\n";
          yield "src\n";
        },
      }),
    ],
    onEvent(event) {
      events.push(structuredClone(event));
    },
  });

  const result = await agent.send("review the codebase", {
    streaming: true,
  });

  assert.deepEqual(commands, [findCommand, "ls -la"]);

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "user_message",
      "model_request",
      ...Array<string>(25).fill("reasoning_chunk"),
      ...Array<string>(17).fill("assistant_chunk"),
      ...Array<string>(4).fill("tool_use_chunk"),
      "model_response",
      "reasoning_message",
      "assistant_message",
      "tool_use_message",
      "tool_call",
      "tool_call",
      "tool_started",
      "tool_started",
      ...Array<string>(4).fill("tool_output_chunk"),
      "tool_completed",
      "tool_completed",
      "tool_result",
      "tool_result",
      "tool_result_message",
      "model_request",
      "assistant_chunk",
      "assistant_chunk",
      "model_response",
      "assistant_message",
      "final_message",
      "turn_complete",
    ],
  );

  const modelRequestEvents = events.filter((event) => event.type === "model_request");
  assert.equal(modelRequestEvents.length, 2);
  assert.equal(modelRequestEvents[0].request.metadata.turnId, "turn-1");

  const secondModelRequestMessage = modelRequestEvents[1].request.messages.at(-1);
  assert.equal(secondModelRequestMessage?.role, "user");

  const secondRequestToolResultBlocks = secondModelRequestMessage?.content.filter(
    (block): block is ToolResultBlock => {
      return block.type === "tool_result";
    },
  );
  assert.ok(secondRequestToolResultBlocks);
  assert.deepEqual(secondRequestToolResultBlocks, [
    {
      type: "tool_result",
      tool_use_id: "call_c33f799f26f748efb0957ac4",
      content: "src/agent/agent.ts\nsrc/models/anthropic-model.ts\n",
      is_error: false,
    },
    {
      type: "tool_result",
      tool_use_id: "call_41a163ec6c3d428ab1dafe80",
      content: "package.json\nsrc\n",
      is_error: false,
    },
  ]);

  const modelResponseEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "model_response" }> => {
      return event.type === "model_response";
    },
  );

  const reasoningMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "reasoning_message" }> => {
      return event.type === "reasoning_message";
    },
  );

  const assistantMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "assistant_message" }> => {
      return event.type === "assistant_message";
    },
  );

  const toolUseMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_use_message" }> => {
      return event.type === "tool_use_message";
    },
  );

  const toolCallEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_call" }> => {
      return event.type === "tool_call";
    },
  );

  const toolCompletedEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_completed" }> => {
      return event.type === "tool_completed";
    },
  );

  const toolResultEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_result" }> => {
      return event.type === "tool_result";
    },
  );

  const toolResultMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "tool_result_message" }> => {
      return event.type === "tool_result_message";
    },
  );

  const finalMessageEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "final_message" }> => {
      return event.type === "final_message";
    },
  );

  const turnCompleteEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "turn_complete" }> => {
      return event.type === "turn_complete";
    },
  );

  const reasoningChunkEvents = events.filter((event) => event.type === "reasoning_chunk");
  assert.equal(reasoningChunkEvents.length, 25);
  assert.ok(reasoningChunkEvents.every((event) => event.index === 0));
  assert.ok(
    reasoningChunkEvents.every((event) => event.messageId === "turn-1:assistant:1:reasoning"),
  );
  assert.equal(
    reasoningChunkEvents.map((event) => event.text).join(""),
    "The user wants me to review a codebase. Let me first explore the directory structure to understand what we're working with.",
  );

  const assistantChunkEvents = events.filter((event) => event.type === "assistant_chunk");
  assert.equal(assistantChunkEvents.length, 19);

  const firstAssistantChunks = assistantChunkEvents.filter(
    (event) => event.messageId === "turn-1:assistant:1",
  );
  assert.equal(firstAssistantChunks.length, 17);
  assert.ok(firstAssistantChunks.every((event) => event.index === 1));
  assert.equal(
    firstAssistantChunks
      .filter((event) => typeof event.chunk.text === "string")
      .map((event) => event.chunk.text ?? "")
      .join(""),
    "I'll start by exploring the codebase structure to understand what we're working with.",
  );

  const secondAssistantChunks = assistantChunkEvents.filter(
    (event) => event.messageId === "turn-1:assistant:2",
  );
  assert.equal(secondAssistantChunks.length, 2);
  assert.ok(secondAssistantChunks.every((event) => event.index === 0));
  assert.equal(
    secondAssistantChunks.map((event) => event.chunk.text ?? "").join(""),
    "I found the key project files.",
  );

  const toolUseChunkEvents = events.filter((event) => event.type === "tool_use_chunk");
  assert.equal(toolUseChunkEvents.length, 4);
  assert.deepEqual(
    toolUseChunkEvents.map((event) => ({
      index: event.index,
      messageId: event.messageId,
      chunk: event.chunk,
    })),
    [
      {
        index: 2,
        messageId: "turn-1:assistant:1",
        chunk: {
          type: "tool_use_delta",
          id: "call_c33f799f26f748efb0957ac4",
          index: 2,
          name: "Bash",
        },
      },
      {
        index: 2,
        messageId: "turn-1:assistant:1",
        chunk: {
          type: "tool_use_delta",
          id: "call_c33f799f26f748efb0957ac4",
          index: 2,
          inputDelta:
            "{\"command\":\"find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/__pycache__/*' -not -path '*.pyc' | head -100\"}",
        },
      },
      {
        index: 3,
        messageId: "turn-1:assistant:1",
        chunk: {
          type: "tool_use_delta",
          id: "call_41a163ec6c3d428ab1dafe80",
          index: 3,
          name: "Bash",
        },
      },
      {
        index: 3,
        messageId: "turn-1:assistant:1",
        chunk: {
          type: "tool_use_delta",
          id: "call_41a163ec6c3d428ab1dafe80",
          index: 3,
          inputDelta: '{"command":"ls -la"}',
        },
      },
    ],
  );

  const firstModelResponseEvent = modelResponseEvents.find((event) => {
    return event.response.id === "msg_20260419184758398b3c7e1eb54808";
  });
  assert.ok(firstModelResponseEvent);
  assert.equal(firstModelResponseEvent.response.stopReason, "tool_use");

  const reasoningMessageEvent = reasoningMessageEvents[0];
  assert.ok(reasoningMessageEvent);
  assert.equal(reasoningMessageEvent.message.id, "turn-1:assistant:1:reasoning");
  assert.equal(
    getReasoningTextFromMessage(reasoningMessageEvent.message),
    "The user wants me to review a codebase. Let me first explore the directory structure to understand what we're working with.",
  );

  assert.equal(assistantMessageEvents.length, 2);
  assert.equal(assistantMessageEvents[0].message.id, "turn-1:assistant:1");
  assert.equal(
    getTextFromMessage(assistantMessageEvents[0].message),
    "I'll start by exploring the codebase structure to understand what we're working with.",
  );
  assert.equal(assistantMessageEvents[0].message.content.length, 1);
  assert.equal(assistantMessageEvents[0].message.content[0].type, "text");

  assert.equal(toolUseMessageEvents.length, 1);
  assert.equal(toolUseMessageEvents[0].message.id, "turn-1:assistant:1");
  assert.deepEqual(toolUseMessageEvents[0].message.content, [
    {
      type: "tool_use",
      id: "call_c33f799f26f748efb0957ac4",
      name: "Bash",
      input: {
        command: findCommand,
      },
    },
    {
      type: "tool_use",
      id: "call_41a163ec6c3d428ab1dafe80",
      name: "Bash",
      input: {
        command: "ls -la",
      },
    },
  ]);
  assert.equal(assistantMessageEvents[1].message.id, "turn-1:assistant:2");
  assert.equal(
    getTextFromMessage(assistantMessageEvents[1].message),
    "I found the key project files.",
  );

  assert.deepEqual(
    toolCallEvents.map((event) => event.toolCall),
    [
      {
        type: "tool_use",
        id: "call_c33f799f26f748efb0957ac4",
        name: "Bash",
        input: {
          command: findCommand,
        },
      },
      {
        type: "tool_use",
        id: "call_41a163ec6c3d428ab1dafe80",
        name: "Bash",
        input: {
          command: "ls -la",
        },
      },
    ],
  );

  const toolOutputChunkEvents = events.filter((event) => event.type === "tool_output_chunk");
  assert.equal(toolOutputChunkEvents.length, 4);
  assert.deepEqual(
    toolOutputChunkEvents
      .filter((event) => event.toolCall.id === "call_c33f799f26f748efb0957ac4")
      .map((event) => event.chunk.output),
    ["src/agent/agent.ts\n", "src/models/anthropic-model.ts\n"],
  );
  assert.deepEqual(
    toolOutputChunkEvents
      .filter((event) => event.toolCall.id === "call_41a163ec6c3d428ab1dafe80")
      .map((event) => event.chunk.output),
    ["package.json\n", "src\n"],
  );

  assert.equal(toolCompletedEvents.length, 2);
  assert.deepEqual(
    toolCompletedEvents.map((event) => ({
      toolCallId: event.toolCall.id,
      output: event.result.output,
    })),
    [
      {
        toolCallId: "call_c33f799f26f748efb0957ac4",
        output: "src/agent/agent.ts\nsrc/models/anthropic-model.ts\n",
      },
      {
        toolCallId: "call_41a163ec6c3d428ab1dafe80",
        output: "package.json\nsrc\n",
      },
    ],
  );

  assert.deepEqual(
    toolResultEvents.map((event) => ({
      callId: event.result.callId,
      output: event.result.output,
    })),
    [
      {
        callId: "call_c33f799f26f748efb0957ac4",
        output: "src/agent/agent.ts\nsrc/models/anthropic-model.ts\n",
      },
      {
        callId: "call_41a163ec6c3d428ab1dafe80",
        output: "package.json\nsrc\n",
      },
    ],
  );

  const toolResultMessageEvent = toolResultMessageEvents[0];
  assert.ok(toolResultMessageEvent);
  assert.equal(toolResultMessageEvent.message.role, "user");

  const toolResultBlocks = toolResultMessageEvent.message.content.filter(
    (block): block is ToolResultBlock => {
      return block.type === "tool_result";
    },
  );
  assert.deepEqual(toolResultBlocks, [
    {
      type: "tool_result",
      tool_use_id: "call_c33f799f26f748efb0957ac4",
      content: "src/agent/agent.ts\nsrc/models/anthropic-model.ts\n",
      is_error: false,
    },
    {
      type: "tool_result",
      tool_use_id: "call_41a163ec6c3d428ab1dafe80",
      content: "package.json\nsrc\n",
      is_error: false,
    },
  ]);

  const finalMessageEvent = finalMessageEvents[0];
  assert.ok(finalMessageEvent);
  assert.equal(finalMessageEvent.message.id, "turn-1:assistant:2");
  assert.equal(getTextFromMessage(finalMessageEvent.message), "I found the key project files.");

  const turnCompleteEvent = turnCompleteEvents[0];
  assert.ok(turnCompleteEvent);
  assert.equal(turnCompleteEvent.state.finalMessage?.id, "turn-1:assistant:2");
  assert.deepEqual(
    turnCompleteEvent.state.toolResults.map((toolResult) => toolResult.callId),
    ["call_c33f799f26f748efb0957ac4", "call_41a163ec6c3d428ab1dafe80"],
  );
  assert.equal(getTextFromMessage(result.finalMessage), "I found the key project files.");
});

test("Agent passes tool approval through onToolCall", async () => {
  const toolCalls: string[] = [];

  const agent = new Agent({
    message: "please list the files in the workspace",
    chatModel: new MockModel(),
    onToolCall(toolCall) {
      toolCalls.push(toolCall.name);

      return {
        action: "run",
      };
    },
    tools: [
      defineTool({
        name: "Bash",
        description: "Executes a shell command",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
        async *execute(input) {
          yield `command=${input.command}\n`;
          yield "src/agent.ts\n";
          yield "src/tools.ts";
        },
      }),
    ],
  });

  await agent.send();

  assert.deepEqual(toolCalls, ["Bash"]);
});

test("Agent uses the model metadata carried by the chatModel itself", async () => {
  const requests: ChatRequest[] = [];
  const chatModel: EngineChatModel = {
    model: "claude-engine-test",
    maxTokens: 222,
    async complete(request): Promise<ChatResponse> {
      requests.push(structuredClone(request));

      return {
        id: "msg-1",
        content: [
          {
            type: "text",
            text: "ok",
          },
        ],
        stopReason: "end_turn",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
        },
      };
    },
  };

  const agent = new Agent({
    systemPrompt: "Keep answers direct.",
    chatModel,
  });

  await agent.send("hello there");

  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, "claude-engine-test");
  assert.equal(requests[0].maxTokens, 222);
  assert.equal(requests[0].metadata.turnId, "turn-1");
});

test("Agent.send preserves the submitted user message when the turn is aborted", async () => {
  const controller = new AbortController();
  const chatModel: EngineChatModel = {
    model: "abort-aware-model",
    maxTokens: 1024,
    async complete(_request, options?: { signal?: AbortSignal }): Promise<ChatResponse> {
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

  const agent = new Agent({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "existing transcript",
          },
        ],
      },
    ],
    chatModel,
  });
  const pending = agent.send("abort this turn", {
    signal: controller.signal,
  });

  controller.abort(new Error("agent abort"));

  const result = await pending;
  assert.equal(result.status, "aborted");
  assert.equal(agent.messages.length, 2);
  assert.equal(agent.messages[0].content[0].type, "text");
  assert.equal(agent.messages[1].role, "user");
  assert.equal(agent.messages[1].content[0].type, "text");
  assert.equal(agent.messages[1].content[0].text, "abort this turn");
});

test("Agent.send keeps an aborted tool result in the transcript and resolves an aborted turn", async () => {
  const controller = new AbortController();
  const events: AgentEvent[] = [];
  const chatModel: EngineChatModel = {
    model: "tool-abort-model",
    maxTokens: 1024,
    async complete(request: ChatRequest): Promise<ChatResponse> {
      const lastMessage = request.messages.at(-1);
      const lastBlock = lastMessage?.content[0];

      if (lastBlock?.type === "tool_result") {
        throw new Error("Agent should stop after the aborted tool result is recorded");
      }

      return {
        id: "tool-abort-response",
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
          inputTokens: 2,
          outputTokens: 1,
        },
      };
    },
  };

  const agent = new Agent({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "existing transcript",
          },
        ],
      },
    ],
    chatModel,
    tools: [
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
    onEvent(event) {
      events.push(structuredClone(event));

      if (event.type === "tool_started") {
        controller.abort(new Error("User aborted this tool call."));
      }
    },
  });

  const result = await agent.send("abort only the tool", {
    signal: controller.signal,
  });

  assert.equal(result.status, "aborted");
  assert.equal(result.finalMessage, undefined);
  assert.equal(agent.messages.length, 4);
  assert.equal(agent.messages[0].content[0].type, "text");
  assert.equal(agent.messages[1].role, "user");
  assert.equal(agent.messages[2].role, "assistant");
  assert.equal(agent.messages[2].content[0].type, "tool_use");
  assert.equal(agent.messages[3].role, "user");
  assert.equal(agent.messages[3].content[0].type, "tool_result");
  assert.equal(String(agent.messages[3].content[0].content), "User aborted this tool call.");
  assert.equal(agent.messages[3].content[0].is_error, true);
  assert.equal(
    events.some((event) => event.type === "final_message"),
    false,
  );
  assert.equal(
    events.some((event) => event.type === "turn_complete"),
    false,
  );
});
