import { OpenRouterProvider } from './openrouter-provider';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GithubCopilotProvider } from './github-provider';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import { DeepInfraProvider } from './deepinfra-provider';
import type { LLMProvider } from './types/base';
import type { ProviderConfig } from '@/types';
import { PROVIDER_TYPES } from './provider-utils';

export class ProviderFactory {
  constructor() {
    throw new Error('ProviderFactory is a static class and cannot be instantiated.');
  }
  static createProvider(config: ProviderConfig): LLMProvider {
    switch (config.type) {
      case PROVIDER_TYPES.OpenRouter:
        return new OpenRouterProvider(config.apiKey);
      case PROVIDER_TYPES.OpenAI:
        return new OpenAIProvider(config.apiKey);
      case PROVIDER_TYPES.Anthropic:
        return new AnthropicProvider(config.apiKey);
      case PROVIDER_TYPES.GitHub:
        return new GithubCopilotProvider(config);
      case PROVIDER_TYPES.OpenAICompatible:
        return new OpenAICompatibleProvider(config.apiKey, config.apiUrl);
      case PROVIDER_TYPES.DeepInfra:
        return new DeepInfraProvider(config.apiKey);
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }

  static getProviderTypes(): PROVIDER_TYPES[] {
    return [
      PROVIDER_TYPES.OpenRouter,
      PROVIDER_TYPES.OpenAI,
      PROVIDER_TYPES.Anthropic,
      PROVIDER_TYPES.GitHub,
      PROVIDER_TYPES.OpenAICompatible,
      PROVIDER_TYPES.DeepInfra,
    ];
  }

  static getProviderDisplayName(type: PROVIDER_TYPES): string {
    const displayNames: Record<PROVIDER_TYPES, string> = {
      [PROVIDER_TYPES.OpenRouter]: 'OpenRouter',
      [PROVIDER_TYPES.OpenAI]: 'OpenAI',
      [PROVIDER_TYPES.Anthropic]: 'Anthropic',
      [PROVIDER_TYPES.GitHub]: 'GitHub Copilot',
      [PROVIDER_TYPES.OpenAICompatible]: 'OpenAI-Compatible API',
      [PROVIDER_TYPES.DeepInfra]: 'DeepInfra',
    };
    return displayNames[type];
  }

  static getProviderDescription(type: PROVIDER_TYPES): string {
    const descriptions: Record<PROVIDER_TYPES, string> = {
      [PROVIDER_TYPES.OpenRouter]: 'Access to 100+ models from various providers through OpenRouter',
      [PROVIDER_TYPES.OpenAI]: 'Direct access to OpenAI models including GPT-4, GPT-4o, and o1',
      [PROVIDER_TYPES.Anthropic]: 'Access to Claude models by Anthropic',
      [PROVIDER_TYPES.GitHub]: 'GitHub Copilot models for developers',
      [PROVIDER_TYPES.OpenAICompatible]: 'Compatible with any OpenAI-compatible API endpoint',
      [PROVIDER_TYPES.DeepInfra]: 'Access to LLMs with fast inference and competitive pricing',
    };
    return descriptions[type];
  }

  static validateProviderConfig(config: ProviderConfig): boolean {
    if (!config.apiKey || config.apiKey.trim() === '') {
      return false;
    }

    if (!ProviderFactory.getProviderTypes().includes(config.type)) {
      return false;
    }

    return true;
  }
}
