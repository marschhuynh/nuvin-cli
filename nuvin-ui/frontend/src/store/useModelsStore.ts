import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ModelInfo } from '@/lib/providers/types/base';
import { fetchProviderModels, type ProviderType } from '@/lib/providers/provider-utils';
import type { ProviderConfig } from '@/types';

// Extended ModelInfo with enabled flag
export interface ModelInfoWithState extends ModelInfo {
  enabled: boolean;
}

// Store models grouped by provider ID
export interface ProviderModels {
  [providerId: string]: ModelInfoWithState[];
}

interface ModelsState {
  // Models grouped by provider ID
  models: ProviderModels;

  // Loading states by provider ID
  loading: { [providerId: string]: boolean };

  // Error states by provider ID
  errors: { [providerId: string]: string | null };

  // Actions
  setModels: (providerId: string, models: ModelInfo[]) => void;
  fetchModels: (provider: ProviderConfig) => Promise<ModelInfo[]>;
  updateModelState: (providerId: string, modelId: string, enabled: boolean) => void;
  setLoading: (providerId: string, loading: boolean) => void;
  setError: (providerId: string, error: string | null) => void;
  clearProviderModels: (providerId: string) => void;
  enableAllModels: (providerId: string) => void;
  disableAllModels: (providerId: string) => void;
  getEnabledModels: () => ModelInfoWithState[];
  getEnabledModelsByProviderId: (providerId: string) => ModelInfoWithState[];
  reset: () => void;
}

export const useModelsStore = create<ModelsState>()(
  persist(
    devtools((set, get) => ({
      models: {},
      loading: {},
      errors: {},

      setModels: (providerId, models) =>
        set((state) => ({
          models: {
            ...state.models,
            [providerId]: models.map((model) => ({
              ...model,
              providerId: providerId,
              enabled: true, // Enable all models by default
            })),
          },
          loading: {
            ...state.loading,
            [providerId]: false,
          },
          errors: {
            ...state.errors,
            [providerId]: null,
          },
        })),

      fetchModels: async (provider) => {
        // Set loading state immediately
        set((currentState) => ({
          ...currentState,
          loading: {
            ...currentState.loading,
            [provider.id]: true,
          },
          errors: {
            ...currentState.errors,
            [provider.id]: null,
          },
        }));

        try {
          const models = await fetchProviderModels(provider);

          // Update models and clear loading state
          set((currentState) => {
            const existingModels = currentState.models[provider.id] || [];
            const existingEnabledStates = existingModels.reduce(
              (acc, model) => {
                acc[model.id] = model.enabled;
                return acc;
              },
              {} as Record<string, boolean>,
            );

            return {
              ...currentState,
              models: {
                ...currentState.models,
                [provider.id]: models.map((model) => ({
                  ...model,
                  providerId: provider.id,
                  enabled: existingEnabledStates[model.id] ?? true, // Preserve existing state or default to true
                })),
              },
              loading: {
                ...currentState.loading,
                [provider.id]: false,
              },
              errors: {
                ...currentState.errors,
                [provider.id]: null,
              },
            };
          });

          return models;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch models';

          // Set error and clear loading state
          set((currentState) => ({
            ...currentState,
            loading: {
              ...currentState.loading,
              [provider.id]: false,
            },
            errors: {
              ...currentState.errors,
              [provider.id]: errorMessage,
            },
          }));

          throw error;
        }
      },

      updateModelState: (providerId, modelId, enabled) =>
        set((state) => ({
          models: {
            ...state.models,
            [providerId]: (state.models[providerId] || []).map((model) =>
              model.id === modelId ? { ...model, enabled } : model,
            ),
          },
        })),

      setLoading: (providerId, loading) => {
        return set((state) => {
          console.log(`Setting loading state for provider ${providerId}: ${loading}`, {
            loading: {
              ...state.loading,
              [providerId]: loading,
            },
          });
          return {
            ...state,
            loading: {
              ...state.loading,
              [providerId]: loading,
            },
          };
        });
      },

      setError: (providerId, error) =>
        set((state) => ({
          errors: {
            ...state.errors,
            [providerId]: error,
          },
          loading: {
            ...state.loading,
            [providerId]: false,
          },
        })),

      clearProviderModels: (providerId) =>
        set((state) => {
          const newModels = { ...state.models };
          const newLoading = { ...state.loading };
          const newErrors = { ...state.errors };

          delete newModels[providerId];
          delete newLoading[providerId];
          delete newErrors[providerId];

          return {
            models: newModels,
            loading: newLoading,
            errors: newErrors,
          };
        }),

      enableAllModels: (providerId) =>
        set((state) => ({
          models: {
            ...state.models,
            [providerId]: (state.models[providerId] || []).map((model) => ({
              ...model,
              enabled: true,
            })),
          },
        })),

      disableAllModels: (providerId) =>
        set((state) => ({
          models: {
            ...state.models,
            [providerId]: (state.models[providerId] || []).map((model) => ({
              ...model,
              enabled: false,
            })),
          },
        })),

      getEnabledModels: () => {
        const state = get();
        return Object.values(state.models)
          .flat()
          .filter((model) => model.enabled);
      },

      getEnabledModelsByProviderId: (providerId) => {
        const state = get();
        return (state.models[providerId] || []).filter((model) => model.enabled);
      },

      reset: () =>
        set({
          models: {},
          loading: {},
          errors: {},
        }),
    })),
    {
      name: 'models-storage',
      // Only persist the models and their enabled states, not loading/error states
      partialize: (state) => ({ models: state.models }),
    },
  ),
);
