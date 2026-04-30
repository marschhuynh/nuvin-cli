import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatRequest, ChatResponseChunk } from "../shared/types.ts";
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

class MockWebSocket extends EventTarget {
  public readonly sentMessages: string[] = [];
  public readonly readyState = WebSocket.OPEN;
  public readonly url: string;
  public closed = false;

  private readonly scriptedEvents: Array<Record<string, unknown>>;

  constructor(url: string, scriptedEvents: Array<Record<string, unknown>>) {
    super();
    this.url = url;
    this.scriptedEvents = scriptedEvents;

    queueMicrotask(() => {
      this.dispatchEvent(new Event("open"));
    });
  }

  close(): void {
    this.closed = true;
    this.dispatchEvent(new Event("close"));
  }

  send(data: string): void {
    this.sentMessages.push(data);

    queueMicrotask(() => {
      for (const event of this.scriptedEvents) {
        this.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify(event),
          }),
        );
      }
    });
  }
}

class SequencedMockWebSocket extends EventTarget {
  public readonly sentMessages: string[] = [];
  public readonly readyState = WebSocket.OPEN;
  public readonly url: string;
  public closed = false;

  private readonly eventBatches: Array<Array<Record<string, unknown>>>;

  constructor(url: string, eventBatches: Array<Array<Record<string, unknown>>>) {
    super();
    this.url = url;
    this.eventBatches = eventBatches;

    queueMicrotask(() => {
      this.dispatchEvent(new Event("open"));
    });
  }

  close(): void {
    this.closed = true;
    this.dispatchEvent(new Event("close"));
  }

  send(data: string): void {
    this.sentMessages.push(data);
    const batch = this.eventBatches.shift() ?? [];

    queueMicrotask(() => {
      for (const event of batch) {
        this.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify(event),
          }),
        );
      }
    });
  }
}

test("OpenAiModel sends OpenAI-compatible chat-completions requests", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;

  const model = new OpenAiModel({
    apiKey: "openai-key",
    baseUrl: "https://api.openai.example/v1",
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
              content: "done",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 7,
          completion_tokens: 3,
        },
      });
    },
  });

  const response = await model.chatComplete(
    makeChatRequest("gpt-4o", {
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
    }),
  );

  assert.equal(requestUrl, "https://api.openai.example/v1/chat/completions");
  assert.equal(requestHeaders?.get("authorization"), "Bearer openai-key");
  assert.equal(requestHeaders?.get("accept"), "application/json");
  assert.equal(requestHeaders?.get("content-type"), "application/json");
  assert.deepEqual(requestBody, {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Be direct.",
      },
      {
        role: "user",
        content: "List files",
      },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "Bash",
              arguments: '{"command":"ls -la"}',
            },
          },
        ],
      },
      {
        role: "tool",
        content: "file-a\nfile-b",
        tool_call_id: "call_1",
      },
    ],
    max_tokens: 1024,
    stream: false,
    tools: [
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
    ],
  });
  assert.equal(response.id, "chatcmpl_1");
  assert.deepEqual(response.content, [{ type: "text", text: "done" }]);
  assert.equal(response.stopReason, "end_turn");
  assert.deepEqual(response.usage, {
    inputTokens: 7,
    outputTokens: 3,
  });
});

test("OpenAiModel sends reasoning-aware chat-completions requests and parses reasoning token usage", async () => {
  let requestBody: Record<string, unknown> | undefined;

  const model = new OpenAiModel({
    apiKey: "openai-key",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "chatcmpl_reasoning_1",
        choices: [
          {
            message: {
              role: "assistant",
              content: "planned",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 8,
          completion_tokens_details: {
            reasoning_tokens: 5,
          },
        },
      });
    },
  });

  const response = await model.chatComplete(
    makeChatRequest("gpt-5.4", {
      reasoning: {
        visibility: "continuity-only",
        openai: {
          effort: "low",
        },
      },
    }),
  );

  assert.deepEqual(requestBody, {
    model: "gpt-5.4",
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
    max_completion_tokens: 1024,
    reasoning_effort: "low",
    stream: false,
  });
  assert.deepEqual(response.usage, {
    inputTokens: 11,
    outputTokens: 8,
    reasoningTokens: 5,
  });
});

test("OpenAiModel resolves auto reasoning config for chat-completions requests", async () => {
  let requestBody: Record<string, unknown> | undefined;

  const model = new OpenAiModel({
    apiKey: "openai-key",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "chatcmpl_auto_reasoning_1",
        choices: [
          {
            message: {
              role: "assistant",
              content: "planned",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 9,
          completion_tokens: 6,
        },
      });
    },
  });

  await model.chatComplete(
    makeChatRequest("gpt-5.4", {
      reasoning: {
        visibility: "continuity-only",
        auto: {
          effort: "medium",
        },
      },
    }),
  );

  assert.deepEqual(requestBody, {
    model: "gpt-5.4",
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
    max_completion_tokens: 1024,
    reasoning_effort: "medium",
    stream: false,
  });
});

test("OpenAiModel prefers resolved provider sessions and retries once after 401", async () => {
  const resolverCalls: string[] = [];
  const authHeaders: string[] = [];
  const requestUrls: string[] = [];

  const model = new OpenAiModel({
    baseUrl: "https://api.openai.example/v1",
    providerSessionResolver: {
      resolve: async () => {
        const token = resolverCalls.length === 0 ? "session-token-1" : "session-token-2";
        resolverCalls.push(token);

        return {
          credential: {
            kind: "session-token",
            value: token,
          },
          endpoints: {
            api: `https://dynamic-${resolverCalls.length}.example/v1`,
          },
        };
      },
    },
    fetch: async (input, init) => {
      requestUrls.push(String(input));

      const authHeader = String((init?.headers as Headers).get("authorization"));
      authHeaders.push(authHeader);

      if (authHeader === "Bearer session-token-1") {
        return new Response("unauthorized", { status: 401 });
      }

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
    },
  });

  const response = await model.chatComplete(makeChatRequest());

  assert.equal(response.id, "chatcmpl_2");
  assert.deepEqual(resolverCalls, ["session-token-1", "session-token-2"]);
  assert.deepEqual(authHeaders, ["Bearer session-token-1", "Bearer session-token-2"]);
  assert.deepEqual(requestUrls, [
    "https://dynamic-1.example/v1/chat/completions",
    "https://dynamic-2.example/v1/chat/completions",
  ]);
});

test("OpenAiModel streams chat completion deltas and assembles the final response", async () => {
  const model = new OpenAiModel({
    apiKey: "openai-key",
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
  for await (const chunk of model.chatStream(makeChatRequest())) {
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

test("OpenAiModel sends Responses API requests through response()", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;

  const model = new OpenAiModel({
    apiKey: "openai-key",
    baseUrl: "https://api.openai.example/v1",
    fetch: async (input, init) => {
      requestUrl = String(input);
      requestHeaders = init?.headers as Headers;
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

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

  const response = await model.response(
    makeChatRequest("gpt-5.4-mini", {
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
    }),
  );

  assert.equal(requestUrl, "https://api.openai.example/v1/responses");
  assert.equal(requestHeaders?.get("authorization"), "Bearer openai-key");
  assert.equal(requestHeaders?.get("accept"), "application/json");
  assert.deepEqual(requestBody, {
    model: "gpt-5.4-mini",
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
  assert.equal(response.id, "resp_1");
  assert.deepEqual(response.content, [{ type: "text", text: "responses path" }]);
  assert.equal(response.stopReason, "end_turn");
  assert.deepEqual(response.usage, {
    inputTokens: 5,
    outputTokens: 6,
  });
});

test("OpenAiModel sends visible reasoning requests through the Responses API", async () => {
  let requestBody: Record<string, unknown> | undefined;

  const model = new OpenAiModel({
    apiKey: "openai-key",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createJsonResponse({
        id: "resp_reasoning_visible_1",
        object: "response",
        status: "completed",
        output: [
          {
            type: "reasoning",
            id: "rs_visible_1",
            encrypted_content: "enc-1",
            summary: [
              {
                type: "summary_text",
                text: "Inspect the workspace first.",
              },
            ],
          },
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Use the search tool." }],
          },
        ],
        usage: {
          input_tokens: 12,
          output_tokens: 7,
          output_tokens_details: {
            reasoning_tokens: 4,
          },
        },
      });
    },
  });

  const response = await model.response(
    makeChatRequest("gpt-5.4", {
      reasoning: {
        visibility: "user-visible",
        openai: {
          effort: "low",
        },
      },
    }),
  );

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
  assert.deepEqual(response.content, [
    {
      type: "openai_reasoning",
      id: "rs_visible_1",
      encryptedContent: "enc-1",
      summary: [
        {
          type: "summary_text",
          text: "Inspect the workspace first.",
        },
      ],
    },
    {
      type: "text",
      text: "Use the search tool.",
    },
  ]);
  assert.deepEqual(response.usage, {
    inputTokens: 12,
    outputTokens: 7,
    reasoningTokens: 4,
  });
  assert.equal(response.providerState?.openaiResponsesResponseId, "resp_reasoning_visible_1");
});

test("OpenAiModel ignores non-function Responses output items when parsing tool calls", async () => {
  const model = new OpenAiModel({
    apiKey: "openai-key",
    fetch: async () => {
      return createJsonResponse({
        id: "resp_reasoning_1",
        object: "response",
        status: "completed",
        output: [
          {
            type: "reasoning",
            id: "rs_1",
            summary: [
              {
                type: "summary_text",
                text: "Need to inspect files first.",
              },
            ],
          },
          {
            type: "function_call",
            call_id: "call_456",
            name: "Bash",
            arguments: '{"command":"ls"}',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 4,
        },
      });
    },
  });

  const response = await model.response(makeChatRequest("gpt-5.4-mini"));

  assert.deepEqual(response.content, [
    {
      type: "tool_use",
      id: "call_456",
      name: "Bash",
      input: {
        command: "ls",
      },
    },
  ]);
  assert.equal(response.stopReason, "tool_use");
  assert.deepEqual(response.providerState, {
    openaiResponsesOutput: [
      {
        type: "reasoning",
        id: "rs_1",
        summary: [
          {
            type: "summary_text",
            text: "Need to inspect files first.",
          },
        ],
      },
      {
        type: "function_call",
        call_id: "call_456",
        name: "Bash",
        arguments: '{"command":"ls"}',
      },
    ],
    openaiResponsesResponseId: "resp_reasoning_1",
  });
});

test("OpenAiModel can keep Responses reasoning continuity without exposing reasoning blocks", async () => {
  const model = new OpenAiModel({
    apiKey: "openai-key",
    fetch: async () => {
      return createJsonResponse({
        id: "resp_reasoning_hidden_1",
        object: "response",
        status: "completed",
        output: [
          {
            type: "reasoning",
            id: "rs_hidden_1",
            encrypted_content: "enc-hidden-1",
            summary: [
              {
                type: "summary_text",
                text: "Need to inspect files first.",
              },
            ],
          },
          {
            type: "function_call",
            call_id: "call_hidden_1",
            name: "Bash",
            arguments: '{"command":"ls"}',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 4,
        },
      });
    },
  });

  const response = await model.response(
    makeChatRequest("gpt-5.4", {
      reasoning: {
        visibility: "continuity-only",
        openai: {
          effort: "medium",
        },
      },
    }),
  );

  assert.deepEqual(response.content, [
    {
      type: "tool_use",
      id: "call_hidden_1",
      name: "Bash",
      input: {
        command: "ls",
      },
    },
  ]);
  assert.equal(response.providerState?.openaiResponsesResponseId, "resp_reasoning_hidden_1");
});

test("OpenAiModel streams Responses API events through responseStream()", async () => {
  const model = new OpenAiModel({
    apiKey: "openai-key",
    fetch: async () => {
      return createSseResponse([
        'event: response.output_text.delta\ndata: {"delta":"Part 1 "}\n\n',
        'event: response.output_item.added\ndata: {"output_index":0,"item":{"type":"function_call","call_id":"call_456","name":"search"}}\n\n',
        'event: response.function_call_arguments.delta\ndata: {"call_id":"call_456","delta":"{\\"query\\":"}\n\n',
        'event: response.function_call_arguments.delta\ndata: {"call_id":"call_456","delta":"\\"cats\\"}"}\n\n',
        'event: response.completed\ndata: {"response":{"id":"resp_3","object":"response","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Part 1 "}]},{"type":"function_call","call_id":"call_456","name":"search","arguments":"{\\"query\\":\\"cats\\"}"}],"usage":{"input_tokens":9,"output_tokens":4}}}\n\n',
      ]);
    },
  });

  const chunks: ChatResponseChunk[] = [];
  for await (const chunk of model.responseStream(makeChatRequest("gpt-5.4-mini"))) {
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

test("OpenAiModel streams visible Responses reasoning summary deltas when requested", async () => {
  const model = new OpenAiModel({
    apiKey: "openai-key",
    fetch: async () => {
      return createSseResponse([
        'event: response.output_item.added\ndata: {"output_index":0,"item":{"type":"reasoning","id":"rs_stream_1"}}\n\n',
        'event: response.reasoning_summary_text.delta\ndata: {"item_id":"rs_stream_1","output_index":0,"summary_index":0,"delta":"Need to inspect first."}\n\n',
        'event: response.output_text.delta\ndata: {"output_index":1,"delta":"Final answer"}\n\n',
        'event: response.completed\ndata: {"response":{"id":"resp_stream_reasoning_1","object":"response","status":"completed","output":[{"type":"reasoning","id":"rs_stream_1","summary":[{"type":"summary_text","text":"Need to inspect first."}],"encrypted_content":"enc-stream-1"},{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Final answer"}]}],"usage":{"input_tokens":8,"output_tokens":5,"output_tokens_details":{"reasoning_tokens":3}}}}\n\n',
      ]);
    },
  });

  const chunks: ChatResponseChunk[] = [];
  for await (const chunk of model.responseStream(
    makeChatRequest("gpt-5.4", {
      reasoning: {
        visibility: "user-visible",
        openai: {
          effort: "medium",
        },
      },
    }),
  )) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, [
    {
      type: "openai_reasoning_summary_delta",
      delta: "Need to inspect first.",
      itemId: "rs_stream_1",
      outputIndex: 0,
      summaryIndex: 0,
    },
    {
      type: "content_delta",
      index: 1,
      text: "Final answer",
    },
    {
      type: "done",
      response: {
        id: "resp_stream_reasoning_1",
        content: [
          {
            type: "openai_reasoning",
            id: "rs_stream_1",
            encryptedContent: "enc-stream-1",
            summary: [
              {
                type: "summary_text",
                text: "Need to inspect first.",
              },
            ],
          },
          {
            type: "text",
            text: "Final answer",
          },
        ],
        providerState: {
          openaiResponsesOutput: [
            {
              type: "reasoning",
              id: "rs_stream_1",
              summary: [
                {
                  type: "summary_text",
                  text: "Need to inspect first.",
                },
              ],
              encrypted_content: "enc-stream-1",
            },
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "Final answer" }],
            },
          ],
          openaiResponsesResponseId: "resp_stream_reasoning_1",
        },
        stopReason: "end_turn",
        usage: {
          inputTokens: 8,
          outputTokens: 5,
          reasoningTokens: 3,
        },
      },
    },
  ]);
});

test("OpenAiModel streams Responses API events over WebSocket through responseSocketStream()", async () => {
  let socketUrl = "";
  let socketHeaders: Record<string, string> | undefined;
  let socket: MockWebSocket | undefined;

  const model = new OpenAiModel({
    apiKey: "openai-key",
    baseUrl: "https://api.openai.example/v1",
    webSocketFactory: ({ url, headers }) => {
      socketUrl = url;
      socketHeaders = headers;
      socket = new MockWebSocket(url, [
        {
          type: "response.output_text.delta",
          delta: "Part 1 ",
        },
        {
          type: "response.output_item.added",
          output_index: 0,
          item: {
            type: "function_call",
            call_id: "call_456",
            name: "search",
          },
        },
        {
          type: "response.function_call_arguments.delta",
          call_id: "call_456",
          delta: '{"query":',
        },
        {
          type: "response.function_call_arguments.delta",
          call_id: "call_456",
          delta: '"cats"}',
        },
        {
          type: "response.completed",
          response: {
            id: "resp_ws_1",
            object: "response",
            status: "completed",
            output: [
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
            usage: {
              input_tokens: 9,
              output_tokens: 4,
            },
          },
        },
      ]);

      return socket;
    },
  });

  const chunks: ChatResponseChunk[] = [];
  for await (const chunk of model.responseSocketStream(
    makeChatRequest("gpt-5.4-mini", {
      metadata: {
        sessionId: "ws-single-session",
        turnId: "turn-1",
      },
    }),
  )) {
    chunks.push(chunk);
  }

  assert.equal(socketUrl, "wss://api.openai.example/v1/responses");
  assert.deepEqual(socketHeaders, {
    authorization: "Bearer openai-key",
  });
  assert.deepEqual(JSON.parse(String(socket?.sentMessages[0])), {
    type: "response.create",
    model: "gpt-5.4-mini",
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
  assert.equal(socket?.closed, false);
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
        id: "resp_ws_1",
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
          openaiResponsesResponseId: "resp_ws_1",
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

test("OpenAiModel reuses the Responses WebSocket per session and chains previous_response_id", async () => {
  let socketFactoryCalls = 0;
  let socket: SequencedMockWebSocket | undefined;

  const toolSchema = {
    name: "search",
    description: "Searches the workspace",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
        },
      },
      required: ["query"],
    },
  };

  const model = new OpenAiModel({
    apiKey: "openai-key",
    baseUrl: "https://api.openai.example/v1",
    webSocketFactory: ({ url }) => {
      socketFactoryCalls += 1;

      if (!socket) {
        socket = new SequencedMockWebSocket(url, [
          [
            {
              type: "response.output_item.added",
              output_index: 0,
              item: {
                type: "function_call",
                call_id: "call_123",
                name: "search",
              },
            },
            {
              type: "response.function_call_arguments.delta",
              call_id: "call_123",
              delta: '{"query":"cats"}',
            },
            {
              type: "response.completed",
              response: {
                id: "resp_ws_chain_1",
                object: "response",
                status: "completed",
                output: [
                  {
                    type: "function_call",
                    call_id: "call_123",
                    name: "search",
                    arguments: '{"query":"cats"}',
                  },
                ],
                usage: {
                  input_tokens: 8,
                  output_tokens: 3,
                },
              },
            },
          ],
          [
            {
              type: "response.output_text.delta",
              delta: "done",
            },
            {
              type: "response.completed",
              response: {
                id: "resp_ws_chain_2",
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
                  output_tokens: 1,
                },
              },
            },
          ],
        ]);
      }

      return socket;
    },
  });

  const firstRequest = makeChatRequest("gpt-5.4-mini", {
    metadata: {
      sessionId: "ws-reuse-session",
      turnId: "turn-1",
    },
    tools: [toolSchema],
  });
  const firstResponse = await model.responseSocket(firstRequest);

  const secondRequest = makeChatRequest("gpt-5.4-mini", {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
      {
        role: "assistant",
        content: structuredClone(firstResponse.content),
        providerState: structuredClone(firstResponse.providerState),
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_123",
            content: "cats.txt",
            is_error: false,
          },
        ],
      },
    ],
    metadata: {
      sessionId: "ws-reuse-session",
      turnId: "turn-2",
    },
    tools: [toolSchema],
  });
  const secondResponse = await model.responseSocket(secondRequest);

  assert.equal(socketFactoryCalls, 1);
  assert.equal(socket?.closed, false);
  assert.equal(firstResponse.id, "resp_ws_chain_1");
  assert.equal(secondResponse.id, "resp_ws_chain_2");
  assert.deepEqual(JSON.parse(String(socket?.sentMessages[0])), {
    type: "response.create",
    model: "gpt-5.4-mini",
    instructions: "Be direct.",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hello" }],
      },
    ],
    max_output_tokens: 1024,
    tools: [
      {
        type: "function",
        name: "search",
        description: "Searches the workspace",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
            },
          },
          required: ["query"],
        },
      },
    ],
    store: false,
  });
  assert.deepEqual(JSON.parse(String(socket?.sentMessages[1])), {
    type: "response.create",
    model: "gpt-5.4-mini",
    instructions: "Be direct.",
    previous_response_id: "resp_ws_chain_1",
    input: [
      {
        type: "function_call_output",
        call_id: "call_123",
        output: "cats.txt",
      },
    ],
    max_output_tokens: 1024,
    tools: [
      {
        type: "function",
        name: "search",
        description: "Searches the workspace",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
            },
          },
          required: ["query"],
        },
      },
    ],
    store: false,
  });
});

test("OpenAiModel shares one Responses WebSocket across model instances for the same session", async () => {
  let socketFactoryCalls = 0;
  let socket: SequencedMockWebSocket | undefined;

  const createModel = (): OpenAiModel => {
    return new OpenAiModel({
      apiKey: "openai-key",
      baseUrl: "https://api.openai.example/v1",
      webSocketFactory: ({ url }) => {
        socketFactoryCalls += 1;

        if (!socket) {
          socket = new SequencedMockWebSocket(url, [
            [
              {
                type: "response.completed",
                response: {
                  id: "resp_shared_1",
                  object: "response",
                  status: "completed",
                  output: [
                    {
                      type: "message",
                      role: "assistant",
                      content: [{ type: "output_text", text: "first" }],
                    },
                  ],
                  usage: {
                    input_tokens: 2,
                    output_tokens: 1,
                  },
                },
              },
            ],
            [
              {
                type: "response.completed",
                response: {
                  id: "resp_shared_2",
                  object: "response",
                  status: "completed",
                  output: [
                    {
                      type: "message",
                      role: "assistant",
                      content: [{ type: "output_text", text: "second" }],
                    },
                  ],
                  usage: {
                    input_tokens: 2,
                    output_tokens: 1,
                  },
                },
              },
            ],
          ]);
        }

        return socket;
      },
    });
  };

  const firstModel = createModel();
  const secondModel = createModel();

  const firstResponse = await firstModel.responseSocket(
    makeChatRequest("gpt-5.4-mini", {
      metadata: {
        sessionId: "shared-session",
        turnId: "turn-1",
      },
    }),
  );
  const secondResponse = await secondModel.responseSocket(
    makeChatRequest("gpt-5.4-mini", {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
        {
          role: "assistant",
          content: structuredClone(firstResponse.content),
          providerState: structuredClone(firstResponse.providerState),
        },
        {
          role: "user",
          content: [{ type: "text", text: "next" }],
        },
      ],
      metadata: {
        sessionId: "shared-session",
        turnId: "turn-2",
      },
    }),
  );

  assert.equal(firstResponse.id, "resp_shared_1");
  assert.equal(secondResponse.id, "resp_shared_2");
  assert.equal(socketFactoryCalls, 1);
  assert.deepEqual(JSON.parse(String(socket?.sentMessages[1])), {
    type: "response.create",
    model: "gpt-5.4-mini",
    instructions: "Be direct.",
    previous_response_id: "resp_shared_1",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "next" }],
      },
    ],
    max_output_tokens: 1024,
    tools: [],
    store: false,
  });
});

test("OpenAiModel closes a persistent responses socket when the request is aborted", async () => {
  let socket: MockWebSocket | undefined;

  const model = new OpenAiModel({
    apiKey: "openai-key",
    baseUrl: "https://api.openai.example/v1",
    webSocketFactory: ({ url }) => {
      socket = new MockWebSocket(url, []);
      return socket;
    },
  });

  const controller = new AbortController();
  const iterator = model
    .responseSocketStream(makeChatRequest("gpt-5.4-mini"), {
      signal: controller.signal,
    })
    [Symbol.asyncIterator]();
  const nextChunk = iterator.next();

  await Promise.resolve();
  controller.abort(new Error("socket abort"));

  const outcome = await Promise.race([
    nextChunk.then(
      () => "resolved",
      (error) => (error instanceof Error ? error.message : String(error)),
    ),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve("timed out waiting for abort"), 50);
    }),
  ]);

  assert.equal(outcome, "socket abort");
  assert.equal(socket?.closed, true);
});
