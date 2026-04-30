import { getAvailableProviders, getProviderLabel as getCoreProviderLabel } from '@nuvin/nuvin-core';
import type { ProviderConfig } from './types.js';

const SPECIAL_PROVIDERS = ['github', 'anthropic'] as const;

type SpecialProvider = (typeof SPECIAL_PROVIDERS)[number];

export type ProviderKey = string;

export function getAllProviders(customProviders?: Record<string, ProviderConfig>): string[] {
  const factoryProviders = getAvailableProviders(customProviders);
  return [...factoryProviders, ...SPECIAL_PROVIDERS];
}

export type ProviderItem = { label: string; value: ProviderKey };

export interface ProviderMetadata {
  label?: string;
  description?: string;
  key: string;
}

export function getProviderLabel(provider: string): string {
  const coreLabel = getCoreProviderLabel(provider);
  if (coreLabel) {
    return coreLabel;
  }

  return provider
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function buildProviderOptions(customProviders?: Record<string, ProviderConfig>): ProviderItem[] {
  const allProviders = getAllProviders(customProviders);
  return allProviders.map((provider) => ({
    label: getProviderLabel(provider),
    value: provider,
  }));
}

export function extractProviderMetadata(providerData: ProviderMetadata): ProviderMetadata {
  return {
    key: providerData.key || (providerData as unknown as { name: string })?.name, // Support both old 'name' and new 'key'
    label: providerData.label,
    description: providerData.description,
  };
}

export function isFactoryProvider(provider: ProviderKey): boolean {
  return !isSpecialProvider(provider);
}

export function isSpecialProvider(provider: ProviderKey): boolean {
  return SPECIAL_PROVIDERS.includes(provider as SpecialProvider);
}
