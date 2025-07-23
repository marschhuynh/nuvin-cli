import { OpenRouterProvider } from './openrouter-provider';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GithubCopilotProvider } from './github-provider';
import type { LLMProvider } from './llm-provider';

export type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'github';

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  apiUrl?: string;
  customHeaders?: Record<string, string>;
}

export class ProviderFactory {
  constructor() {
    throw new Error(
      'ProviderFactory is a static class and cannot be instantiated.',
    );
  }
  static createProvider(config: ProviderConfig): LLMProvider {
    switch (config.type) {
      case 'openrouter':
        return new OpenRouterProvider(config.apiKey);
      case 'openai':
        return new OpenAIProvider(config.apiKey);
      case 'anthropic':
        return new AnthropicProvider(config.apiKey);
      case 'github':
        return new GithubCopilotProvider(config.apiKey);
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }

  static getProviderTypes(): ProviderType[] {
    return ['openrouter', 'openai', 'anthropic', 'github'];
  }

  static getProviderDisplayName(type: ProviderType): string {
    const displayNames: Record<ProviderType, string> = {
      openrouter: 'OpenRouter',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      github: 'GitHub Copilot',
    };
    return displayNames[type];
  }

  static getProviderDescription(type: ProviderType): string {
    const descriptions: Record<ProviderType, string> = {
      openrouter:
        'Access to 100+ models from various providers through OpenRouter',
      openai: 'Direct access to OpenAI models including GPT-4, GPT-4o, and o1',
      anthropic: 'Access to Claude models by Anthropic',
      github: 'GitHub Copilot models for developers',
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
