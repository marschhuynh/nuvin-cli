import type {
  BaseChatModelOptions,
  ChatRequest,
  ChatResponse,
  ChatResponseChunk,
  EngineChatModel,
  ModelExecutionOptions,
} from "../shared/types.ts";
import type { AnthropicModelOptions } from "./anthropic-model.ts";
import { AnthropicModel } from "./anthropic-model.ts";
import type { OpenAiHeaderResolver, WebSocketFactory } from "./openai-model.ts";
import { OpenAiModel } from "./openai-model.ts";
import { trimTrailingSlashes } from "./provider-adapter.ts";
import type { ProviderRequestMutator, ProviderSessionResolver } from "./provider-session.ts";

export const AVAILABLE_CHAT_MODEL_SURFACES = [
  "anthropic-messages",
  "openai-chat-completions",
  "openai-responses",
  "openai-responses-ws",
] as const;

export type ChatModelSurface = (typeof AVAILABLE_CHAT_MODEL_SURFACES)[number];
export type ChatModelAuthScheme = NonNullable<AnthropicModelOptions["authScheme"]>;

export interface ChatModelOptions extends Partial<BaseChatModelOptions> {
  apiKey?: string;
  baseUrl?: string;
  surface?: ChatModelSurface;
  authScheme?: ChatModelAuthScheme;
  fetch?: typeof globalThis.fetch;
  providerSessionResolver?: ProviderSessionResolver;
  requestMutators?: ProviderRequestMutator[];
  headerResolver?: OpenAiHeaderResolver;
  webSocketFactory?: WebSocketFactory;
}

function isAnthropicSurface(surface: ChatModelSurface): boolean {
  return surface === "anthropic-messages";
}

function resolveDefaultBaseUrl(surface: ChatModelSurface): string {
  return isAnthropicSurface(surface) ? "https://api.anthropic.com" : "https://api.openai.com/v1";
}

export class ChatModel implements EngineChatModel {
  public readonly model: string;
  public readonly maxTokens: number;
  public readonly surface: ChatModelSurface;

  private readonly anthropicDelegate?: AnthropicModel;
  private readonly openAiDelegate?: OpenAiModel;

  constructor(options: ChatModelOptions = {}) {
    this.model = options.model ?? "gpt-4o";
    this.maxTokens = options.maxTokens ?? 16384;
    this.surface = options.surface ?? "openai-chat-completions";

    const baseUrl = trimTrailingSlashes(options.baseUrl ?? resolveDefaultBaseUrl(this.surface));

    if (isAnthropicSurface(this.surface)) {
      this.anthropicDelegate = new AnthropicModel({
        apiKey: options.apiKey,
        authScheme: options.authScheme,
        baseUrl,
        fetch: options.fetch,
        maxTokens: this.maxTokens,
        model: this.model,
        reasoning: options.reasoning,
        providerSessionResolver: options.providerSessionResolver,
        requestMutators: options.requestMutators,
      });
      return;
    }

    this.openAiDelegate = new OpenAiModel({
      apiKey: options.apiKey,
      baseUrl,
      fetch: options.fetch,
      headerResolver: options.headerResolver,
      maxTokens: this.maxTokens,
      model: this.model,
      reasoning: options.reasoning,
      providerSessionResolver: options.providerSessionResolver,
      requestMutators: options.requestMutators,
      webSocketFactory: options.webSocketFactory,
    });
  }

  private getAnthropicDelegate(): AnthropicModel {
    if (!this.anthropicDelegate) {
      throw new Error(`Anthropic delegate is not initialized for surface: ${this.surface}`);
    }

    return this.anthropicDelegate;
  }

  private getOpenAiDelegate(): OpenAiModel {
    if (!this.openAiDelegate) {
      throw new Error(`OpenAI delegate is not initialized for surface: ${this.surface}`);
    }

    return this.openAiDelegate;
  }

  complete(request: ChatRequest, options?: ModelExecutionOptions): Promise<ChatResponse> {
    switch (this.surface) {
      case "anthropic-messages":
        return this.getAnthropicDelegate().complete(request, options);
      case "openai-responses":
        return this.getOpenAiDelegate().response(request, options);
      case "openai-responses-ws":
        return this.getOpenAiDelegate().responseSocket(request, options);
      default:
        return this.getOpenAiDelegate().chatComplete(request, options);
    }
  }

  stream(request: ChatRequest, options?: ModelExecutionOptions): AsyncIterable<ChatResponseChunk> {
    switch (this.surface) {
      case "anthropic-messages":
        return this.getAnthropicDelegate().stream(request, options);
      case "openai-responses":
        return this.getOpenAiDelegate().responseStream(request, options);
      case "openai-responses-ws":
        return this.getOpenAiDelegate().responseSocketStream(request, options);
      default:
        return this.getOpenAiDelegate().chatStream(request, options);
    }
  }
}
