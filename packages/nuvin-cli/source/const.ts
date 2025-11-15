import type { ProviderKey } from './config/providers.js';

export {
  type ProviderKey,
  type ProviderItem,
  PROVIDER_ITEMS,
  PROVIDER_LABELS,
  PROVIDER_OPTIONS,
} from './config/providers.js';
export type AuthMethod = 'device-flow' | 'token' | 'none' | 'oauth-max' | 'oauth-console';
export type AuthMethodItem = { label: string; value: AuthMethod };

export const MAX_RENDERED_LINES = 2000;

const DEFAULT_AUTH_METHODS: Record<string, AuthMethodItem[]> = {
  github: [
    { label: 'Device Flow Login', value: 'device-flow' },
    { label: 'Access Token', value: 'token' },
  ],
  openrouter: [{ label: 'API Key', value: 'token' }],
  deepinfra: [{ label: 'API Key', value: 'token' }],
  zai: [{ label: 'API Key', value: 'token' }],
  moonshot: [{ label: 'API Key', value: 'token' }],
  lmstudio: [{ label: 'No auth needed', value: 'none' }],
  anthropic: [
    { label: 'Claude Pro/Max Account', value: 'oauth-max' },
    { label: 'Create API Key', value: 'oauth-console' },
    { label: 'Manually enter API Key', value: 'token' },
  ],
  echo: [{ label: 'No auth needed', value: 'none' }],
};

const DEFAULT_MODELS: Record<string, string[]> = {
  openrouter: ['openai/gpt-4o', 'openai/gpt-4o-mini'],
  deepinfra: ['meta-llama/Meta-Llama-3.1-70B-Instruct', 'meta-llama/Meta-Llama-3.1-8B-Instruct'],
  github: ['claude-sonnet-4.5', 'gpt-4.1', 'gpt-5', 'gpt-5-mini', 'grok-code-fast-1', 'claude-sonnet-4'],
  zai: ['glm-4.6', 'glm-4.5'],
  moonshot: ['kimi-latest', 'kimi-k2-thinking'],
  lmstudio: [],
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-sonnet-4'],
  echo: ['echo-model'],
};

export function getProviderAuthMethods(provider: ProviderKey): AuthMethodItem[] {
  return DEFAULT_AUTH_METHODS[provider] || [{ label: 'API Key', value: 'token' }];
}

export function getProviderModels(provider: ProviderKey): string[] {
  return DEFAULT_MODELS[provider] || [];
}

export const PROVIDER_AUTH_METHODS: Record<ProviderKey, AuthMethodItem[]> = DEFAULT_AUTH_METHODS;
export const PROVIDER_MODELS: Record<ProviderKey, string[]> = DEFAULT_MODELS;
