import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import type { ChatRequest, ChatResponseChunk } from "../shared/types.ts";
import { AnthropicModel } from "./anthropic-model.ts";
import type { ResolvedProviderSession } from "./provider-session.ts";

function makeChatRequest(): ChatRequest {
  return {
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    system: [{ type: "text", text: "Be direct." }],
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    tools: [],
    metadata: {
      sessionId: "session-1",
      turnId: "turn-1",
    },
  };
}

function createWireResponse(): string {
  return JSON.stringify({
    id: "msg-1",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

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

test("AnthropicModel sends Anthropic wire format with x-api-key auth", async () => {
  const model = new AnthropicModel({
    apiKey: "sk-test",
    fetch: async (_input, init) => {
      const headers = init?.headers as Headers;
      const body = JSON.parse(String(init?.body));

      assert.equal(headers.get("authorization"), null);
      assert.equal(headers.get("x-api-key"), "sk-test");
      assert.equal(body.max_tokens, 1024);
      assert.equal("metadata" in body, false);

      return new Response(createWireResponse(), { status: 200 });
    },
  });

  const response = await model.complete(makeChatRequest());

  assert.equal(response.stopReason, "end_turn");
  assert.equal(response.usage.inputTokens, 1);
});

test("AnthropicModel prefers resolved provider sessions for endpoints and credentials", async () => {
  const session: ResolvedProviderSession = {
    credential: { kind: "session-token", value: "session-token-1" },
    endpoints: { api: "https://dynamic.example/anthropic" },
  };
  let fetchUrl = "";
  let authHeader = "";

  const model = new AnthropicModel({
    apiKey: "sk-test",
    providerSessionResolver: {
      resolve: async () => session,
    },
    fetch: async (input, init) => {
      fetchUrl = String(input);
      authHeader = String((init?.headers as Headers).get("x-api-key"));

      return new Response(createWireResponse(), { status: 200 });
    },
  });

  await model.complete(makeChatRequest());

  assert.equal(fetchUrl, "https://dynamic.example/anthropic/v1/messages");
  assert.equal(authHeader, "session-token-1");
});

test("AnthropicModel invalidates the cached provider session and retries once on 401", async () => {
  const resolverCalls: string[] = [];
  const authHeaders: string[] = [];

  const model = new AnthropicModel({
    providerSessionResolver: {
      resolve: async () => {
        const token = resolverCalls.length === 0 ? "session-token-1" : "session-token-2";
        resolverCalls.push(token);

        return {
          credential: { kind: "session-token", value: token },
          endpoints: { api: "https://dynamic.example/anthropic" },
        };
      },
    },
    fetch: async (_input, init) => {
      const authHeader = String((init?.headers as Headers).get("x-api-key"));
      authHeaders.push(authHeader);

      if (authHeader === "session-token-1") {
        return new Response("unauthorized", { status: 401 });
      }

      return new Response(createWireResponse(), { status: 200 });
    },
  });

  const response = await model.complete(makeChatRequest());

  assert.equal(response.id, "msg-1");
  assert.deepEqual(resolverCalls, ["session-token-1", "session-token-2"]);
  assert.deepEqual(authHeaders, ["session-token-1", "session-token-2"]);
});

test("AnthropicModel streams Messages SSE events into ChatResponseChunk values", async () => {
  let requestHeaders: Headers | undefined;

  const model = new AnthropicModel({
    apiKey: "sk-test",
    fetch: async (_input, init) => {
      requestHeaders = init?.headers as Headers;

      return createSseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream","type":"message","role":"assistant","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":3,"output_tokens":1}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        "data: [DONE]\n\n",
      ]);
    },
  });

  const chunks: ChatResponseChunk[] = [];
  // biome-ignore lint/style/noNonNullAssertion: stream is always present on model under test
  for await (const chunk of model.stream!(makeChatRequest())) {
    chunks.push(chunk);
  }

  assert.equal(requestHeaders?.get("accept"), "text/event-stream");
  assert.equal(requestHeaders?.get("x-api-key"), "sk-test");
  assert.deepEqual(chunks, [
    {
      type: "content_delta",
      index: 0,
      text: "Hello",
    },
    {
      type: "content_delta",
      index: 0,
      text: "!",
    },
    {
      type: "done",
      response: {
        id: "msg_stream",
        content: [{ type: "text", text: "Hello!" }],
        stopReason: "end_turn",
        usage: {
          inputTokens: 3,
          outputTokens: 2,
        },
      },
    },
  ]);
});

test("AnthropicModel sends visible thinking config and surfaces Anthropic thinking blocks", async () => {
  let requestBody: Record<string, unknown> | undefined;

  const model = new AnthropicModel({
    apiKey: "sk-test",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          id: "msg_thinking_1",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "Inspect the request first.",
              signature: "sig-visible-1",
            },
            {
              type: "text",
              text: "Use the search tool.",
            },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: 5,
            output_tokens: 3,
          },
        }),
        { status: 200 },
      );
    },
  });

  const response = await model.complete({
    ...makeChatRequest(),
    reasoning: {
      visibility: "user-visible",
      anthropic: {
        type: "enabled",
        budgetTokens: 2048,
      },
    },
  });

  assert.deepEqual(requestBody?.thinking, {
    type: "enabled",
    budget_tokens: 2048,
    display: "summarized",
  });
  assert.deepEqual(response.content, [
    {
      type: "anthropic_thinking",
      thinking: "Inspect the request first.",
      signature: "sig-visible-1",
    },
    {
      type: "text",
      text: "Use the search tool.",
    },
  ]);
  assert.deepEqual(response.providerState, {
    anthropicAssistantContent: [
      {
        type: "thinking",
        thinking: "Inspect the request first.",
        signature: "sig-visible-1",
      },
      {
        type: "text",
        text: "Use the search tool.",
      },
    ],
  });
});

test("AnthropicModel can keep thinking continuity without surfacing thinking blocks", async () => {
  let requestBody: Record<string, unknown> | undefined;

  const model = new AnthropicModel({
    apiKey: "sk-test",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          id: "msg_thinking_hidden_1",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "",
              signature: "sig-hidden-1",
            },
            {
              type: "text",
              text: "Done",
            },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: 4,
            output_tokens: 2,
          },
        }),
        { status: 200 },
      );
    },
  });

  const response = await model.complete({
    ...makeChatRequest(),
    reasoning: {
      visibility: "continuity-only",
      anthropic: {
        type: "adaptive",
        effort: "medium",
      },
    },
  });

  assert.deepEqual(requestBody?.thinking, {
    type: "adaptive",
    effort: "medium",
    display: "omitted",
  });
  assert.deepEqual(response.content, [
    {
      type: "text",
      text: "Done",
    },
  ]);
  assert.deepEqual(response.providerState, {
    anthropicAssistantContent: [
      {
        type: "thinking",
        thinking: "",
        signature: "sig-hidden-1",
      },
      {
        type: "text",
        text: "Done",
      },
    ],
  });
});

test("AnthropicModel resolves auto reasoning effort into enabled thinking budgets", async () => {
  let requestBody: Record<string, unknown> | undefined;

  const model = new AnthropicModel({
    apiKey: "sk-test",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          id: "msg_thinking_auto_1",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Done",
            },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: 4,
            output_tokens: 2,
          },
        }),
        { status: 200 },
      );
    },
  });

  await model.complete({
    ...makeChatRequest(),
    reasoning: {
      visibility: "continuity-only",
      auto: {
        effort: "medium",
      },
    },
  });

  assert.deepEqual(requestBody?.thinking, {
    type: "enabled",
    budget_tokens: 2048,
    display: "omitted",
  });
});

test("AnthropicModel streams thinking deltas and signatures when thinking is visible", async () => {
  const model = new AnthropicModel({
    apiKey: "sk-test",
    fetch: async () => {
      return createSseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream_thinking","type":"message","role":"assistant","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":3,"output_tokens":1}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Inspect first."}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-stream-1"}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Done"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]);
    },
  });

  const chunks: ChatResponseChunk[] = [];
  // biome-ignore lint/style/noNonNullAssertion: stream is always present on model under test
  for await (const chunk of model.stream!({
    ...makeChatRequest(),
    reasoning: {
      visibility: "user-visible",
      anthropic: {
        type: "enabled",
        budgetTokens: 2048,
      },
    },
  })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, [
    {
      type: "anthropic_thinking_delta",
      index: 0,
      thinking: "Inspect first.",
    },
    {
      type: "anthropic_signature_delta",
      index: 0,
      signature: "sig-stream-1",
    },
    {
      type: "content_delta",
      index: 1,
      text: "Done",
    },
    {
      type: "done",
      response: {
        id: "msg_stream_thinking",
        content: [
          {
            type: "anthropic_thinking",
            thinking: "Inspect first.",
            signature: "sig-stream-1",
          },
          {
            type: "text",
            text: "Done",
          },
        ],
        providerState: {
          anthropicAssistantContent: [
            {
              type: "thinking",
              thinking: "Inspect first.",
              signature: "sig-stream-1",
            },
            {
              type: "text",
              text: "Done",
            },
          ],
        },
        stopReason: "end_turn",
        usage: {
          inputTokens: 3,
          outputTokens: 2,
        },
      },
    },
  ]);
});

test("AnthropicModel streams mixed thinking, text, and tool-use deltas from the SSE fixture", async () => {
  const fixtureEvents = await loadSseFixtureEvents("../agent/sse.txt");

  const model = new AnthropicModel({
    apiKey: "sk-test",
    fetch: async () => {
      return createSseResponse(fixtureEvents);
    },
  });

  const chunks: ChatResponseChunk[] = [];
  // biome-ignore lint/style/noNonNullAssertion: stream is always present on model under test
  for await (const chunk of model.stream!({
    ...makeChatRequest(),
    reasoning: {
      visibility: "user-visible",
      anthropic: {
        type: "enabled",
        budgetTokens: 2048,
      },
    },
  })) {
    chunks.push(chunk);
  }

  const thinkingChunks = chunks.filter((chunk) => chunk.type === "anthropic_thinking_delta");
  assert.equal(
    thinkingChunks.map((chunk) => chunk.thinking ?? "").join(""),
    "The user wants to run tests. Let me first look at the project structure to understand what kind of project this is and how to run tests.",
  );

  const textChunks = chunks.filter((chunk) => {
    return chunk.type === "content_delta" && typeof chunk.text === "string";
  });
  assert.equal(
    textChunks.map((chunk) => chunk.text ?? "").join(""),
    "I'll start by exploring the project structure to understand how to run the tests.",
  );

  const toolUseChunks = chunks.filter((chunk) => {
    return chunk.type === "tool_use_delta";
  });
  assert.deepEqual(toolUseChunks, [
    {
      type: "tool_use_delta",
      id: "call_238959ddd11a4d16923943b5",
      index: 2,
      name: "Bash",
    },
    {
      type: "tool_use_delta",
      id: "call_238959ddd11a4d16923943b5",
      index: 2,
      inputDelta: '{"command":"ls -la"}',
    },
  ]);

  const doneChunk = chunks.at(-1);
  assert.deepEqual(doneChunk, {
    type: "done",
    response: {
      id: "msg_2026041917321165c360b2df284a49",
      content: [
        {
          type: "anthropic_thinking",
          thinking:
            "The user wants to run tests. Let me first look at the project structure to understand what kind of project this is and how to run tests.",
          signature: "672b70ca437f43c9b72d71c5",
        },
        {
          type: "text",
          text: "I'll start by exploring the project structure to understand how to run the tests.",
        },
        {
          type: "tool_use",
          id: "call_238959ddd11a4d16923943b5",
          name: "Bash",
          input: {
            command: "ls -la",
          },
        },
      ],
      providerState: {
        anthropicAssistantContent: [
          {
            type: "thinking",
            thinking:
              "The user wants to run tests. Let me first look at the project structure to understand what kind of project this is and how to run tests.",
            signature: "672b70ca437f43c9b72d71c5",
          },
          {
            type: "text",
            text: "I'll start by exploring the project structure to understand how to run the tests.",
          },
          {
            type: "tool_use",
            id: "call_238959ddd11a4d16923943b5",
            name: "Bash",
            input: {
              command: "ls -la",
            },
          },
        ],
      },
      stopReason: "tool_use",
      usage: {
        inputTokens: 0,
        outputTokens: 60,
      },
    },
  });
});
