import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatRequest, ChatResponseChunk } from "../shared/types.ts";
import { GitHubModel } from "./github-model.ts";
import { OpenAiModel } from "./openai-model.ts";

function makeChatRequest(model = "gpt-4o", overrides: Partial<ChatRequest> = {}): ChatRequest {
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

function makeToolResultFollowUpRequest(
  model = "gpt-4o",
  overrides: Partial<ChatRequest> = {},
): ChatRequest {
  return makeChatRequest(model, {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "List files" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "Bash",
            input: { command: "ls -la" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: "file-a\nfile-b",
            is_error: false,
          },
        ],
      },
    ],
    tools: [
      {
        name: "Bash",
        description: "Executes a shell command",
        input_schema: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
      },
    ],
    ...overrides,
  });
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
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

test("GitHubModel sends chat completions requests with Copilot headers", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
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
          prompt_tokens: 2,
          completion_tokens: 1,
        },
      });
    },
  });

  const response = await model.complete(makeChatRequest());

  assert.equal(requestUrl, "https://api.individual.githubcopilot.com/chat/completions");
  assert.equal(requestHeaders?.get("authorization"), "Bearer ghu_api_key");
  assert.equal(requestHeaders?.get("editor-version"), "vscode/1.104.2");
  assert.equal(requestHeaders?.get("editor-plugin-version"), "copilot-chat/0.31.3");
  assert.equal(requestHeaders?.get("x-initiator"), "user");
  assert.ok(requestHeaders?.get("x-request-id"));
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
  assert.equal(response.stopReason, "end_turn");
  assert.deepEqual(response.content, [{ type: "text", text: "ok" }]);
  assert.deepEqual(response.usage, {
    inputTokens: 2,
    outputTokens: 1,
  });
});

test("GitHubModel marks anthropic tool-result follow-up requests as agent initiated", async () => {
  let requestHeaders: Headers | undefined;

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    model: "claude-sonnet-4.6",
    surface: "anthropic-messages",
    fetch: async (_input, init) => {
      requestHeaders = init?.headers as Headers;

      return createJsonResponse({
        id: "msg_followup_1",
        type: "message",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "done",
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 5,
          output_tokens: 2,
        },
      });
    },
  });

  await model.complete(makeToolResultFollowUpRequest("claude-sonnet-4.6"));

  assert.equal(requestHeaders?.get("x-initiator"), "agent");
});

test("GitHubModel marks responses tool-result follow-up requests as agent initiated", async () => {
  let requestHeaders: Headers | undefined;

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    surface: "openai-responses",
    fetch: async (_input, init) => {
      requestHeaders = init?.headers as Headers;

      return createJsonResponse({
        id: "resp_followup_1",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "done" }],
          },
        ],
        usage: {
          input_tokens: 5,
          output_tokens: 2,
        },
      });
    },
  });

  await model.complete(makeToolResultFollowUpRequest());

  assert.equal(requestHeaders?.get("x-initiator"), "agent");
});

test("GitHubModel sends OpenAI-compatible function tool definitions for chat completions", async () => {
  let requestBody: Record<string, unknown> | undefined;

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "chatcmpl_tools",
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
          prompt_tokens: 2,
          completion_tokens: 1,
        },
      });
    },
  });

  await model.complete(
    makeChatRequest("gpt-4o", {
      tools: [
        {
          name: "Bash",
          description: "Executes a shell command",
          input_schema: {
            type: "object",
            properties: {
              command: {
                type: "string",
              },
            },
            required: ["command"],
          },
        },
      ],
    }),
  );

  assert.deepEqual(requestBody?.tools, [
    {
      type: "function",
      function: {
        name: "Bash",
        description: "Executes a shell command",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
      },
    },
  ]);
});

test("GitHubModel extends OpenAiModel", () => {
  const model = new GitHubModel({
    apiKey: "ghu_api_key",
  });

  assert.ok(model instanceof OpenAiModel);
});

test("GitHubModel can force the responses surface through constructor options", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> | undefined;

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    surface: "openai-responses",
    fetch: async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "resp_forced_1",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "forced responses" }],
          },
        ],
        usage: {
          input_tokens: 5,
          output_tokens: 2,
        },
      });
    },
  });

  const response = await model.complete(makeChatRequest("gpt-4o"));

  assert.equal(requestUrl, "https://api.individual.githubcopilot.com/responses");
  assert.deepEqual(requestBody, {
    model: "gpt-4o",
    instructions: "Be direct.",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hello" }],
      },
    ],
    max_output_tokens: 1024,
    tools: [],
    store: false,
  });
  assert.equal(response.id, "resp_forced_1");
});

test("GitHubModel can force the anthropic messages surface through constructor options", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    model: "claude-sonnet-4.6",
    surface: "anthropic-messages",
    fetch: async (input, init) => {
      requestUrl = String(input);
      requestHeaders = init?.headers as Headers;
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "msg_forced_1",
        type: "message",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "forced anthropic",
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 5,
          output_tokens: 2,
        },
      });
    },
  });

  const response = await model.complete(makeChatRequest("claude-sonnet-4.6"));

  assert.equal(requestUrl, "https://api.individual.githubcopilot.com/v1/messages");
  assert.equal(requestHeaders?.get("authorization"), "Bearer ghu_api_key");
  assert.equal(requestHeaders?.get("anthropic-version"), "2023-06-01");
  assert.equal(requestHeaders?.get("editor-version"), "vscode/1.104.2");
  assert.equal(requestHeaders?.get("editor-plugin-version"), "copilot-chat/0.31.3");
  assert.equal(requestHeaders?.get("x-initiator"), "user");
  assert.ok(requestHeaders?.get("x-request-id"));
  assert.deepEqual(requestBody, {
    model: "claude-sonnet-4.6",
    system: [
      {
        type: "text",
        text: "Be direct.",
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "hello",
          },
        ],
      },
    ],
    max_tokens: 1024,
    tools: [],
  });
  assert.equal(response.id, "msg_forced_1");
  assert.deepEqual(response.content, [{ type: "text", text: "forced anthropic" }]);
});

test("GitHubModel surface option overrides cached responses-only metadata", async () => {
  const requestUrls: string[] = [];

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    surface: "openai-chat-completions",
    fetch: async (input, init) => {
      const url = String(input);
      requestUrls.push(url);

      if (url.endsWith("/models")) {
        return createJsonResponse({
          data: [
            {
              id: "gpt-5.1-codex",
              name: "GPT 5.1 Codex",
              supported_endpoints: ["/responses"],
            },
          ],
        });
      }

      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gpt-5.1-codex");

      return createJsonResponse({
        id: "chatcmpl_forced_1",
        choices: [
          {
            message: {
              role: "assistant",
              content: "forced chat completions",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 2,
          completion_tokens: 1,
        },
      });
    },
  });

  await model.getModels();
  const response = await model.complete(makeChatRequest("gpt-5.1-codex"));

  assert.equal(response.id, "chatcmpl_forced_1");
  assert.deepEqual(requestUrls, [
    "https://api.individual.githubcopilot.com/models",
    "https://api.individual.githubcopilot.com/chat/completions",
  ]);
});

test("GitHubModel exchanges access tokens, uses dynamic endpoints, and refreshes after 401", async () => {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  let exchangeCount = 0;

  const model = new GitHubModel({
    accessToken: "gho_access_token",
    fetch: async (input, init) => {
      const url = String(input);
      const headers = init?.headers as Headers;
      calls.push({
        url,
        authorization: headers.get("authorization"),
      });

      if (url === "https://api.github.com/copilot_internal/v2/token") {
        exchangeCount += 1;

        return createJsonResponse({
          token: `session-token-${exchangeCount}`,
          endpoints: {
            api: `https://dynamic-${exchangeCount}.example`,
          },
        });
      }

      if (url === "https://dynamic-1.example/chat/completions") {
        return new Response("unauthorized", { status: 401 });
      }

      if (url === "https://dynamic-2.example/chat/completions") {
        return createJsonResponse({
          id: "chatcmpl_2",
          choices: [
            {
              message: {
                role: "assistant",
                content: "retried",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 2,
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const response = await model.complete(makeChatRequest());

  assert.equal(response.id, "chatcmpl_2");
  assert.deepEqual(
    calls.map((call) => [call.url, call.authorization]),
    [
      ["https://api.github.com/copilot_internal/v2/token", "Bearer gho_access_token"],
      ["https://dynamic-1.example/chat/completions", "Bearer session-token-1"],
      ["https://api.github.com/copilot_internal/v2/token", "Bearer gho_access_token"],
      ["https://dynamic-2.example/chat/completions", "Bearer session-token-2"],
    ],
  );
});

test("GitHubModel getModels deduplicates results and caches supported endpoints", async () => {
  const modelUrls: string[] = [];
  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    fetch: async (input, init) => {
      const url = String(input);
      modelUrls.push(url);

      if (url.endsWith("/models")) {
        return createJsonResponse({
          data: [
            {
              id: "gpt-5.1-codex",
              name: "GPT 5.1 Codex",
              supported_endpoints: ["/responses"],
              capabilities: {
                family: "gpt-5",
                type: "chat",
                limits: {
                  max_context_window_tokens: 200000,
                  max_output_tokens: 100000,
                },
              },
            },
            {
              id: "gpt-4o",
              name: "GPT 4o",
              supported_endpoints: ["/chat/completions", "/responses"],
              capabilities: {
                family: "gpt-4o",
                type: "chat",
              },
            },
            {
              id: "gpt-4o",
              name: "GPT 4o Duplicate",
              capabilities: {
                family: "gpt-4o",
                type: "chat",
              },
            },
          ],
        });
      }

      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gpt-5.1-codex");

      return createJsonResponse({
        id: "resp_1",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "responses path" }],
          },
        ],
        usage: {
          input_tokens: 5,
          output_tokens: 6,
        },
      });
    },
  });

  const models = await model.getModels();
  const response = await model.complete(makeChatRequest("gpt-5.1-codex"));

  assert.deepEqual(models, [
    {
      id: "gpt-5.1-codex",
      name: "GPT 5.1 Codex",
      limits: {
        contextWindow: 200000,
        maxOutput: 100000,
      },
      supportedEndpoints: ["/responses"],
    },
    {
      id: "gpt-4o",
      name: "GPT 4o",
      supportedEndpoints: ["/chat/completions", "/responses"],
    },
  ]);
  assert.equal(response.id, "resp_1");
  assert.deepEqual(modelUrls, [
    "https://api.individual.githubcopilot.com/models",
    "https://api.individual.githubcopilot.com/responses",
  ]);
});

test("GitHubModel uses cached supported_endpoints and still prefers chat completions when other provider endpoints are present", async () => {
  const requestUrls: string[] = [];

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    fetch: async (input, init) => {
      const url = String(input);
      requestUrls.push(url);

      if (url.endsWith("/models")) {
        return createJsonResponse({
          data: [
            {
              id: "claude-opus-4.6",
              name: "Claude Opus 4.6",
              supported_endpoints: ["/v1/messages", "/chat/completions"],
            },
          ],
        });
      }

      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "claude-opus-4.6");

      return createJsonResponse({
        id: "chatcmpl_claude",
        choices: [
          {
            message: {
              role: "assistant",
              content: "chat path",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 2,
          completion_tokens: 1,
        },
      });
    },
  });

  await model.getModels();
  const response = await model.complete(makeChatRequest("claude-opus-4.6"));

  assert.equal(response.id, "chatcmpl_claude");
  assert.deepEqual(requestUrls, [
    "https://api.individual.githubcopilot.com/models",
    "https://api.individual.githubcopilot.com/chat/completions",
  ]);
});

test("GitHubModel falls back to the responses API when chat completions reject a model", async () => {
  const request = makeChatRequest("some-new-model", {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "List files" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "Bash",
            input: { command: "ls -la" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: "file-a\nfile-b",
            is_error: false,
          },
        ],
      },
    ],
    tools: [
      {
        name: "Bash",
        description: "Executes a shell command",
        input_schema: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
      },
    ],
  });
  const requestUrls: string[] = [];
  let responsesBody: Record<string, unknown> | undefined;
  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    fetch: async (input, init) => {
      const url = String(input);
      requestUrls.push(url);

      if (url.endsWith("/chat/completions")) {
        return new Response(
          JSON.stringify({
            error: {
              message: "model some-new-model is not accessible via the /chat/completions endpoint",
              code: "unsupported_api_for_model",
            },
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      responsesBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "resp_2",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "done" }],
          },
        ],
        usage: {
          input_tokens: 7,
          output_tokens: 3,
        },
      });
    },
  });

  const firstResponse = await model.complete(request);
  const secondResponse = await model.complete(request);

  assert.equal(firstResponse.id, "resp_2");
  assert.equal(secondResponse.id, "resp_2");
  assert.deepEqual(requestUrls, [
    "https://api.individual.githubcopilot.com/chat/completions",
    "https://api.individual.githubcopilot.com/responses",
    "https://api.individual.githubcopilot.com/responses",
  ]);
  assert.deepEqual(responsesBody, {
    model: "some-new-model",
    instructions: "Be direct.",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "List files" }],
      },
      {
        type: "function_call",
        call_id: "call_1",
        name: "Bash",
        arguments: '{"command":"ls -la"}',
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: "file-a\nfile-b",
      },
    ],
    max_output_tokens: 1024,
    tools: [
      {
        type: "function",
        name: "Bash",
        description: "Executes a shell command",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
            },
          },
          required: ["command"],
        },
      },
    ],
    store: false,
  });
});

test("GitHubModel auto mode prefers Responses when reasoning is enabled and the model supports it", async () => {
  const requestUrls: string[] = [];

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    fetch: async (input, init) => {
      const url = String(input);
      requestUrls.push(url);

      if (url.endsWith("/models")) {
        return createJsonResponse({
          data: [
            {
              id: "gpt-5.4",
              name: "GPT 5.4",
              supported_endpoints: ["/chat/completions", "/responses"],
            },
          ],
        });
      }

      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(url, "https://api.individual.githubcopilot.com/responses");
      assert.deepEqual(body.reasoning, {
        effort: "low",
        summary: "auto",
      });

      return createJsonResponse({
        id: "resp_reasoning_gh_1",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "done" }],
          },
        ],
        usage: {
          input_tokens: 4,
          output_tokens: 2,
        },
      });
    },
  });

  await model.getModels();
  const response = await model.complete(
    makeChatRequest("gpt-5.4", {
      reasoning: {
        visibility: "user-visible",
        openai: {
          effort: "low",
        },
      },
    }),
  );

  assert.equal(response.id, "resp_reasoning_gh_1");
  assert.deepEqual(requestUrls, [
    "https://api.individual.githubcopilot.com/models",
    "https://api.individual.githubcopilot.com/responses",
  ]);
});

test("GitHubModel auto mode prefers Responses when auto reasoning is enabled", async () => {
  const requestUrls: string[] = [];

  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    reasoning: {
      visibility: "user-visible",
      auto: {
        effort: "medium",
      },
    },
    fetch: async (input, init) => {
      const url = String(input);
      requestUrls.push(url);

      if (url.endsWith("/models")) {
        return createJsonResponse({
          data: [
            {
              id: "gpt-5.4",
              name: "GPT 5.4",
              supported_endpoints: ["/chat/completions", "/responses"],
            },
          ],
        });
      }

      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(url, "https://api.individual.githubcopilot.com/responses");
      assert.deepEqual(body.reasoning, {
        effort: "medium",
        summary: "auto",
      });

      return createJsonResponse({
        id: "resp_auto_reasoning_gh_1",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "done" }],
          },
        ],
        usage: {
          input_tokens: 4,
          output_tokens: 2,
        },
      });
    },
  });

  await model.getModels();
  const response = await model.complete(makeChatRequest("gpt-5.4"));

  assert.equal(response.id, "resp_auto_reasoning_gh_1");
  assert.deepEqual(requestUrls, [
    "https://api.individual.githubcopilot.com/models",
    "https://api.individual.githubcopilot.com/responses",
  ]);
});

test("GitHubModel streams chat completion deltas and assembles the final response", async () => {
  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    fetch: async () => {
      return createSseResponse([
        'data: {"id":"chatcmpl_3","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"location\\":\\"NYC\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
        "data: [DONE]\n\n",
      ]);
    },
  });

  const chunks: ChatResponseChunk[] = [];
  // biome-ignore lint/style/noNonNullAssertion: stream is always present on model under test
  for await (const chunk of model.stream!(makeChatRequest())) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, [
    {
      type: "content_delta",
      index: 0,
      text: "Hello",
    },
    {
      type: "tool_use_delta",
      id: "call_123",
      index: 0,
      name: "get_weather",
    },
    {
      type: "tool_use_delta",
      id: "call_123",
      index: 0,
      inputDelta: "{",
    },
    {
      type: "tool_use_delta",
      id: "call_123",
      index: 0,
      inputDelta: '"location":"NYC"}',
    },
    {
      type: "done",
      response: {
        id: "chatcmpl_3",
        content: [
          {
            type: "text",
            text: "Hello",
          },
          {
            type: "tool_use",
            id: "call_123",
            name: "get_weather",
            input: {
              location: "NYC",
            },
          },
        ],
        stopReason: "tool_use",
        usage: {
          inputTokens: 3,
          outputTokens: 2,
        },
      },
    },
  ]);
});

test("GitHubModel streams responses API events for responses-only models", async () => {
  const model = new GitHubModel({
    apiKey: "ghu_api_key",
    fetch: async (input) => {
      const url = String(input);

      if (url.endsWith("/models")) {
        return createJsonResponse({
          data: [
            {
              id: "gpt-5.1-codex",
              name: "GPT 5.1 Codex",
              supported_endpoints: ["/responses"],
            },
          ],
        });
      }

      return createSseResponse([
        'event: response.output_text.delta\ndata: {"delta":"Part 1 "}\n\n',
        'event: response.output_item.added\ndata: {"output_index":0,"item":{"type":"function_call","call_id":"call_456","name":"search"}}\n\n',
        'event: response.function_call_arguments.delta\ndata: {"call_id":"call_456","delta":"{\\"query\\":"}\n\n',
        'event: response.function_call_arguments.delta\ndata: {"call_id":"call_456","delta":"\\"cats\\"}"}\n\n',
        'event: response.completed\ndata: {"response":{"id":"resp_3","object":"response","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Part 1 "}]},{"type":"function_call","call_id":"call_456","name":"search","arguments":"{\\"query\\":\\"cats\\"}"}],"usage":{"input_tokens":9,"output_tokens":4}}}\n\n',
      ]);
    },
  });

  await model.getModels();

  const chunks: ChatResponseChunk[] = [];
  // biome-ignore lint/style/noNonNullAssertion: stream is always present on model under test
  for await (const chunk of model.stream!(makeChatRequest("gpt-5.1-codex"))) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, [
    {
      type: "content_delta",
      index: 0,
      text: "Part 1 ",
    },
    {
      type: "tool_use_delta",
      id: "call_456",
      index: 0,
      name: "search",
    },
    {
      type: "tool_use_delta",
      id: "call_456",
      index: 0,
      inputDelta: '{"query":',
    },
    {
      type: "tool_use_delta",
      id: "call_456",
      index: 0,
      inputDelta: '"cats"}',
    },
    {
      type: "done",
      response: {
        id: "resp_3",
        content: [
          {
            type: "text",
            text: "Part 1 ",
          },
          {
            type: "tool_use",
            id: "call_456",
            name: "search",
            input: {
              query: "cats",
            },
          },
        ],
        providerState: {
          openaiResponsesOutput: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "Part 1 " }],
            },
            {
              type: "function_call",
              call_id: "call_456",
              name: "search",
              arguments: '{"query":"cats"}',
            },
          ],
          openaiResponsesResponseId: "resp_3",
        },
        stopReason: "tool_use",
        usage: {
          inputTokens: 9,
          outputTokens: 4,
        },
      },
    },
  ]);
});
