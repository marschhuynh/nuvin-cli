import type { LLMProvider, ModelInfo } from './types/base';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { GithubCopilotProvider } from './github-provider';
import { OpenAICompatibleProvider } from './openai-compatible-provider';

export enum PROVIDER_TYPES {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  OpenRouter = 'openrouter',
  GitHub = 'github',
  OpenAICompatible = 'openai-compatible',
}

export type ProviderType = PROVIDER_TYPES;

export type { ModelInfo } from './types/base';

export interface LLMProviderConfig {
  type: PROVIDER_TYPES;
  apiKey: string;
  name?: string;
  apiUrl?: string;
}

export function createProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.type) {
    case PROVIDER_TYPES.OpenAI:
      return new OpenAIProvider(config.apiKey);
    case PROVIDER_TYPES.Anthropic:
      return new AnthropicProvider(config.apiKey);
    case PROVIDER_TYPES.OpenRouter:
      return new OpenRouterProvider(config.apiKey);
    case PROVIDER_TYPES.GitHub:
      return new GithubCopilotProvider(config.apiKey);
    case PROVIDER_TYPES.OpenAICompatible:
      return new OpenAICompatibleProvider(config.apiKey, config.apiUrl);
    default:
      throw new Error(`Unsupported provider type: ${config.type}`);
  }
}

export async function fetchProviderModels(
  config: LLMProviderConfig,
): Promise<ModelInfo[]> {
  try {
    const provider = createProvider(config);
    return await provider.getModels();
  } catch (error) {
    console.error(`Failed to fetch models for ${config.type}:`, error);
    throw error;
  }
}

export async function fetchAllProviderModels(
  configs: LLMProviderConfig[],
): Promise<Record<string, ModelInfo[]>> {
  const results: Record<string, ModelInfo[]> = {};

  const promises = configs.map(async (config) => {
    try {
      const models = await fetchProviderModels(config);
      results[config.type] = models;
    } catch (error) {
      console.error(`Failed to fetch models for ${config.type}:`, error);
      results[config.type] = [];
    }
  });

  await Promise.allSettled(promises);
  return results;
}

export function getDefaultModel(providerType: ProviderType): string {
  switch (providerType) {
    case PROVIDER_TYPES.OpenAI:
      return 'gpt-4o';
    case PROVIDER_TYPES.Anthropic:
      return 'claude-3-5-sonnet-20241022';
    case PROVIDER_TYPES.OpenRouter:
      return 'meta-llama/llama-3.2-3b-instruct:free';
    case PROVIDER_TYPES.GitHub:
      return 'gpt-4o';
    case PROVIDER_TYPES.OpenAICompatible:
      return 'gpt-4o-mini';
    default:
      return '';
  }
}

export function formatModelCost(
  inputCost?: number,
  outputCost?: number,
): string {
  if (inputCost === undefined || outputCost === undefined) {
    return 'Pricing unavailable';
  }

  if (inputCost === 0 && outputCost === 0) {
    return 'Free with subscription';
  }

  return `$${inputCost.toFixed(2)}/$${outputCost.toFixed(2)} per 1M tokens`;
}

export function formatContextLength(contextLength?: number): string {
  if (!contextLength) {
    return 'Unknown';
  }

  if (contextLength >= 1000) {
    return `${(contextLength / 1000).toFixed(0)}K tokens`;
  }

  return `${contextLength} tokens`;
}

