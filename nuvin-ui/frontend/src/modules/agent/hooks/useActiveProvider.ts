import { useMemo } from 'react';
import { useProviderStore } from '@/store/useProviderStore';
import type { ProviderConfig } from '@/types';

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

export function useHasValidActiveProvider(): boolean {
  const provider = useActiveProvider();
  return useMemo(() => {
    if (!provider) return false;
    const hasApiKey = !!provider.apiKey;
    const hasModel = !!provider.activeModel?.model;
    return hasApiKey && hasModel;
  }, [provider]);
}
