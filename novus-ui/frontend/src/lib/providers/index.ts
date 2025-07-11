export { OpenAIProvider } from './openai-provider';
export { GithubCopilotProvider } from './github-provider';
export type { LLMProvider, CompletionParams, CompletionResult, ChatMessage } from './llm-provider';

import { OpenAIProvider } from './openai-provider';
import { GithubCopilotProvider } from './github-provider';
import { LLMProvider } from './llm-provider';
import type { ProviderConfig } from '@/types';

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case 'OpenAI':
      return new OpenAIProvider(config.apiKey);
    case 'GitHub':
      return new GithubCopilotProvider(config.apiKey);
    default:
      throw new Error(`Unsupported provider type: ${config.type}`);
  }
}
