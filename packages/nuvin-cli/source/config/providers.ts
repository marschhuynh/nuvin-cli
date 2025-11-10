import { getAvailableProviders } from '@nuvin/nuvin-core';

const FACTORY_PROVIDERS = getAvailableProviders();

const SPECIAL_PROVIDERS = ['github', 'anthropic', 'echo'] as const;

export const ALL_PROVIDERS = [...FACTORY_PROVIDERS, ...SPECIAL_PROVIDERS] as const;

export type ProviderKey = (typeof ALL_PROVIDERS)[number];

export type Provider = ProviderKey;

export type ProviderItem = { label: string; value: Provider };

export const PROVIDER_LABELS: Record<Provider, string> = {
  openrouter: 'OpenRouter',
  deepinfra: 'DeepInfra',
  zai: 'Zai',
  moonshot: 'Moonshot',
  github: 'GitHub (Copilot)',
  anthropic: 'Anthropic (Claude)',
  echo: 'Echo',
};

export const PROVIDER_DESCRIPTIONS: Record<Provider, string> = {
  openrouter: 'Wide selection of models',
  deepinfra: 'Open source models',
  zai: 'Enterprise AI platform',
  moonshot: 'Moonshot AI models',
  github: 'GitHub integrated models',
  anthropic: 'Claude AI models',
  echo: 'Test/mock provider',
};

export const PROVIDER_ITEMS: ProviderItem[] = ALL_PROVIDERS.map((provider) => ({
  label: PROVIDER_LABELS[provider],
  value: provider,
}));

export const PROVIDER_OPTIONS = ALL_PROVIDERS.map((provider) => ({
  label: `${PROVIDER_LABELS[provider]} - ${PROVIDER_DESCRIPTIONS[provider]}`,
  value: provider,
}));

export function isFactoryProvider(provider: ProviderKey): boolean {
  return FACTORY_PROVIDERS.includes(provider);
}

export function isSpecialProvider(provider: ProviderKey): boolean {
  return SPECIAL_PROVIDERS.includes(provider as unknown as (typeof SPECIAL_PROVIDERS)[number]);
}
