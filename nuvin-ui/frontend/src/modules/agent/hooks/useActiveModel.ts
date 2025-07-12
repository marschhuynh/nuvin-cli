import { useMemo, useCallback } from 'react';
import { useProviderStore } from '@/store/useProviderStore';
import { useModelsStore, ModelInfoWithState } from '@/store/useModelsStore';
import { ModelConfig } from '@/types';

export interface ActiveModelInfo {
  // Current model configuration from provider
  modelConfig: ModelConfig | null;
  // Model details from the models store
  modelInfo: ModelInfoWithState | null;
  // All available models for the active provider
  availableModels: ModelInfoWithState[];
  // Enabled models for the active provider
  enabledModels: ModelInfoWithState[];
  // Loading state
  isLoading: boolean;
  // Error state
  error: string | null;
  // Helper flags
  hasActiveModel: boolean;
  isModelEnabled: boolean;
}

export function useActiveModel(): ActiveModelInfo {
  const { providers, activeProviderId } = useProviderStore();
  const { models, loading, errors } = useModelsStore();

  return useMemo((): ActiveModelInfo => {
    // Get active provider
    const activeProvider = providers.find(p => p.id === activeProviderId);

    if (!activeProvider) {
      return {
        modelConfig: null,
        modelInfo: null,
        availableModels: [],
        enabledModels: [],
        isLoading: false,
        error: null,
        hasActiveModel: false,
        isModelEnabled: false,
      };
    }

    // Get models for active provider
    const providerModels = models[activeProviderId] || [];
    const enabledModels = providerModels.filter(model => model.enabled);
    const isLoading = loading[activeProviderId] || false;
    const error = errors[activeProviderId] || null;

    // Get current model info
    const modelConfig = activeProvider.activeModel;
    const modelInfo = modelConfig
      ? providerModels.find(model => model.id === modelConfig.model || model.name === modelConfig.model)
      : null;

    const hasActiveModel = !!modelConfig?.model;
    const isModelEnabled = modelInfo ? modelInfo.enabled : false;

    return {
      modelConfig,
      modelInfo: modelInfo || null,
      availableModels: providerModels,
      enabledModels,
      isLoading,
      error,
      hasActiveModel,
      isModelEnabled,
    };
  }, [providers, activeProviderId, models, loading, errors]);
}

export function useActiveModelActions() {
  const { updateProvider, activeProviderId } = useProviderStore();
  const { updateModelState, setModels, setLoading, setError } = useModelsStore();

  const updateActiveModel = useCallback((model: string) => {
    const { providers } = useProviderStore.getState();
    const activeProvider = providers.find(p => p.id === activeProviderId);

    if (activeProvider) {
      updateProvider({
        ...activeProvider,
        activeModel: {
          ...activeProvider.activeModel,
          model
        }
      });
    }
  }, [activeProviderId, updateProvider]);

  const toggleModelEnabled = useCallback((modelId: string) => {
    if (activeProviderId) {
      const { models } = useModelsStore.getState();
      const providerModels = models[activeProviderId] || [];
      const model = providerModels.find(m => m.id === modelId);

      if (model) {
        updateModelState(activeProviderId, modelId, !model.enabled);
      }
    }
  }, [activeProviderId, updateModelState]);

  const setProviderModels = useCallback((models: Array<{ id: string; name: string; description?: string; contextLength?: number; inputCost?: number; outputCost?: number; }>) => {
    if (activeProviderId) {
      setModels(activeProviderId, models);
    }
  }, [activeProviderId, setModels]);

  const setProviderLoading = useCallback((loading: boolean) => {
    if (activeProviderId) {
      setLoading(activeProviderId, loading);
    }
  }, [activeProviderId, setLoading]);

  const setProviderError = useCallback((error: string | null) => {
    if (activeProviderId) {
      setError(activeProviderId, error);
    }
  }, [activeProviderId, setError]);

  return {
    updateActiveModel,
    toggleModelEnabled,
    setProviderModels,
    setProviderLoading,
    setProviderError,
  };
}