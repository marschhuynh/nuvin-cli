import { Box, Text, useInput } from 'ink';
import SelectInput from '@/components/SelectInput/index.js';
import { AppModal } from '@/components/AppModal.js';
import TextInput from '@/components/TextInput/index.js';
import { ComboBox } from '@/components/ComboBox/index.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';

import { type ProviderKey, PROVIDER_MODELS, PROVIDER_OPTIONS } from '@/const.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useModelsCommandState } from './hooks/useModelsCommandState.js';

const ModelsCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();

  const llmFactory = context.orchestrator?.getLLMFactory();

  const { state, selectProvider, selectModel, goToCustomInput, goBack, setCustomModelInput, submitCustomModel } =
    useModelsCommandState(context.config, llmFactory, deactivate, deactivate);

  useInput(
    (_input, key) => {
      if (key.escape) {
        goBack();
      }
    },
    { isActive: true },
  );

  const providerOptions = PROVIDER_OPTIONS;

  const handleProviderSelect = async (item: { label: string; value: string }) => {
    const provider = item.value as ProviderKey;
    selectProvider(provider);
  };

  const handleModelSelect = async (item: { label: string; value: string }) => {
    if (item.value === 'custom') {
      goToCustomInput();
      return;
    }

    await selectModel(item.value);
  };

  const handleCustomModelSubmit = async (value: string) => {
    await submitCustomModel(value);
  };

  if (state.stage === 'provider') {
    return (
      <AppModal
        visible={true}
        title="Select AI Provider"
        titleColor={theme.model.title}
        type="info"
        onClose={deactivate}
        closeOnEscape={false}
        closeOnEnter={false}
      >
        <Text color={theme.model.subtitle} dimColor>
          Choose the AI provider for your models
        </Text>
        <Box marginTop={1}>
          <SelectInput items={providerOptions} onSelect={handleProviderSelect} />
        </Box>
      </AppModal>
    );
  }

  if (state.stage === 'loading') {
    return (
      <AppModal
        visible={true}
        title="Loading Models..."
        titleColor={theme.model.title}
        type="info"
        onClose={deactivate}
        closeOnEscape={false}
        closeOnEnter={false}
      >
        <Text color={theme.model.subtitle} dimColor>
          Fetching available models from {state.selectedProvider}...
        </Text>
      </AppModal>
    );
  }

  if (state.stage === 'model' && state.selectedProvider) {
    const fallbackModels = PROVIDER_MODELS[state.selectedProvider] || [];
    const models = state.availableModels.length > 0 ? state.availableModels : fallbackModels;
    const modelOptions = models.map((model) => ({ label: model, value: model }));

    const shouldUseAutocomplete = state.availableModels.length > 10;

    return (
      <AppModal
        visible={true}
        title={`Select Model for ${state.selectedProvider}`}
        titleColor={theme.model.title}
        type="info"
        onClose={deactivate}
        closeOnEscape={false}
        closeOnEnter={false}
      >
        {state.error && (
          <Box marginBottom={1}>
            <Text color="red">{state.error}</Text>
          </Box>
        )}
        <Text color={theme.model.subtitle} dimColor>
          {state.availableModels.length > 0 
            ? `${models.length} models available` 
            : 'Choose a model or enter a custom model name'}
        </Text>
        <Box marginTop={1}>
          {shouldUseAutocomplete ? (
            <ComboBox
              items={modelOptions}
              placeholder="Type to search models..."
              maxDisplayItems={10}
              enableRotation={true}
              onSelect={(item) => handleModelSelect({ label: item.label, value: item.value })}
              onCancel={goBack}
            />
          ) : (
            <SelectInput 
              items={[...modelOptions.map(m => ({ label: m.label, value: m.value })), { label: '🎯 Enter custom model name...', value: 'custom' }]} 
              onSelect={(item) => handleModelSelect({ label: item.label, value: item.value })} 
            />
          )}
        </Box>
      </AppModal>
    );
  }

  if (state.stage === 'custom') {
    return (
      <AppModal
        visible={true}
        title="Enter Custom Model Name"
        titleColor={theme.model.title}
        type="info"
        onClose={deactivate}
        closeOnEscape={false}
        closeOnEnter={false}
      >
        <Text color={theme.model.subtitle} dimColor>
          Type the exact model name for {state.selectedProvider}
        </Text>
        <Box marginTop={1}>
          <Text color={theme.model.label}>Model: </Text>
          <TextInput
            value={state.customModel}
            onChange={setCustomModelInput}
            onSubmit={handleCustomModelSubmit}
            placeholder="e.g., anthropic/claude-3-opus-20240229"
          />
        </Box>
        <Box marginTop={1}>
          <Text color={theme.model.help} dimColor>
            Press Enter to save, Esc to cancel
          </Text>
        </Box>
      </AppModal>
    );
  }

  return null;
};

export function registerModelsCommand(registry: CommandRegistry) {
  registry.register({
    id: '/model',
    type: 'component',
    description: 'Select AI provider and model configuration.',
    category: 'config',
    component: ModelsCommandComponent,
  });
}
