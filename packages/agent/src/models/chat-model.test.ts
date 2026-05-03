import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatRequest } from "../shared/types.ts";
import { AVAILABLE_CHAT_MODEL_SURFACES, ChatModel } from "./chat-model.ts";

function makeChatRequest(model = "test-model", overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model,
    maxTokens: 1024,
    system: [{ type: "text", text: "Be direct." }],
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    tools: [],
    metadata: {
      sessionId: "session-1",
      turnId: "turn-1",
    },
    ...overrides,
  };
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

test("AVAILABLE_CHAT_MODEL_SURFACES exposes the public surface ids", () => {
  assert.deepEqual(AVAILABLE_CHAT_MODEL_SURFACES, [
    "anthropic-messages",
    "openai-chat-completions",
    "openai-responses",
    "openai-responses-ws",
  ]);
});

test("ChatModel routes OpenAI chat-completions surfaces through the OpenAI wire format", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;

  const model = new ChatModel({
    apiKey: "openai-key",
    baseUrl: "https://api.openai.example/v1",
    model: "gpt-4o",
    surface: "openai-chat-completions",
    fetch: async (input, init) => {
      requestUrl = String(input);
      requestHeaders = init?.headers as Headers;
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "chatcmpl_1",
        choices: [
          {
            message: {
              role: "assistant",
              content: "ok",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 3,
          completion_tokens: 2,
        },
      });
    },
  });

  const response = await model.complete(makeChatRequest("gpt-4o"));

  assert.equal(requestUrl, "https://api.openai.example/v1/chat/completions");
  assert.equal(requestHeaders?.get("authorization"), "Bearer openai-key");
  assert.deepEqual(requestBody, {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Be direct.",
      },
      {
        role: "user",
        content: "hello",
      },
    ],
    max_tokens: 1024,
    stream: false,
  });
  assert.deepEqual(response.content, [{ type: "text", text: "ok" }]);
});

test("ChatModel forwards reasoning-aware Responses requests through the public surface", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> | undefined;

  const model = new ChatModel({
    apiKey: "openai-key",
    baseUrl: "https://api.openai.example/v1",
    model: "gpt-5.4",
    surface: "openai-responses",
    fetch: async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "resp_chat_model_1",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "ok" }],
          },
        ],
        usage: {
          input_tokens: 4,
          output_tokens: 2,
        },
      });
    },
  });

  await model.complete(
    makeChatRequest("gpt-5.4", {
      reasoning: {
        visibility: "user-visible",
        openai: {
          effort: "low",
        },
      },
    }),
  );

  assert.equal(requestUrl, "https://api.openai.example/v1/responses");
  assert.deepEqual(requestBody, {
    model: "gpt-5.4",
    instructions: "Be direct.",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hello" }],
      },
    ],
    include: ["reasoning.encrypted_content"],
    max_output_tokens: 1024,
    reasoning: {
      effort: "low",
      summary: "auto",
    },
    tools: [],
    store: false,
  });
});

test("ChatModel applies default reasoning configured on the model", async () => {
  let requestBody: Record<string, unknown> | undefined;

  const model = new ChatModel({
    apiKey: "anthropic-key",
    baseUrl: "https://api.anthropic.example",
    model: "claude-test",
    reasoning: {
      auto: {
        effort: "medium",
      },
      visibility: "continuity-only",
    },
    surface: "anthropic-messages",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "msg_default_reasoning_1",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 4,
          output_tokens: 2,
        },
      });
    },
  });

  await model.complete(makeChatRequest("claude-test"));

  assert.deepEqual(requestBody?.thinking, {
    type: "enabled",
    budget_tokens: 2048,
    display: "omitted",
  });
});

test("ChatModel routes Anthropic surfaces with x-api-key auth by default", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;

  const model = new ChatModel({
    apiKey: "anthropic-key",
    baseUrl: "https://api.anthropic.example",
    model: "claude-test",
    surface: "anthropic-messages",
    fetch: async (input, init) => {
      requestUrl = String(input);
      requestHeaders = init?.headers as Headers;

      return createJsonResponse({
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 5,
          output_tokens: 3,
        },
      });
    },
  });

  const response = await model.complete(makeChatRequest("claude-test"));

  assert.equal(requestUrl, "https://api.anthropic.example/v1/messages");
  assert.equal(requestHeaders?.get("x-api-key"), "anthropic-key");
  assert.equal(requestHeaders?.get("authorization"), null);
  assert.deepEqual(response.content, [{ type: "text", text: "ok" }]);
});

test("ChatModel supports Bearer auth for anthropic-compatible consumers such as Z.ai", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;

  const model = new ChatModel({
    apiKey: "zai-key",
    authScheme: "bearer",
    baseUrl: "https://api.z.ai/api/anthropic",
    model: "glm-4.7",
    surface: "anthropic-messages",
    fetch: async (input, init) => {
      requestUrl = String(input);
      requestHeaders = init?.headers as Headers;

      return createJsonResponse({
        id: "msg_2",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 4,
          output_tokens: 2,
        },
      });
    },
  });

  await model.complete(makeChatRequest("glm-4.7"));

  assert.equal(requestUrl, "https://api.z.ai/api/anthropic/v1/messages");
  assert.equal(requestHeaders?.get("authorization"), "Bearer zai-key");
  assert.equal(requestHeaders?.get("x-api-key"), null);
});
