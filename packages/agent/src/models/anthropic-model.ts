import type {
  BaseChatModelOptions,
  ChatRequest,
  ChatResponse,
  ChatResponseChunk,
  ModelExecutionOptions,
  ProviderCredential,
} from "../shared/types.ts";
import {
  ANTHROPIC_MESSAGES_STREAM_SURFACE,
  ANTHROPIC_MESSAGES_SURFACE,
  createAnthropicSurfaces,
} from "./anthropic-surface.ts";
import { StaticModelSurfaceRouter } from "./model-surface-router.ts";
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
import { RoutedModel } from "./routed-model.ts";

export interface AnthropicModelOptions extends Partial<BaseChatModelOptions> {
  apiKey?: string;
  baseUrl?: string;
  protocolVersion?: string;
  authScheme?: "bearer" | "x-api-key";
  fetch?: typeof globalThis.fetch;
  providerSessionResolver?: ProviderSessionResolver;
  requestMutators?: ProviderRequestMutator[];
  headerResolver?: AnthropicHeaderResolver;
}

export interface AnthropicRequestHeadersContext {
  request?: ChatRequest;
  body: unknown;
  credential: ProviderCredential;
  session?: ResolvedProviderSession;
  stream: boolean;
}

export type AnthropicHeaderResolver = (
  context: AnthropicRequestHeadersContext,
) => Promise<Record<string, string>> | Record<string, string>;

async function createHttpError(response: Response): Promise<Error> {
  const body = await response.text();
  const message = body.trim() || response.statusText || "Unknown provider error";

  return new Error(`Provider request failed with status ${response.status}: ${message}`);
}

class AnthropicProviderAdapter implements ProviderAdapter {
  private readonly authScheme: "bearer" | "x-api-key";
  private readonly headerResolver?: AnthropicHeaderResolver;
  private readonly protocolVersion: string;

  constructor(options: {
    authScheme: "bearer" | "x-api-key";
    headerResolver?: AnthropicHeaderResolver;
    protocolVersion: string;
  }) {
    this.authScheme = options.authScheme;
    this.headerResolver = options.headerResolver;
    this.protocolVersion = options.protocolVersion;
  }

  createMissingCredentialError(): Error {
    return new Error("AnthropicModel requires an apiKey or providerSessionResolver");
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
    headers.set("anthropic-version", this.protocolVersion);

    if (options.includeContentType !== false) {
      headers.set("content-type", "application/json");
    }

    if (this.authScheme === "bearer") {
      headers.set("authorization", `Bearer ${context.credential.value}`);
    } else {
      headers.set("x-api-key", context.credential.value);
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
    return await createHttpError(response);
  }
}

export class AnthropicModel extends RoutedModel {
  constructor(options: AnthropicModelOptions = {}) {
    super({
      apiKey: options.apiKey,
      baseUrl: trimTrailingSlashes(options.baseUrl ?? "https://api.anthropic.com"),
      fetch: options.fetch,
      maxTokens: options.maxTokens ?? 16384,
      model: options.model ?? "claude-sonnet-4-20250514",
      reasoning: options.reasoning,
      providerAdapter: new AnthropicProviderAdapter({
        authScheme: options.authScheme ?? "x-api-key",
        headerResolver: options.headerResolver,
        protocolVersion: options.protocolVersion ?? "2023-06-01",
      }),
      providerSessionResolver: options.providerSessionResolver,
      requestMutators: options.requestMutators,
      router: new StaticModelSurfaceRouter({
        complete: ANTHROPIC_MESSAGES_SURFACE,
        stream: ANTHROPIC_MESSAGES_STREAM_SURFACE,
      }),
      surfaces: createAnthropicSurfaces(),
    });
  }

  override complete(request: ChatRequest, options?: ModelExecutionOptions): Promise<ChatResponse> {
    return this.completeViaSurface(request, ANTHROPIC_MESSAGES_SURFACE, options);
  }

  override stream(
    request: ChatRequest,
    options?: ModelExecutionOptions,
  ): AsyncIterable<ChatResponseChunk> {
    return this.streamViaSurface(request, ANTHROPIC_MESSAGES_STREAM_SURFACE, options);
  }
}
