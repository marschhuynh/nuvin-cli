import type { CLIConfig } from "@nuvin/config";
import { loadEnvConfig, mergeConfigs, pickActiveAuth, resolveProviderToken } from "@nuvin/config";
import type { ChatModelAuthScheme, ChatModelSurface } from "@nuvin/nuvin-core/models";
import { ChatModel } from "@nuvin/nuvin-core/models";
import type { ReasoningConfig } from "@nuvin/nuvin-core/shared";

type CreateChatModelOptions = {
  reasoning?: ReasoningConfig;
};

export type CreateChatModelResult = {
  chatModel: ChatModel;
  modelName: string;
};

const DEFAULT_MODEL = "glm-4.7";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic";
const DEFAULT_OPENAI_COMPAT_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

function defaultBaseUrlForSurface(surface: ChatModelSurface): string {
  return surface === "anthropic-messages"
    ? DEFAULT_ANTHROPIC_BASE_URL
    : DEFAULT_OPENAI_COMPAT_BASE_URL;
}

function defaultAuthSchemeForSurface(surface: ChatModelSurface): ChatModelAuthScheme | undefined {
  return surface === "anthropic-messages" ? "bearer" : undefined;
}

export function createChatModelFromConfig(
  config: CLIConfig,
  options: CreateChatModelOptions = {},
): CreateChatModelResult {
  const providerName = config.activeProvider;
  const provider = providerName && config.providers ? config.providers[providerName] : undefined;

  const apiKey =
    resolveProviderToken(config, providerName) ??
    (typeof config.apiKey === "string" ? config.apiKey : undefined);
  if (!apiKey) {
    throw new Error(
      "Missing api key. Set provider auth in config, top-level apiKey, or API_KEY env var.",
    );
  }

  const surface: ChatModelSurface = provider?.surface ?? "anthropic-messages";

  const baseUrl = provider?.baseUrl ?? defaultBaseUrlForSurface(surface);

  const activeAuth = pickActiveAuth(provider);
  const authScheme: ChatModelAuthScheme | undefined =
    activeAuth?.authScheme ?? defaultAuthSchemeForSurface(surface);

  const model = (typeof config.activeModel === "string" && config.activeModel) || DEFAULT_MODEL;

  const chatModel = new ChatModel({
    apiKey,
    authScheme,
    baseUrl,
    model,
    reasoning: options.reasoning,
    surface,
  });

  return {
    chatModel,
    modelName: chatModel.model,
  };
}

export function createChatModelFromEnv(
  options: CreateChatModelOptions = {},
): CreateChatModelResult {
  const envConfig = loadEnvConfig();
  const merged = mergeConfigs([envConfig]);
  return createChatModelFromConfig(merged, options);
}
