export { OpenAIProvider } from './openai-provider';
export { GithubCopilotProvider } from './github-provider';
export { AnthropicProvider } from './anthropic-provider';
export { OpenRouterProvider } from './openrouter-provider';
export type { LLMProvider, CompletionParams, CompletionResult, ChatMessage } from './llm-provider';

import { OpenAIProvider } from './openai-provider';
import { GithubCopilotProvider } from './github-provider';
import { AnthropicProvider } from './anthropic-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { LLMProvider } from './llm-provider';
import type { ProviderConfig } from '@/types';

export function createProvider(config: ProviderConfig): LLMProvider {
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
