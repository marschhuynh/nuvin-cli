import { toChatRequest, toModelRequest } from "../formats/message-format.ts";
import { throwIfAborted } from "../shared/abort.ts";
import type {
  ChatRequest,
  ChatResponse,
  ChatResponseChunk,
  EngineChatModel,
  ModelExecutionOptions,
  ReasoningConfig,
} from "../shared/types.ts";
import type { ModelSurfaceRouter } from "./model-surface-router.ts";
import type { WebSocketFactory } from "./model-transports.ts";
import {
  createDefaultWebSocketFactory,
  iterateSseEvents,
  iterateWebSocketMessages,
  waitForWebSocketOpen,
} from "./model-transports.ts";
import type { ProviderAdapter, ProviderHeaderContext } from "./provider-adapter.ts";
import type {
  ProviderRequestMutator,
  ProviderSessionResolver,
  ResolvedProviderSession,
} from "./provider-session.ts";
import { ProviderSessionManager, prepareProviderRequest } from "./provider-session.ts";

export interface RoutedModelStreamParser {
  consumeSseEvent?(rawEvent: string): ChatResponseChunk[];
  consumeWebSocketEvent?(event: Record<string, unknown>): ChatResponseChunk[];
  finish(): ChatResponse;
  isDone?(): boolean;
}

export interface RoutedModelSurfaceRequest {
  accept?: string;
  body?: unknown;
  headers?: Record<string, string>;
  initialEvent?: unknown;
  path?: string;
  url?: string;
}

export interface RoutedModelSurface {
  id: string;
  transport: "http-json" | "http-sse" | "websocket";
  createRequest(request: ChatRequest): RoutedModelSurfaceRequest;
  createStreamParser?(request: ChatRequest): RoutedModelStreamParser;
  parseResponse?(payload: unknown, request: ChatRequest): ChatResponse;
}

export interface RoutedModelOptions {
  apiKey?: string;
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  model: string;
  maxTokens?: number;
  reasoning?: ReasoningConfig;
  providerAdapter: ProviderAdapter;
  providerSessionResolver?: ProviderSessionResolver;
  requestMutators?: ProviderRequestMutator[];
  router: ModelSurfaceRouter;
  sessionManager?: ProviderSessionManager;
  surfaces: RoutedModelSurface[];
  webSocketFactory?: WebSocketFactory;
}

interface PreparedChatRequest {
  baseUrl: string;
  credential: NonNullable<ReturnType<ProviderAdapter["resolveCredential"]>>;
  request: ChatRequest;
  session?: ResolvedProviderSession;
}

export class RoutedModel implements EngineChatModel {
  public readonly model: string;
  public readonly maxTokens: number;
  protected readonly reasoning?: ReasoningConfig;
  protected readonly apiKey?: string;
  protected readonly baseUrl: string;
  protected readonly fetchImpl: typeof globalThis.fetch;
  protected readonly providerAdapter: ProviderAdapter;
  protected readonly requestMutators: ProviderRequestMutator[];
  protected readonly router: ModelSurfaceRouter;
  protected readonly sessionManager?: ProviderSessionManager;
  protected readonly webSocketFactory: WebSocketFactory;

  private readonly surfaces = new Map<string, RoutedModelSurface>();

  constructor(options: RoutedModelOptions) {
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 16384;
    this.reasoning = options.reasoning ? structuredClone(options.reasoning) : undefined;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.providerAdapter = options.providerAdapter;
    this.requestMutators = options.requestMutators ?? [];
    this.router = options.router;
    this.sessionManager =
      options.sessionManager ??
      (options.providerSessionResolver
        ? new ProviderSessionManager(options.providerSessionResolver)
        : undefined);
    this.webSocketFactory = options.webSocketFactory ?? createDefaultWebSocketFactory();

    for (const surface of options.surfaces) {
      this.surfaces.set(surface.id, surface);
    }
  }

  complete(request: ChatRequest, options?: ModelExecutionOptions): Promise<ChatResponse> {
    return this.completeViaRouter(request, options);
  }

  stream(request: ChatRequest, options?: ModelExecutionOptions): AsyncIterable<ChatResponseChunk> {
    return this.streamViaRouter(request, options);
  }

  protected async completeViaRouter(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): Promise<ChatResponse> {
    const resolvedRequest = this.applyModelDefaults(request);
    const surfaceId = await this.router.selectSurface(resolvedRequest, { mode: "complete" });
    return this.completeViaSurface(resolvedRequest, surfaceId, options);
  }

  protected async *streamViaRouter(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    const resolvedRequest = this.applyModelDefaults(request);
    const surfaceId = await this.router.selectSurface(resolvedRequest, { mode: "stream" });
    yield* this.streamViaSurface(resolvedRequest, surfaceId, options);
  }

  protected async completeViaSurface(
    request: ChatRequest,
    surfaceId: string,
    options?: ModelExecutionOptions,
  ): Promise<ChatResponse> {
    const resolvedRequest = this.applyModelDefaults(request);
    const surface = this.getSurface(surfaceId);

    if (surface.transport === "http-json") {
      const response = await this.sendHttpSurfaceRequest(
        resolvedRequest,
        surface,
        false,
        options?.signal,
      );

      if (!response.ok) {
        throw await this.toApiError(response);
      }

      if (!surface.parseResponse) {
        throw new Error(`Surface ${surfaceId} does not support non-streaming responses`);
      }

      return surface.parseResponse(await response.json(), resolvedRequest);
    }

    let finalResponse: ChatResponse | undefined;

    for await (const chunk of this.streamViaSurface(resolvedRequest, surfaceId, options)) {
      if (chunk.type === "done") {
        finalResponse = chunk.response;
      }
    }

    if (!finalResponse) {
      throw new Error(`Surface ${surfaceId} did not produce a final response`);
    }

    return finalResponse;
  }

  protected async *streamViaSurface(
    request: ChatRequest,
    surfaceId: string,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    const resolvedRequest = this.applyModelDefaults(request);
    const surface = this.getSurface(surfaceId);

    if (surface.transport === "http-json") {
      yield {
        type: "done",
        response: await this.completeViaSurface(resolvedRequest, surfaceId, options),
      };
      return;
    }

    if (surface.transport === "http-sse") {
      yield* this.streamHttpSurface(resolvedRequest, surface, options?.signal);
      return;
    }

    yield* this.streamWebSocketSurface(resolvedRequest, surface, options?.signal);
  }

  protected async sendRawRequest(options: {
    accept?: string;
    body?: unknown;
    method: "GET" | "POST";
    path: string;
    signal?: AbortSignal;
  }): Promise<Response> {
    const attempt = async (): Promise<Response> => {
      const session = this.sessionManager
        ? await this.sessionManager.resolve(options.signal)
        : undefined;
      const credential = this.providerAdapter.resolveCredential(this.apiKey, session);

      if (!credential) {
        throw this.createMissingCredentialError();
      }

      const headers = await this.createHeaders(
        {
          body: options.body,
          credential,
          session,
          stream: false,
        },
        {
          accept: options.accept ?? "application/json",
          includeContentType: options.method === "POST",
        },
      );

      return this.fetchImpl(
        `${this.providerAdapter.resolveBaseUrl(this.baseUrl, session)}${options.path}`,
        {
          method: options.method,
          headers,
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
          signal: options.signal,
        },
      );
    };

    const response = await attempt();

    if (response.status !== 401 || !this.sessionManager) {
      return response;
    }

    this.sessionManager.invalidate();
    return attempt();
  }

  protected createMissingCredentialError(): Error {
    return this.providerAdapter.createMissingCredentialError();
  }

  protected async createHeaders(
    context: ProviderHeaderContext,
    options: {
      accept: string;
      includeContentType?: boolean;
    },
  ): Promise<Headers> {
    return await this.providerAdapter.createHeaders(context, options);
  }

  protected mapApiError(error: Error): Error {
    return this.providerAdapter.mapApiError(error);
  }

  protected async toApiError(response: Response): Promise<Error> {
    return await this.providerAdapter.toApiError(response);
  }

  private getSurface(surfaceId: string): RoutedModelSurface {
    const surface = this.surfaces.get(surfaceId);

    if (!surface) {
      throw new Error(`Unknown model surface: ${surfaceId}`);
    }

    return surface;
  }

  private async prepareChatRequest(
    request: ChatRequest,
    signal?: AbortSignal,
  ): Promise<PreparedChatRequest> {
    const modelRequest = toModelRequest(request);
    const preparedRequest = await prepareProviderRequest(modelRequest, {
      sessionManager: this.sessionManager,
      requestMutators: this.requestMutators,
      signal,
    });
    const preparedChatRequest = toChatRequest(preparedRequest.request);
    const credential = this.providerAdapter.resolveCredential(this.apiKey, preparedRequest.session);

    if (!credential) {
      throw this.createMissingCredentialError();
    }

    return {
      baseUrl: this.providerAdapter.resolveBaseUrl(this.baseUrl, preparedRequest.session),
      credential,
      request: preparedChatRequest,
      session: preparedRequest.session,
    };
  }

  protected applyModelDefaults(request: ChatRequest): ChatRequest {
    return {
      ...structuredClone(request),
      ...(request.reasoning === undefined && this.reasoning !== undefined
        ? { reasoning: structuredClone(this.reasoning) }
        : {}),
    };
  }

  private async sendHttpSurfaceRequest(
    request: ChatRequest,
    surface: RoutedModelSurface,
    stream: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    const attempt = async (): Promise<Response> => {
      const preparedRequest = await this.prepareChatRequest(request, signal);
      const surfaceRequest = surface.createRequest(preparedRequest.request);

      if (!surfaceRequest.path) {
        throw new Error(`Surface ${surface.id} did not provide an HTTP path`);
      }

      const headers = await this.createHeaders(
        {
          request: preparedRequest.request,
          body: surfaceRequest.body,
          credential: preparedRequest.credential,
          session: preparedRequest.session,
          stream,
        },
        {
          accept: surfaceRequest.accept ?? (stream ? "text/event-stream" : "application/json"),
          includeContentType: surfaceRequest.body !== undefined,
        },
      );

      for (const [name, value] of Object.entries(surfaceRequest.headers ?? {})) {
        headers.set(name, value);
      }

      return this.fetchImpl(`${preparedRequest.baseUrl}${surfaceRequest.path}`, {
        method: "POST",
        headers,
        ...(surfaceRequest.body !== undefined ? { body: JSON.stringify(surfaceRequest.body) } : {}),
        signal,
      });
    };

    const response = await attempt();

    if (response.status !== 401 || !this.sessionManager) {
      return response;
    }

    this.sessionManager.invalidate();
    return attempt();
  }

  private async *streamHttpSurface(
    request: ChatRequest,
    surface: RoutedModelSurface,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatResponseChunk> {
    const response = await this.sendHttpSurfaceRequest(request, surface, true, signal);

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const parser = surface.createStreamParser?.(request);

    if (!parser?.consumeSseEvent) {
      throw new Error(`Surface ${surface.id} cannot parse SSE events`);
    }

    for await (const rawEvent of iterateSseEvents(response, signal)) {
      yield* parser.consumeSseEvent(rawEvent);
    }

    yield {
      type: "done",
      response: parser.finish(),
    };
  }

  private async *streamWebSocketSurface(
    request: ChatRequest,
    surface: RoutedModelSurface,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatResponseChunk> {
    const preparedRequest = await this.prepareChatRequest(request, signal);
    const surfaceRequest = surface.createRequest(preparedRequest.request);
    const parser = surface.createStreamParser?.(request);

    if (!parser?.consumeWebSocketEvent) {
      throw new Error(`Surface ${surface.id} cannot parse WebSocket events`);
    }

    const socketUrl =
      surfaceRequest.url ??
      (surfaceRequest.path
        ? `${preparedRequest.baseUrl}${surfaceRequest.path}`
            .replace(/^http:/, "ws:")
            .replace(/^https:/, "wss:")
        : undefined);

    if (!socketUrl) {
      throw new Error(`Surface ${surface.id} did not provide a WebSocket URL or path`);
    }

    const headers = await this.createHeaders(
      {
        request: preparedRequest.request,
        body: surfaceRequest.initialEvent,
        credential: preparedRequest.credential,
        session: preparedRequest.session,
        stream: true,
      },
      {
        accept: surfaceRequest.accept ?? "application/json",
        includeContentType: false,
      },
    );

    for (const [name, value] of Object.entries(surfaceRequest.headers ?? {})) {
      headers.set(name, value);
    }

    headers.delete("accept");

    const socket = this.webSocketFactory({
      headers: Object.fromEntries(headers.entries()),
      url: socketUrl,
    });

    try {
      throwIfAborted(signal);

      if (socket.readyState !== WebSocket.OPEN) {
        await waitForWebSocketOpen(socket, signal);
      }

      throwIfAborted(signal);

      if (surfaceRequest.initialEvent !== undefined) {
        socket.send(JSON.stringify(surfaceRequest.initialEvent));
      }

      for await (const event of iterateWebSocketMessages(socket, signal)) {
        yield* parser.consumeWebSocketEvent(event);

        if (parser.isDone?.()) {
          break;
        }
      }

      yield {
        type: "done",
        response: parser.finish(),
      };
    } finally {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, signal?.aborted ? "aborted" : "completed");
      }
    }
  }
}
