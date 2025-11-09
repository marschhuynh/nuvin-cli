import { useReducer } from 'react';
import type { ProviderKey } from '@/const';
import type { CommandContext } from '@/modules/commands/types';
import type { LLMFactory } from '@/services/LLMFactory.js';

export type Stage = 'provider' | 'model' | 'custom' | 'loading';

export interface ModelsCommandState {
  stage: Stage;
  selectedProvider: ProviderKey | null;
  customModel: string;
  isLoading: boolean;
  error: string | null;
  availableModels: string[];
}

export type ModelsCommandAction =
  | { type: 'SELECT_PROVIDER'; payload: ProviderKey }
  | { type: 'SET_LOADING' }
  | { type: 'SET_MODELS'; payload: string[] }
  | { type: 'GO_TO_CUSTOM' }
  | { type: 'GO_BACK' }
  | { type: 'SET_INPUT'; payload: string }
  | { type: 'SET_INPUT_DONE'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

export interface UseModelsCommandStateReturn {
  state: ModelsCommandState;
  selectProvider: (provider: ProviderKey) => Promise<void>;
  selectModel: (model: string) => Promise<void>;
  goToCustomInput: () => void;
  goBack: () => void;
  setCustomModelInput: (value: string) => void;
  submitCustomModel: (value: string) => Promise<void>;
  clearError: () => void;
}

const initialState: ModelsCommandState = {
  stage: 'provider',
  selectedProvider: null,
  customModel: '',
  isLoading: false,
  error: null,
  availableModels: [],
};

function modelsCommandReducer(state: ModelsCommandState, action: ModelsCommandAction): ModelsCommandState {
  switch (action.type) {
    case 'SELECT_PROVIDER':
      return {
        ...state,
        selectedProvider: action.payload,
        stage: 'loading',
        error: null,
        availableModels: [],
      };

    case 'SET_LOADING':
      return {
        ...state,
        stage: 'loading',
        isLoading: true,
      };

    case 'SET_MODELS':
      return {
        ...state,
        stage: 'model',
        availableModels: action.payload,
        isLoading: false,
      };

    case 'GO_TO_CUSTOM':
      return {
        ...state,
        stage: 'custom',
        customModel: '',
        error: null,
      };

    case 'GO_BACK':
      if (state.stage === 'custom') {
        return {
          ...state,
          stage: 'model',
          customModel: '',
          error: null,
        };
      }
      if (state.stage === 'model') {
        return {
          ...state,
          stage: 'provider',
          selectedProvider: null,
          error: null,
        };
      }
      return state;

    case 'SET_INPUT':
      return {
        ...state,
        customModel: action.payload,
      };

    case 'SET_INPUT_DONE':
      return {
        ...state,
        isLoading: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };

    default:
      return state;
  }
}

async function saveConfiguration(
  provider: ProviderKey,
  model: string,
  config: CommandContext['config'],
  dispatch: React.Dispatch<ModelsCommandAction>,
): Promise<void> {
  dispatch({ type: 'SET_INPUT_DONE', payload: true });
  dispatch({ type: 'SET_ERROR', payload: null });

  try {
    await config.set('activeProvider', provider, 'global');
    await config.set('model', model, 'global');
    await config.set(`providers.${provider}.model`, model, 'global');
    dispatch({ type: 'SET_INPUT_DONE', payload: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save failed';
    dispatch({ type: 'SET_INPUT_DONE', payload: false });
    dispatch({ type: 'SET_ERROR', payload: message });
    throw error;
  }
}

export function useModelsCommandState(
  config: CommandContext['config'],
  llmFactory: LLMFactory | undefined,
  onComplete: () => void,
  onCancel: () => void,
): UseModelsCommandStateReturn {
  const [state, dispatch] = useReducer(modelsCommandReducer, initialState);

  const selectProvider = async (provider: ProviderKey) => {
    dispatch({ type: 'SELECT_PROVIDER', payload: provider });

    if (!llmFactory) {
      dispatch({ type: 'SET_MODELS', payload: [] });
      return;
    }

    try {
      const modelIds = await llmFactory.getModels(provider);
      dispatch({ type: 'SET_MODELS', payload: modelIds });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to fetch models',
      });
      dispatch({ type: 'SET_MODELS', payload: [] });
    }
  };

  const selectModel = async (model: string) => {
    if (!state.selectedProvider) {
      dispatch({ type: 'SET_ERROR', payload: 'No provider selected' });
      return;
    }

    try {
      await saveConfiguration(state.selectedProvider, model, config, dispatch);
      onComplete();
    } catch (error) {
      // Error already handled in saveConfiguration
      console.error('Failed to save model configuration:', error);
    }
  };

  const goToCustomInput = () => {
    dispatch({ type: 'GO_TO_CUSTOM' });
  };

  const goBack = () => {
    if (state.stage === 'provider') {
      onCancel();
    } else {
      dispatch({ type: 'GO_BACK' });
    }
  };

  const setCustomModelInput = (value: string) => {
    dispatch({ type: 'SET_INPUT', payload: value });
  };

  const submitCustomModel = async (value: string) => {
    if (!value.trim()) {
      dispatch({ type: 'SET_ERROR', payload: 'Model name cannot be empty' });
      return;
    }

    if (!state.selectedProvider) {
      dispatch({ type: 'SET_ERROR', payload: 'No provider selected' });
      return;
    }

    try {
      await saveConfiguration(state.selectedProvider, value.trim(), config, dispatch);
      onComplete();
    } catch (error) {
      // Error already handled in saveConfiguration
      console.error('Failed to save custom model configuration:', error);
    }
  };

  const clearError = () => {
    dispatch({ type: 'SET_ERROR', payload: null });
  };

  return {
    state,
    selectProvider,
    selectModel,
    goToCustomInput,
    goBack,
    setCustomModelInput,
    submitCustomModel,
    clearError,
  };
}
