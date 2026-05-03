import { toChatRequest, toModelRequest } from "../formats/message-format.ts";
import { toOpenAiResponsesRequest } from "../formats/provider-adapters.ts";
import { throwIfAborted } from "../shared/abort.ts";
import type {
  BaseChatModelOptions,
  ChatRequest,
  ChatResponse,
  ChatResponseChunk,
  ModelExecutionOptions,
  ProviderCredential,
} from "../shared/types.ts";
import { StaticModelSurfaceRouter } from "./model-surface-router.ts";
import type { ModelWebSocket, WebSocketFactory } from "./model-transports.ts";
import { iterateWebSocketMessages, waitForWebSocketOpen } from "./model-transports.ts";
import {
  createOpenAiApiError,
  createOpenAiResponsesStreamParser,
  createOpenAiResponsesWebSocketEvent,
  createOpenAiSurfaces,
  OPENAI_CHAT_COMPLETIONS_STREAM_SURFACE,
  OPENAI_CHAT_COMPLETIONS_SURFACE,
  OPENAI_RESPONSES_STREAM_SURFACE,
  OPENAI_RESPONSES_SURFACE,
  OPENAI_RESPONSES_WEBSOCKET_SURFACE,
  OpenAiApiError,
  OpenAiResponsesStreamError,
} from "./openai-surfaces.ts";
import type { ProviderAdapter, ProviderHeaderContext } from "./provider-adapter.ts";
import {
  resolveApiCredential,
  resolveSessionBaseUrl,
  trimTrailingSlashes,
} from "./provider-adapter.ts";
import type {
  ProviderRequestMutator,
  ProviderSessionResolver,
  ResolvedProviderSession,
} from "./provider-session.ts";
import { type ProviderSessionManager, prepareProviderRequest } from "./provider-session.ts";
import { RoutedModel } from "./routed-model.ts";

export type { WebSocketFactory } from "./model-transports.ts";
export { OpenAiApiError };

export interface OpenAiRequestHeadersContext {
  request?: ChatRequest;
  body: unknown;
  credential: ProviderCredential;
  session?: ResolvedProviderSession;
  stream: boolean;
}

export type OpenAiHeaderResolver = (
  context: OpenAiRequestHeadersContext,
) => Promise<Record<string, string>> | Record<string, string>;

export interface OpenAiModelOptions extends Partial<BaseChatModelOptions> {
  apiKey?: string;
  baseUrl?: string;
  chatCompletionsPath?: string;
  responsesPath?: string;
  fetch?: typeof globalThis.fetch;
  providerSessionResolver?: ProviderSessionResolver;
  requestMutators?: ProviderRequestMutator[];
  headerResolver?: OpenAiHeaderResolver;
  sessionManager?: ProviderSessionManager;
  webSocketFactory?: WebSocketFactory;
}

interface PreparedResponsesSocketRequest {
  baseUrl: string;
  credential: ProviderCredential;
  request: ChatRequest;
  session?: ResolvedProviderSession;
}

interface ResponsesSocketSessionState {
  connecting?: Promise<ModelWebSocket>;
  lastResponseId?: string;
  pending: Promise<void>;
  socket?: ModelWebSocket;
}

class OpenAiProviderAdapter implements ProviderAdapter {
  private readonly headerResolver?: OpenAiHeaderResolver;

  constructor(headerResolver?: OpenAiHeaderResolver) {
    this.headerResolver = headerResolver;
  }

  createMissingCredentialError(): Error {
    return new Error("OpenAiModel requires an apiKey or providerSessionResolver");
  }

  async createHeaders(
    context: ProviderHeaderContext,
    options: {
      accept: string;
      includeContentType?: boolean;
    },
  ): Promise<Headers> {
    const headers = new Headers();
    headers.set("accept", options.accept);
    headers.set("authorization", `Bearer ${context.credential.value}`);

    if (options.includeContentType !== false) {
      headers.set("content-type", "application/json");
    }

    const extraHeaders = await this.headerResolver?.({
      body: context.body,
      credential: context.credential,
      request: context.request,
      session: context.session,
      stream: context.stream,
    });

    for (const [name, value] of Object.entries(extraHeaders ?? {})) {
      headers.set(name, value);
    }

    return headers;
  }

  mapApiError(error: Error): Error {
    return error;
  }

  resolveBaseUrl(defaultBaseUrl: string, session: ResolvedProviderSession | undefined): string {
    return resolveSessionBaseUrl(defaultBaseUrl, session);
  }

  resolveCredential(
    apiKey: string | undefined,
    session: ResolvedProviderSession | undefined,
  ): ProviderCredential | undefined {
    return resolveApiCredential(apiKey, session);
  }

  async toApiError(response: Response): Promise<Error> {
    return await createOpenAiApiError(response);
  }
}

export class OpenAiModel extends RoutedModel {
  private static readonly sharedResponsesSocketSessions = new Map<
    string,
    ResponsesSocketSessionState
  >();
  protected readonly chatCompletionsPath: string;
  protected readonly responsesPath: string;

  constructor(options: OpenAiModelOptions = {}) {
    const model = options.model ?? "gpt-4o";
    const maxTokens = options.maxTokens ?? 16384;
    const chatCompletionsPath = options.chatCompletionsPath ?? "/chat/completions";
    const responsesPath = options.responsesPath ?? "/responses";

    super({
      apiKey: options.apiKey,
      baseUrl: trimTrailingSlashes(options.baseUrl ?? "https://api.openai.com/v1"),
      fetch: options.fetch,
      maxTokens,
      model,
      reasoning: options.reasoning,
      providerAdapter: new OpenAiProviderAdapter(options.headerResolver),
      providerSessionResolver: options.providerSessionResolver,
      requestMutators: options.requestMutators,
      router: new StaticModelSurfaceRouter({
        complete: OPENAI_CHAT_COMPLETIONS_SURFACE,
        stream: OPENAI_CHAT_COMPLETIONS_STREAM_SURFACE,
      }),
      sessionManager: options.sessionManager,
      surfaces: createOpenAiSurfaces({
        chatCompletionsPath,
        responsesPath,
      }),
      webSocketFactory: options.webSocketFactory,
    });

    this.chatCompletionsPath = chatCompletionsPath;
    this.responsesPath = responsesPath;
  }

  protected completeViaChatCompletionsSurface(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): Promise<ChatResponse> {
    return this.completeViaSurface(request, OPENAI_CHAT_COMPLETIONS_SURFACE, options);
  }

  protected completeViaResponsesSurface(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): Promise<ChatResponse> {
    return this.completeViaSurface(request, OPENAI_RESPONSES_SURFACE, options);
  }

  protected completeViaResponsesWebSocketSurface(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): Promise<ChatResponse> {
    return this.completeViaSurface(request, OPENAI_RESPONSES_WEBSOCKET_SURFACE, options);
  }

  protected streamViaChatCompletionsSurface(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    return this.streamViaSurface(request, OPENAI_CHAT_COMPLETIONS_STREAM_SURFACE, options);
  }

  protected streamViaResponsesSurface(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    return this.streamViaSurface(request, OPENAI_RESPONSES_STREAM_SURFACE, options);
  }

  protected streamViaResponsesWebSocketSurface(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    return this.streamViaSurface(request, OPENAI_RESPONSES_WEBSOCKET_SURFACE, options);
  }

  async chatComplete(request: ChatRequest, options?: ModelExecutionOptions): Promise<ChatResponse> {
    try {
      return await this.completeViaChatCompletionsSurface(request, options as never);
    } catch (error) {
      if (error instanceof OpenAiApiError) {
        throw this.mapApiError(error);
      }

      throw error;
    }
  }

  async response(request: ChatRequest, options?: ModelExecutionOptions): Promise<ChatResponse> {
    try {
      return await this.completeViaResponsesSurface(request, options as never);
    } catch (error) {
      if (error instanceof OpenAiApiError) {
        throw this.mapApiError(error);
      }

      throw error;
    }
  }

  async responseSocket(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): Promise<ChatResponse> {
    try {
      let finalResponse: ChatResponse | undefined;

      for await (const chunk of this.responseSocketStream(request, options)) {
        if (chunk.type === "done") {
          finalResponse = chunk.response;
        }
      }

      if (!finalResponse) {
        throw new Error("Responses WebSocket request did not produce a final response");
      }

      return finalResponse;
    } catch (error) {
      if (error instanceof OpenAiApiError) {
        throw this.mapApiError(error);
      }

      throw error;
    }
  }

  async *chatStream(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    try {
      yield* this.streamViaChatCompletionsSurface(request, options as never);
    } catch (error) {
      if (error instanceof OpenAiApiError) {
        throw this.mapApiError(error);
      }

      throw error;
    }
  }

  async *responseStream(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    try {
      yield* this.streamViaResponsesSurface(request, options as never);
    } catch (error) {
      if (error instanceof OpenAiApiError) {
        throw this.mapApiError(error);
      }

      throw error;
    }
  }

  async *responseSocketStream(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    try {
      yield* this.streamViaPersistentResponsesSocket(request, options);
    } catch (error) {
      if (error instanceof OpenAiApiError) {
        throw this.mapApiError(error);
      }

      throw error;
    }
  }

  override complete(request: ChatRequest, options?: ModelExecutionOptions): Promise<ChatResponse> {
    return this.chatComplete(request, options);
  }

  override stream(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    return this.chatStream(request, options);
  }

  private getResponsesSocketSessionState(sessionId: string): ResponsesSocketSessionState {
    const sessionKey = this.getResponsesSocketSessionKey(sessionId);
    let sessionState = OpenAiModel.sharedResponsesSocketSessions.get(sessionKey);

    if (!sessionState) {
      sessionState = {
        pending: Promise.resolve(),
      };
      OpenAiModel.sharedResponsesSocketSessions.set(sessionKey, sessionState);
    }

    return sessionState;
  }

  private getResponsesSocketSessionKey(sessionId: string): string {
    return `${trimTrailingSlashes(this.baseUrl)}${this.responsesPath}::${sessionId}`;
  }

  private async acquireResponsesSocketLock(
    sessionState: ResponsesSocketSessionState,
  ): Promise<() => void> {
    const previous = sessionState.pending.catch(() => {});
    let releasePending: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      releasePending = resolve;
    });

    sessionState.pending = previous.then(() => current);
    await previous;

    return () => {
      releasePending?.();
    };
  }

  private async prepareResponsesSocketRequest(
    request: ChatRequest,
    signal?: AbortSignal,
  ): Promise<PreparedResponsesSocketRequest> {
    const resolvedRequest = this.applyModelDefaults(request);
    const modelRequest = toModelRequest(resolvedRequest);
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

  private buildResponsesSocketEvent(
    request: ChatRequest,
    sessionState: ResponsesSocketSessionState,
    options: {
      forceFullReplay?: boolean;
    } = {},
  ): {
    event: Record<string, unknown>;
    previousResponseId?: string;
  } {
    if (!options.forceFullReplay) {
      const checkpoint = this.findResponsesSocketCheckpoint(request);

      if (
        checkpoint &&
        sessionState.lastResponseId &&
        checkpoint.responseId === sessionState.lastResponseId
      ) {
        const incrementalInput = toOpenAiResponsesRequest({
          ...request,
          messages: request.messages.slice(checkpoint.messageIndex + 1),
        }).input;

        return {
          event: createOpenAiResponsesWebSocketEvent(request, {
            input: incrementalInput,
            previousResponseId: checkpoint.responseId,
          }),
          previousResponseId: checkpoint.responseId,
        };
      }
    }

    return {
      event: createOpenAiResponsesWebSocketEvent(request),
    };
  }

  private findResponsesSocketCheckpoint(request: ChatRequest):
    | {
        messageIndex: number;
        responseId: string;
      }
    | undefined {
    for (let index = request.messages.length - 1; index >= 0; index -= 1) {
      const message = request.messages[index];
      const responseId =
        message.role === "assistant" ? message.providerState?.openaiResponsesResponseId : undefined;

      if (responseId) {
        return {
          messageIndex: index,
          responseId,
        };
      }
    }

    return undefined;
  }

  private shouldRetryResponsesSocketRequest(error: unknown): boolean {
    return (
      error instanceof OpenAiResponsesStreamError &&
      (error.code === "previous_response_not_found" ||
        error.code === "websocket_connection_limit_reached")
    );
  }

  private invalidateResponsesSocketSession(sessionState: ResponsesSocketSessionState): void {
    const socket = sessionState.socket;

    sessionState.socket = undefined;
    sessionState.connecting = undefined;
    sessionState.lastResponseId = undefined;

    if (socket?.readyState === WebSocket.OPEN) {
      socket.close(1000, "reset");
    }
  }

  private async getOrCreateResponsesSocket(
    _sessionId: string,
    sessionState: ResponsesSocketSessionState,
    preparedRequest: PreparedResponsesSocketRequest,
    requestBody: unknown,
    signal?: AbortSignal,
  ): Promise<ModelWebSocket> {
    if (sessionState.socket?.readyState === WebSocket.OPEN) {
      return sessionState.socket;
    }

    if (sessionState.connecting) {
      return await sessionState.connecting;
    }

    sessionState.connecting = (async () => {
      const headers = await this.createHeaders(
        {
          request: preparedRequest.request,
          body: requestBody,
          credential: preparedRequest.credential,
          session: preparedRequest.session,
          stream: true,
        },
        {
          accept: "application/json",
          includeContentType: false,
        },
      );

      headers.delete("accept");

      const socket = this.webSocketFactory({
        headers: Object.fromEntries(headers.entries()),
        url: `${preparedRequest.baseUrl}${this.responsesPath}`
          .replace(/^http:/, "ws:")
          .replace(/^https:/, "wss:"),
      });
      const clearSocket = (): void => {
        if (sessionState.socket === socket) {
          sessionState.socket = undefined;
          sessionState.lastResponseId = undefined;
        }
      };

      socket.addEventListener("close", clearSocket);

      try {
        throwIfAborted(signal);

        if (socket.readyState !== WebSocket.OPEN) {
          await waitForWebSocketOpen(socket, signal);
        }

        throwIfAborted(signal);
        sessionState.socket = socket;
        return socket;
      } catch (error) {
        clearSocket();

        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1000, "connect_failed");
        }

        throw error;
      }
    })();

    try {
      return await sessionState.connecting;
    } finally {
      sessionState.connecting = undefined;
    }
  }

  private async *streamViaPersistentResponsesSocket(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    const resolvedRequest = this.applyModelDefaults(request);
    const sessionState = this.getResponsesSocketSessionState(resolvedRequest.metadata.sessionId);
    const releaseLock = await this.acquireResponsesSocketLock(sessionState);

    try {
      const initialAttempt = this.buildResponsesSocketEvent(resolvedRequest, sessionState);

      try {
        yield* this.streamViaResponsesSocketAttempt(
          resolvedRequest.metadata.sessionId,
          sessionState,
          resolvedRequest,
          initialAttempt.event,
          options?.signal,
        );
        return;
      } catch (error) {
        if (!initialAttempt.previousResponseId || !this.shouldRetryResponsesSocketRequest(error)) {
          this.invalidateResponsesSocketSession(sessionState);
          throw error;
        }
      }

      this.invalidateResponsesSocketSession(sessionState);
      const fallbackAttempt = this.buildResponsesSocketEvent(resolvedRequest, sessionState, {
        forceFullReplay: true,
      });

      yield* this.streamViaResponsesSocketAttempt(
        resolvedRequest.metadata.sessionId,
        sessionState,
        resolvedRequest,
        fallbackAttempt.event,
        options?.signal,
      );
    } finally {
      releaseLock();
    }
  }

  private async *streamViaResponsesSocketAttempt(
    sessionId: string,
    sessionState: ResponsesSocketSessionState,
    request: ChatRequest,
    event: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncIterable<ChatResponseChunk> {
    const preparedRequest = await this.prepareResponsesSocketRequest(request, signal);
    const socket = await this.getOrCreateResponsesSocket(
      sessionId,
      sessionState,
      preparedRequest,
      event,
      signal,
    );
    const parser = createOpenAiResponsesStreamParser(request);

    throwIfAborted(signal);
    socket.send(JSON.stringify(event));

    for await (const message of iterateWebSocketMessages(socket, signal)) {
      const chunks = parser.consumeWebSocketEvent?.(message) ?? [];
      yield* chunks;

      if (parser.isDone?.()) {
        break;
      }
    }

    if (!parser.isDone?.()) {
      throw new Error("Responses WebSocket closed before response.completed");
    }

    const response = parser.finish();
    const responseId = response.providerState?.openaiResponsesResponseId ?? response.id;

    if (responseId) {
      sessionState.lastResponseId = responseId;
    }

    yield {
      type: "done",
      response,
    };
  }
}
