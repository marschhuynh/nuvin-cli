import type { ProviderConfig, ModelConfig } from '@/types';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface ProviderState {
  providers: ProviderConfig[];
  activeProviderId: string;
  addProvider: (provider: ProviderConfig) => void;
  updateProvider: (provider: ProviderConfig) => void;
  updateActiveModel: (
    providerId: string,
    modelConfig: Partial<ModelConfig>,
  ) => void;
  deleteProvider: (id: string) => void;
  setActiveProvider: (id: string) => void;
  isNameUnique: (name: string, excludeId?: string) => boolean;
  reset: () => void;
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

const defaultProviders: ProviderConfig[] = [];

export const useProviderStore = create<ProviderState>()(
  persist(
    devtools((set, get) => ({
      providers: defaultProviders,
      activeProviderId: 'default',
      addProvider: (provider) =>
        set((state) => ({ providers: [...state.providers, provider] })),
      updateProvider: (provider) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === provider.id ? { ...p, ...provider } : p,
          ),
        })),
      updateActiveModel: (providerId, modelConfig) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId
              ? { ...p, activeModel: { ...p.activeModel, ...modelConfig } }
              : p,
          ),
        })),
      deleteProvider: (id) => {
        // Clear models for the deleted provider
        set((state) => {
          const newProviders = state.providers.filter((p) => p.id !== id);
          const newActiveId =
            state.activeProviderId === id
              ? newProviders.length > 0
                ? newProviders[0].id
                : ''
              : state.activeProviderId;

          // Use setTimeout to avoid circular dependency issues
          setTimeout(() => {
            try {
              // Import dynamically to avoid circular dependencies
              import('./useModelsStore')
                .then(({ useModelsStore }) => {
                  useModelsStore.getState().clearProviderModels(id);
                })
                .catch((error) => {
                  console.warn(
                    'Could not clear models for deleted provider:',
                    error,
                  );
                });
            } catch (error) {
              console.warn(
                'Could not clear models for deleted provider:',
                error,
              );
            }
          }, 0);

          return {
            providers: newProviders,
            activeProviderId: newActiveId,
          };
        });
      },
      setActiveProvider: (id) => set({ activeProviderId: id }),
      isNameUnique: (name, excludeId) => {
        const providers = get().providers;
        return !providers.some((p) => p.name === name && p.id !== excludeId);
      },
      reset: () =>
        set({ providers: defaultProviders, activeProviderId: 'default' }),
      hasHydrated: false,
      setHasHydrated: (state) => set({ hasHydrated: state }),
    })),
    {
      name: 'provider-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
