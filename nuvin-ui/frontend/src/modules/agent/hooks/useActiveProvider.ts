import { useMemo } from 'react';
import { useProviderStore } from '@/store/useProviderStore';
import type { ProviderConfig } from '@/types';
import type { LLMProviderConfig } from '@/lib/providers/provider-utils';
import { PROVIDER_TYPES } from '@/lib/providers/provider-utils';

export interface ActiveProviderInfo {
  provider: ProviderConfig | null;
  isValid: boolean;
  hasApiKey: boolean;
  hasModel: boolean;
}

export function useActiveProvider(): ProviderConfig | null {
  const { providers, activeProviderId } = useProviderStore();

  return useMemo(() => {
    return providers.find((p) => p.id === activeProviderId) || null;
  }, [providers, activeProviderId]);
}

export function useActiveProviderConfig(): ProviderConfig | null {
  const { providers, activeProviderId } = useProviderStore();

  return useMemo(() => {
    return providers.find((p) => p.id === activeProviderId) || null;
  }, [providers, activeProviderId]);
}

// Helper function to map provider type strings to LLMProviderConfig type
function mapProviderTypeToLLMType(type: string): LLMProviderConfig['type'] {
  const typeMapping: Record<string, LLMProviderConfig['type']> = {
    openai: PROVIDER_TYPES.OpenAI,
    anthropic: PROVIDER_TYPES.Anthropic,
    openrouter: PROVIDER_TYPES.OpenRouter,
    github: PROVIDER_TYPES.GitHub,
    OpenAI: PROVIDER_TYPES.OpenAI,
    Anthropic: PROVIDER_TYPES.Anthropic,
    OpenRouter: PROVIDER_TYPES.OpenRouter,
    GitHub: PROVIDER_TYPES.GitHub,
  };

  const mappedType = typeMapping[type];
  if (!mappedType) {
    throw new Error(
      `Invalid provider type: ${type}. Supported types: ${Object.keys(typeMapping).join(', ')}`,
    );
  }

  return mappedType;
}

export function useActiveProviderLLMConfig(): LLMProviderConfig | null {
  const { providers, activeProviderId } = useProviderStore();

  return useMemo(() => {
    const provider = providers.find((p) => p.id === activeProviderId);
    if (!provider) return null;

    // Validate provider has required fields
    if (!provider.type || !provider.apiKey) {
      console.warn(
        'Active provider missing required type or apiKey:',
        provider,
      );
      return null;
    }

    try {
      return {
        type: mapProviderTypeToLLMType(provider.type),
        apiKey: provider.apiKey,
        name: provider.name,
      };
    } catch (error) {
      console.error('Failed to map provider type:', error);
      return null;
    }
  }, [providers, activeProviderId]);
}

export function useHasValidActiveProvider(): boolean {
  const provider = useActiveProvider();
  return useMemo(() => {
    if (!provider) return false;
    const hasApiKey = !!provider.apiKey;
    const hasModel = !!provider.activeModel?.model;
    return hasApiKey && hasModel;
  }, [provider]);
}
