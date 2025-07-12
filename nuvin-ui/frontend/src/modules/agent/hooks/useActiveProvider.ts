import { useMemo } from 'react';
import { useProviderStore } from '@/store/useProviderStore';
import { ProviderConfig } from '@/types';
import { LLMProviderConfig, ProviderType } from '@/lib/providers';

export interface ActiveProviderInfo {
  provider: ProviderConfig | null;
  isValid: boolean;
  hasApiKey: boolean;
  hasModel: boolean;
}

export function useActiveProvider(): ProviderConfig | null {
  const { providers, activeProviderId } = useProviderStore();

  return useMemo(() => {
    return providers.find(p => p.id === activeProviderId) || null;
  }, [providers, activeProviderId]);
}

export function useActiveProviderConfig(): ProviderConfig | null {
  const { providers, activeProviderId } = useProviderStore();

  return useMemo(() => {
    return providers.find(p => p.id === activeProviderId) || null;
  }, [providers, activeProviderId]);
}

export function useActiveProviderLLMConfig(): LLMProviderConfig | null {
  const { providers, activeProviderId } = useProviderStore();

  return useMemo(() => {
    const provider = providers.find(p => p.id === activeProviderId);
    if (!provider) return null;

    return {
      type: provider.type as ProviderType,
      apiKey: provider.apiKey,
      name: provider.name,
    };
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
