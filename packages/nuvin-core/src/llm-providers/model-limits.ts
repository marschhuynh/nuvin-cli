export type ModelLimits = {
  contextWindow: number;
  maxOutput?: number;
};

export type ModelInfo = {
  id: string;
  name?: string;
  limits?: ModelLimits;
  supportedEndpoints?: string[];
  [key: string]: string | number | ModelLimits | string[] | undefined | unknown;
};

type RawModelResponse = {
  [key: string]: string | number | undefined | unknown;
};

export function normalizeModelLimits(
  provider: string,
  model: RawModelResponse,
): ModelLimits | null {
  switch (provider.toLowerCase()) {
    case "github": {
      const capabilities = model.capabilities as
        | Record<string, unknown>
        | undefined;
      const limits = capabilities?.limits as
        | Record<string, unknown>
        | undefined;
      const contextWindow = limits?.max_context_window_tokens as
        | number
        | undefined;
      if (!contextWindow) return null;
      return {
        contextWindow,
        maxOutput: limits?.max_output_tokens as number | undefined,
      };
    }
    case "anthropic": {
      return getFallbackLimits("anthropic", model.id as string);
    }
    case "deepinfra": {
      const metadata = model.metadata as Record<string, unknown> | undefined;
      const contextLength = metadata?.context_length as number | undefined;
      if (!contextLength) return null;
      return {
        contextWindow: contextLength,
        maxOutput: metadata?.max_tokens as number | undefined,
      };
    }
    case "moonshot": {
      const contextLength = model.context_length as number | undefined;
      if (!contextLength) return null;
      return { contextWindow: contextLength };
    }
    case "openrouter": {
      const topProvider = model.top_provider as
        | Record<string, unknown>
        | undefined;
      const contextLength =
        (model.context_length as number | undefined) ??
        (topProvider?.context_length as number | undefined);
      if (!contextLength) return null;
      return {
        contextWindow: contextLength,
        maxOutput: topProvider?.max_completion_tokens as number | undefined,
      };
    }
    default: {
      const contextLength = model.context_length as number | undefined;
      if (!contextLength) return null;
      return { contextWindow: contextLength };
    }
  }
}

const FALLBACK_LIMITS: Record<string, Record<string, ModelLimits>> = {
  zai: {
    "glm-5": { contextWindow: 200000, maxOutput: 128000 },
    "glm-4.7": { contextWindow: 200000, maxOutput: 128000 },
    "glm-4.6": { contextWindow: 200000, maxOutput: 128000 },
    "glm-4.5": { contextWindow: 200000, maxOutput: 128000 },
  },
  openrouter: {
    "anthropic/claude-sonnet-4": { contextWindow: 200000, maxOutput: 16000 },
    "anthropic/claude-3.5-sonnet": { contextWindow: 200000, maxOutput: 8192 },
    "openai/gpt-4o": { contextWindow: 128000, maxOutput: 16384 },
    "openai/gpt-4.1": { contextWindow: 128000, maxOutput: 32768 },
    "openai/gpt-4o-mini": { contextWindow: 128000, maxOutput: 16384 },
    "google/gemini-pro-1.5": { contextWindow: 2097152, maxOutput: 8192 },
    "meta-llama/llama-3.1-70b-instruct": {
      contextWindow: 131072,
      maxOutput: 131072,
    },
  },
  github: {
    "gpt-4.1": { contextWindow: 128000, maxOutput: 16384 },
    "gpt-4o": { contextWindow: 128000, maxOutput: 16384 },
    "gpt-4o-mini": { contextWindow: 128000, maxOutput: 16384 },
    "claude-sonnet-4": { contextWindow: 200000, maxOutput: 16000 },
    "claude-3.5-sonnet": { contextWindow: 200000, maxOutput: 8192 },
    o1: { contextWindow: 200000, maxOutput: 100000 },
    "o1-mini": { contextWindow: 128000, maxOutput: 65536 },
  },
  deepinfra: {
    "meta-llama/Meta-Llama-3.1-70B-Instruct": {
      contextWindow: 131072,
      maxOutput: 131072,
    },
    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo": {
      contextWindow: 131072,
      maxOutput: 131072,
    },
    "Qwen/Qwen2.5-72B-Instruct": { contextWindow: 131072, maxOutput: 131072 },
  },
  moonshot: {
    "moonshot-v1-8k": { contextWindow: 8192 },
    "moonshot-v1-32k": { contextWindow: 32768 },
    "moonshot-v1-128k": { contextWindow: 131072 },
    "kimi-k2-turbo-preview": { contextWindow: 262144 },
  },
  anthropic: {
    "claude-opus-4-5-20251101": { contextWindow: 200000, maxOutput: 16000 },
    "claude-haiku-4-5-20251001": { contextWindow: 200000, maxOutput: 16000 },
    "claude-sonnet-4-5-20250929": { contextWindow: 200000, maxOutput: 16000 },
    "claude-opus-4-1-20250805": { contextWindow: 200000, maxOutput: 16000 },
    "claude-opus-4-20250514": { contextWindow: 200000, maxOutput: 16000 },
    "claude-sonnet-4-20250514": { contextWindow: 200000, maxOutput: 16000 },
    "claude-3-7-sonnet-20250219": { contextWindow: 200000, maxOutput: 8192 },
    "claude-3-5-haiku-20241022": { contextWindow: 200000, maxOutput: 8192 },
    "claude-3-haiku-20240307": { contextWindow: 200000, maxOutput: 4096 },
    "claude-3-opus-20240229": { contextWindow: 200000, maxOutput: 4096 },
    "claude-sonnet-4-5": { contextWindow: 200000, maxOutput: 16000 },
    "claude-3-5-sonnet-20241022": { contextWindow: 200000, maxOutput: 8192 },
  },
};

export function getFallbackLimits(
  provider: string,
  model: string,
): ModelLimits | null {
  const providerLimits = FALLBACK_LIMITS[provider.toLowerCase()];
  if (!providerLimits) return null;
  return providerLimits[model] ?? null;
}

export function normalizeModelInfo(
  provider: string,
  model: RawModelResponse,
): ModelInfo {
  const id = model.id as string;
  let name = (model.name as string | undefined) ?? id;

  if (provider.toLowerCase() === "anthropic" && model.display_name) {
    name = model.display_name as string;
  }

  let limits: ModelLimits | null = null;

  if (model.limits && typeof model.limits === "object") {
    const configLimits = model.limits as Record<string, unknown>;
    if (
      configLimits.contextWindow &&
      typeof configLimits.contextWindow === "number"
    ) {
      limits = {
        contextWindow: configLimits.contextWindow,
        ...(typeof configLimits.maxOutput === "number" && {
          maxOutput: configLimits.maxOutput,
        }),
      };
    }
  }

  if (!limits) {
    limits = normalizeModelLimits(provider, model);
  }

  const supportedEndpoints =
    (model.supported_endpoints as string[] | undefined) ??
    (model.capable_endpoints as string[] | undefined);

  return {
    id,
    name,
    ...(limits ? { limits } : {}),
    ...(supportedEndpoints ? { supportedEndpoints } : {}),
  };
}

export function deduplicateModels(models: ModelInfo[]): ModelInfo[] {
  const uniqueModels = new Map<string, ModelInfo>();
  for (const model of models) {
    if (!uniqueModels.has(model.id)) {
      uniqueModels.set(model.id, model);
    }
  }
  return Array.from(uniqueModels.values());
}
