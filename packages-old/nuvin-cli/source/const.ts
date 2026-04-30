import type { ProviderKey } from './config/providers.js';
import {
  getProviderAuthMethods as getCoreProviderAuthMethods,
  getProviderDefaultModels as getCoreProviderDefaultModels,
} from '@nuvin/nuvin-core';

export {
  type ProviderKey,
  type ProviderItem,
  type ProviderMetadata,
  buildProviderOptions,
  getProviderLabel,
} from './config/providers.js';
export type AuthMethod = 'device-flow' | 'token' | 'none' | 'oauth-max' | 'oauth-console';
export type AuthMethodItem = { label: string; value: AuthMethod };

export const MAX_RENDERED_LINES = 2000;

const SPECIAL_AUTH_METHODS: Record<string, AuthMethodItem[]> = {
  github: [
    { label: 'Device Flow Login', value: 'device-flow' },
    { label: 'Access Token', value: 'token' },
  ],
  anthropic: [
    { label: 'Claude Pro/Max Account', value: 'oauth-max' },
    { label: 'Create API Key', value: 'oauth-console' },
    { label: 'Manually enter API Key', value: 'token' },
  ],
  lmstudio: [{ label: 'No auth needed', value: 'none' }],
  echo: [{ label: 'No auth needed', value: 'none' }],
};

const SPECIAL_MODELS: Record<string, string[]> = {
  github: ['claude-sonnet-4.5', 'gpt-4.1', 'gpt-5', 'gpt-5-mini', 'grok-code-fast-1', 'claude-sonnet-4'],
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-sonnet-4'],
  lmstudio: [],
  echo: ['echo-model'],
};

export function getProviderAuthMethods(provider: ProviderKey): AuthMethodItem[] {
  if (SPECIAL_AUTH_METHODS[provider]) {
    return SPECIAL_AUTH_METHODS[provider];
  }
  const coreAuthMethods = getCoreProviderAuthMethods(provider);
  return coreAuthMethods as AuthMethodItem[];
}

export function getProviderModels(provider: ProviderKey): string[] {
  if (SPECIAL_MODELS[provider]) {
    return SPECIAL_MODELS[provider];
  }
  return getCoreProviderDefaultModels(provider);
}

export const PROVIDER_AUTH_METHODS: Record<ProviderKey, AuthMethodItem[]> = new Proxy(
  {} as Record<ProviderKey, AuthMethodItem[]>,
  { get: (_, prop) => getProviderAuthMethods(prop as ProviderKey) },
);

export const PROVIDER_MODELS: Record<ProviderKey, string[]> = new Proxy({} as Record<ProviderKey, string[]>, {
  get: (_, prop) => getProviderModels(prop as ProviderKey),
});
