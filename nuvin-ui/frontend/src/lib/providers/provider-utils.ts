import { LLMProvider, ModelInfo } from './llm-provider';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { GithubCopilotProvider } from './github-provider';

export type ProviderType = 'OpenAI' | 'Anthropic' | 'OpenRouter' | 'GitHub';

// Re-export ModelInfo for convenience
export type { ModelInfo } from './llm-provider';

export interface LLMProviderConfig {
  type: ProviderType;
  apiKey: string;
  name?: string;
}

/**
 * Creates a provider instance based on the configuration
 */
export function createProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.type) {
    case 'OpenAI':
      return new OpenAIProvider(config.apiKey);
    case 'Anthropic':
      return new AnthropicProvider(config.apiKey);
    case 'OpenRouter':
      return new OpenRouterProvider(config.apiKey);
    case 'GitHub':
      return new GithubCopilotProvider(config.apiKey);
    default:
      throw new Error(`Unsupported provider type: ${config.type}`);
  }
}

/**
 * Fetches models from a provider with error handling
 */
export async function fetchProviderModels(config: LLMProviderConfig): Promise<ModelInfo[]> {
  try {
    const provider = createProvider(config);
    return await provider.getModels();
  } catch (error) {
    console.error(`Failed to fetch models for ${config.type}:`, error);
    throw error;
  }
}

/**
 * Fetches models from multiple providers concurrently
 */
export async function fetchAllProviderModels(configs: LLMProviderConfig[]): Promise<Record<string, ModelInfo[]>> {
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

/**
 * Gets the default model for a provider type
 */
export function getDefaultModel(providerType: ProviderType): string {
  switch (providerType) {
    case 'OpenAI':
      return 'gpt-4o';
    case 'Anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'OpenRouter':
      return 'meta-llama/llama-3.2-3b-instruct:free';
    case 'GitHub':
      return 'gpt-4o';
    default:
      return '';
  }
}

/**
 * Formats model cost for display
 */
export function formatModelCost(inputCost?: number, outputCost?: number): string {
  if (inputCost === undefined || outputCost === undefined) {
    return 'Pricing unavailable';
  }

  if (inputCost === 0 && outputCost === 0) {
    return 'Free with subscription';
  }

  return `$${inputCost.toFixed(2)}/$${outputCost.toFixed(2)} per 1M tokens`;
}

/**
 * Formats context length for display
 */
export function formatContextLength(contextLength?: number): string {
  if (!contextLength) {
    return 'Unknown';
  }

  if (contextLength >= 1000) {
    return `${(contextLength / 1000).toFixed(0)}K tokens`;
  }

  return `${contextLength} tokens`;
}
