import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  ChatRequest,
  ChatResponse,
  ChatResponseChunk,
  ProviderCredential,
  ResolvedProviderSession,
} from "../shared/types.ts";
import { StaticModelSurfaceRouter } from "./model-surface-router.ts";
import type { ProviderAdapter } from "./provider-adapter.ts";
import type { RoutedModelStreamParser, RoutedModelSurface } from "./routed-model.ts";
import { RoutedModel } from "./routed-model.ts";

function makeChatRequest(): ChatRequest {
  return {
    model: "test-model",
    maxTokens: 256,
    system: [],
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    tools: [],
    metadata: {
      sessionId: "session-1",
      turnId: "turn-1",
    },
  };
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

class FakeProviderAdapter implements ProviderAdapter {
  createMissingCredentialError(): Error {
    return new Error("missing credential");
  }

  createHeaders(
    context: {
      credential: ProviderCredential;
    },
    options: {
      accept: string;
      includeContentType?: boolean;
    },
  ): Headers {
    const headers = new Headers();
    headers.set("accept", options.accept);
    headers.set("authorization", `Bearer ${context.credential.value}`);

    if (options.includeContentType !== false) {
      headers.set("content-type", "application/json");
    }

    return headers;
  }

  mapApiError(error: Error): Error {
    return error;
  }

  resolveBaseUrl(defaultBaseUrl: string, _session: ResolvedProviderSession | undefined): string {
    return defaultBaseUrl;
  }

  resolveCredential(
    apiKey: string | undefined,
    _session: ResolvedProviderSession | undefined,
  ): ProviderCredential | undefined {
    return apiKey
      ? {
          kind: "api-key",
          value: apiKey,
        }
      : undefined;
  }

  async toApiError(response: Response): Promise<Error> {
    return new Error(`status ${response.status}`);
  }
}

class CollectingParser implements RoutedModelStreamParser {
  private text = "";

  consumeSseEvent(rawEvent: string): ChatResponseChunk[] {
    const data = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");

    if (data.length === 0 || data === "[DONE]") {
      return [];
    }

    this.text += data;
    return [
      {
        type: "content_delta",
        text: data,
      },
    ];
  }

  finish(): ChatResponse {
    return {
      id: "stream-1",
      content: [{ type: "text", text: this.text }],
      stopReason: "end_turn",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }
}

class TestRoutedModel extends RoutedModel {
  constructor(options: {
    fetch: typeof globalThis.fetch;
    providerSessionResolver?: {
      resolve(signal?: AbortSignal): Promise<ResolvedProviderSession>;
    };
    surfaces: RoutedModelSurface[];
    router: StaticModelSurfaceRouter;
  }) {
    super({
      apiKey: "test-key",
      baseUrl: "https://provider.example",
      fetch: options.fetch,
      model: "test-model",
      providerAdapter: new FakeProviderAdapter(),
      providerSessionResolver: options.providerSessionResolver,
      router: options.router,
      surfaces: options.surfaces,
    });
  }

  override complete(
    request: ChatRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ChatResponse> {
    return this.completeViaRouter(request, options as never);
  }

  override stream(
    request: ChatRequest,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<ChatResponseChunk> {
    return this.streamViaRouter(request, options as never);
  }
}

test("RoutedModel completes through the JSON surface chosen by the router", async () => {
  const requestUrls: string[] = [];

  const model = new TestRoutedModel({
    router: new StaticModelSurfaceRouter({
      complete: "json-surface",
      stream: "stream-surface",
    }),
    surfaces: [
      {
        id: "json-surface",
        transport: "http-json",
        createRequest(request) {
          return {
            path: "/json",
            body: {
              model: request.model,
              mode: "complete",
            },
          };
        },
        parseResponse(payload) {
          const body = payload as { text: string };
          return {
            id: "json-1",
            content: [{ type: "text", text: body.text }],
            stopReason: "end_turn",
            usage: {
              inputTokens: 1,
              outputTokens: 1,
            },
          };
        },
      },
    ],
    fetch: async (input) => {
      requestUrls.push(String(input));

      return new Response(
        JSON.stringify({
          text: "via json surface",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const response = await model.complete(makeChatRequest());

  assert.equal(response.id, "json-1");
  assert.deepEqual(response.content, [{ type: "text", text: "via json surface" }]);
  assert.deepEqual(requestUrls, ["https://provider.example/json"]);
});

test("RoutedModel streams through the SSE surface chosen by the router", async () => {
  const requestUrls: string[] = [];

  const model = new TestRoutedModel({
    router: new StaticModelSurfaceRouter({
      complete: "json-surface",
      stream: "stream-surface",
    }),
    surfaces: [
      {
        id: "stream-surface",
        transport: "http-sse",
        createRequest() {
          return {
            path: "/stream",
            body: {
              mode: "stream",
            },
          };
        },
        createStreamParser() {
          return new CollectingParser();
        },
      },
    ],
    fetch: async (input) => {
      requestUrls.push(String(input));
      return createSseResponse(["data: hello \n\n", "data: world\n\n", "data: [DONE]\n\n"]);
    },
  });

  const chunks: ChatResponseChunk[] = [];
  for await (const chunk of model.stream(makeChatRequest())) {
    chunks.push(chunk);
  }

  assert.deepEqual(requestUrls, ["https://provider.example/stream"]);
  assert.deepEqual(chunks, [
    {
      type: "content_delta",
      text: "hello",
    },
    {
      type: "content_delta",
      text: "world",
    },
    {
      type: "done",
      response: {
        id: "stream-1",
        content: [{ type: "text", text: "helloworld" }],
        stopReason: "end_turn",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
        },
      },
    },
  ]);
});

test("RoutedModel forwards abort signals into provider session resolution and fetch", async () => {
  let resolvedSignal: AbortSignal | undefined;
  let fetchSignal: AbortSignal | undefined;

  const model = new TestRoutedModel({
    router: new StaticModelSurfaceRouter({
      complete: "json-surface",
      stream: "stream-surface",
    }),
    providerSessionResolver: {
      async resolve(signal?: AbortSignal): Promise<ResolvedProviderSession> {
        resolvedSignal = signal;

        return {
          credential: {
            kind: "session-token",
            value: "session-token",
          },
        };
      },
    },
    surfaces: [
      {
        id: "json-surface",
        transport: "http-json",
        createRequest() {
          return {
            path: "/json",
            body: {
              mode: "complete",
            },
          };
        },
        parseResponse() {
          return {
            id: "json-2",
            content: [{ type: "text", text: "ok" }],
            stopReason: "end_turn",
            usage: {
              inputTokens: 1,
              outputTokens: 1,
            },
          };
        },
      },
    ],
    fetch: async (_input, init) => {
      fetchSignal = init?.signal as AbortSignal | undefined;

      return new Response(
        JSON.stringify({
          text: "ok",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const controller = new AbortController();
  await model.complete(makeChatRequest(), {
    signal: controller.signal,
  });

  assert.equal(resolvedSignal, controller.signal);
  assert.equal(fetchSignal, controller.signal);
});
