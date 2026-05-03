import { randomUUID } from "node:crypto";

import { resolveOpenAiReasoningConfig } from "../shared/reasoning-config.ts";
import type {
  BaseChatModelOptions,
  ChatRequest,
  ChatResponse,
  ChatResponseChunk,
  ModelExecutionOptions,
  ModelInfo,
  ProviderSessionResolver,
  ResolvedProviderSession,
} from "../shared/types.ts";
import { AnthropicModel } from "./anthropic-model.ts";
import type { OpenAiModelOptions } from "./openai-model.ts";
import { OpenAiApiError, OpenAiModel } from "./openai-model.ts";

export type GitHubModelSurface =
  | "auto"
  | "anthropic-messages"
  | "openai-chat-completions"
  | "openai-responses"
  | "openai-responses-ws";

export interface GitHubModelOptions extends Partial<BaseChatModelOptions> {
  apiKey?: string;
  accessToken?: string;
  baseUrl?: string;
  surface?: GitHubModelSurface;
  githubApiUrl?: string;
  fetch?: typeof globalThis.fetch;
  editorVersion?: string;
  editorPluginVersion?: string;
  tokenExchangeApiVersion?: string;
  providerSessionResolver?: ProviderSessionResolver;
}

interface GitHubEndpointMap {
  api?: string;
  proxy?: string;
  "origin-tracker"?: string;
  telemetry?: string;
}

interface GitHubTokenExchangeResponse {
  token?: string;
  endpoints?: GitHubEndpointMap;
}

interface GitHubModelsResponse {
  data?: GitHubModelDefinition[];
}

interface GitHubModelDefinition {
  id: string;
  name?: string;
  supported_endpoints?: string[];
  capable_endpoints?: string[];
  capabilities?: {
    limits?: {
      max_context_window_tokens?: number;
      max_output_tokens?: number;
    };
  };
}

class GitHubAccessTokenResolver implements ProviderSessionResolver {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly githubApiUrl: string;
  private readonly tokenExchangeApiVersion: string;

  constructor(options: {
    accessToken: string;
    baseUrl: string;
    fetch: typeof globalThis.fetch;
    githubApiUrl: string;
    tokenExchangeApiVersion: string;
  }) {
    this.accessToken = options.accessToken;
    this.baseUrl = trimTrailingSlashes(options.baseUrl);
    this.fetchImpl = options.fetch;
    this.githubApiUrl = trimTrailingSlashes(options.githubApiUrl);
    this.tokenExchangeApiVersion = options.tokenExchangeApiVersion;
  }

  async resolve(signal?: AbortSignal): Promise<ResolvedProviderSession> {
    const response = await this.fetchImpl(`${this.githubApiUrl}/copilot_internal/v2/token`, {
      method: "GET",
      headers: new Headers({
        accept: "application/json",
        authorization: `Bearer ${this.accessToken}`,
        "editor-version": "vscode/1.106.1",
        "user-agent": "GitHubCopilotChat/0.33.1",
        "x-github-api-version": this.tokenExchangeApiVersion,
      }),
      signal,
    });

    if (!response.ok) {
      return {
        credential: {
          kind: "oauth-token",
          value: this.accessToken,
        },
        endpoints: {
          api: this.baseUrl,
        },
      };
    }

    const payload = (await response.json()) as GitHubTokenExchangeResponse;

    return {
      credential: {
        kind: "session-token",
        value: payload.token ?? this.accessToken,
      },
      endpoints: {
        api: payload.endpoints?.api ?? this.baseUrl,
        originTracker: payload.endpoints?.["origin-tracker"],
        proxy: payload.endpoints?.proxy,
        telemetry: payload.endpoints?.telemetry,
      },
    };
  }
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function createModelInfo(model: GitHubModelDefinition): ModelInfo {
  const supportedEndpoints = model.supported_endpoints ?? model.capable_endpoints;
  const maxContextWindow = model.capabilities?.limits?.max_context_window_tokens;
  const maxOutput = model.capabilities?.limits?.max_output_tokens;
  const limits =
    maxContextWindow !== undefined || maxOutput !== undefined
      ? {
          ...(maxContextWindow !== undefined ? { contextWindow: maxContextWindow } : {}),
          ...(maxOutput !== undefined ? { maxOutput } : {}),
        }
      : undefined;

  return {
    id: model.id,
    name: model.name ?? model.id,
    ...(limits ? { limits } : {}),
    ...(supportedEndpoints ? { supportedEndpoints } : {}),
  };
}

function deduplicateModels(models: ModelInfo[]): ModelInfo[] {
  const uniqueModels = new Map<string, ModelInfo>();

  for (const model of models) {
    if (!uniqueModels.has(model.id)) {
      uniqueModels.set(model.id, model);
    }
  }

  return Array.from(uniqueModels.values());
}

function hasUserPromptContent(content: unknown): boolean {
  if (typeof content === "string") {
    return content.trim().length > 0;
  }

  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((part) => {
    if (!part || typeof part !== "object") {
      return false;
    }

    const candidate = part as {
      text?: unknown;
      type?: unknown;
    };

    return (
      (candidate.type === "input_text" || candidate.type === "text") &&
      typeof candidate.text === "string" &&
      candidate.text.trim().length > 0
    );
  });
}

function isUserPromptEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const candidate = entry as {
    content?: unknown;
    role?: unknown;
    type?: unknown;
  };

  if (candidate.role !== "user") {
    return false;
  }

  if (candidate.type !== undefined && candidate.type !== "message") {
    return false;
  }

  return hasUserPromptContent(candidate.content);
}

function determineInitiator(body: unknown): "agent" | "user" {
  if (!body || typeof body !== "object") {
    return "agent";
  }

  const rawMessages =
    "messages" in body
      ? (body as { messages?: unknown[] }).messages
      : "input" in body
        ? (body as { input?: unknown[] }).input
        : undefined;

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return "agent";
  }

  return isUserPromptEntry(rawMessages[rawMessages.length - 1]) ? "user" : "agent";
}

function isUnsupportedApiForModel(message: string): boolean {
  return message.includes("unsupported_api_for_model");
}

function createResponseError(status: number, message: string): Error {
  if (status === 401 || status === 403) {
    return new Error("Authentication failed. Please check your API key.");
  }

  if (status === 408 || status === 429) {
    return new Error("Rate limit exceeded. Please try again later.");
  }

  if (status === 400) {
    return new Error(`Invalid request: ${message}`);
  }

  return new Error(message || `GitHub API error ${status}`);
}

export class GitHubModel extends OpenAiModel {
  private readonly anthropicDelegate: AnthropicModel;
  // private readonly editorPluginVersion: string;
  // private readonly editorVersion: string;
  private readonly modelEndpointCache = new Map<string, string[]>();
  private readonly surface: GitHubModelSurface;

  constructor(options: GitHubModelOptions = {}) {
    const baseUrl = trimTrailingSlashes(
      options.baseUrl ?? "https://api.individual.githubcopilot.com",
    );
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const providerSessionResolver =
      options.providerSessionResolver ??
      (options.accessToken
        ? new GitHubAccessTokenResolver({
            accessToken: options.accessToken,
            baseUrl,
            fetch: fetchImpl,
            githubApiUrl: options.githubApiUrl ?? "https://api.github.com",
            tokenExchangeApiVersion: options.tokenExchangeApiVersion ?? "2025-10-01",
          })
        : undefined);
    const editorVersion = options.editorVersion ?? "vscode/1.104.2";
    const editorPluginVersion = options.editorPluginVersion ?? "copilot-chat/0.31.3";
    const headerResolver: NonNullable<OpenAiModelOptions["headerResolver"]> = ({ body }) => {
      return {
        "editor-plugin-version": editorPluginVersion,
        "editor-version": editorVersion,
        "x-initiator": determineInitiator(body),
        "x-request-id": randomUUID(),
      };
    };
    const superOptions: OpenAiModelOptions = {
      apiKey: options.apiKey,
      baseUrl,
      fetch: fetchImpl,
      maxTokens: options.maxTokens,
      model: options.model,
      reasoning: options.reasoning,
      providerSessionResolver,
      requestMutators: options.requestMutators,
      headerResolver,
    };

    super(superOptions);

    // this.editorVersion = editorVersion;
    // this.editorPluginVersion = editorPluginVersion;
    this.surface = options.surface ?? "auto";
    this.anthropicDelegate = new AnthropicModel({
      apiKey: options.apiKey,
      authScheme: "bearer",
      baseUrl,
      fetch: fetchImpl,
      headerResolver,
      maxTokens: options.maxTokens,
      model: options.model,
      reasoning: options.reasoning,
      providerSessionResolver,
      requestMutators: options.requestMutators,
    });
  }

  protected override createMissingCredentialError(): Error {
    return new Error("GitHubModel requires an apiKey, accessToken, or providerSessionResolver");
  }

  private usesResponsesApi(model: string): boolean {
    const endpoints = this.modelEndpointCache.get(model);

    if (!endpoints) {
      return false;
    }

    return !endpoints.includes("/chat/completions") && endpoints.includes("/responses");
  }

  private shouldPreferResponsesApi(request: ChatRequest): boolean {
    const endpoints = this.modelEndpointCache.get(request.model);

    if (!endpoints) {
      return false;
    }

    if (resolveOpenAiReasoningConfig(request.reasoning)) {
      return endpoints.includes("/responses");
    }

    return this.usesResponsesApi(request.model);
  }

  private markModelAsResponsesOnly(model: string): void {
    this.modelEndpointCache.set(model, ["/responses"]);
  }

  protected override mapApiError(error: Error): Error {
    if (error instanceof OpenAiApiError) {
      return createResponseError(error.status, error.body || error.message);
    }

    return error;
  }

  private completeViaConfiguredSurface(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): Promise<ChatResponse> {
    switch (this.surface) {
      case "anthropic-messages":
        return this.anthropicDelegate.complete(request, options);
      case "openai-chat-completions":
        return this.chatComplete(request, options);
      case "openai-responses":
        return this.response(request, options);
      case "openai-responses-ws":
        return this.responseSocket(request, options);
      case "auto":
        return this.complete(request, options);
    }

    throw new Error(`Unsupported GitHub model surface: ${String(this.surface)}`);
  }

  private streamViaConfiguredSurface(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    switch (this.surface) {
      case "anthropic-messages":
        return this.anthropicDelegate.stream(request, options);
      case "openai-chat-completions":
        return this.chatStream(request, options);
      case "openai-responses":
        return this.responseStream(request, options);
      case "openai-responses-ws":
        return this.responseSocketStream(request, options);
      case "auto":
        return this.stream(request, options);
    }

    throw new Error(`Unsupported GitHub model surface: ${String(this.surface)}`);
  }

  override async complete(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): Promise<ChatResponse> {
    const resolvedRequest = this.applyModelDefaults(request);

    if (this.surface !== "auto") {
      return this.completeViaConfiguredSurface(resolvedRequest, options);
    }

    if (this.shouldPreferResponsesApi(resolvedRequest)) {
      return this.response(resolvedRequest, options);
    }

    try {
      return await this.completeViaChatCompletionsSurface(resolvedRequest, options);
    } catch (error) {
      if (error instanceof OpenAiApiError) {
        if (isUnsupportedApiForModel(error.body)) {
          this.markModelAsResponsesOnly(resolvedRequest.model);
          return this.response(resolvedRequest, options);
        }

        throw this.mapApiError(error);
      }

      throw error;
    }
  }

  override async *stream(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    const resolvedRequest = this.applyModelDefaults(request);

    if (this.surface !== "auto") {
      yield* this.streamViaConfiguredSurface(resolvedRequest, options);
      return;
    }

    if (this.shouldPreferResponsesApi(resolvedRequest)) {
      yield* this.responseStream(resolvedRequest, options);
      return;
    }

    try {
      yield* this.streamViaChatCompletionsSurface(resolvedRequest, options);
    } catch (error) {
      if (error instanceof OpenAiApiError) {
        if (isUnsupportedApiForModel(error.body)) {
          this.markModelAsResponsesOnly(resolvedRequest.model);
          yield* this.responseStream(resolvedRequest, options);
          return;
        }

        throw this.mapApiError(error);
      }

      throw error;
    }
  }

  async getModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await this.sendRawRequest({
      path: "/models",
      method: "GET",
      signal,
    });

    if (!response.ok) {
      throw this.mapApiError(await this.toApiError(response));
    }

    const payload = (await response.json()) as GitHubModelsResponse;
    const models = (payload.data ?? []).map((model) => {
      const normalized = createModelInfo(model);

      if (normalized.supportedEndpoints) {
        this.modelEndpointCache.set(normalized.id, normalized.supportedEndpoints);
      }

      return normalized;
    });

    return deduplicateModels(models);
  }
}
