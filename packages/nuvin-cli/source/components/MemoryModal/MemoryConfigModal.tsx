import type React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { AppModal } from '@/components/AppModal.js';
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import { HelpText } from '@/components/HelpText.js';
import { getAllProviders, getProviderLabel } from '@/config/providers.js';
import type { ProviderConfig, AuthMethod } from '@/config/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { PROVIDER_MODELS } from '@/const.js';
import type { CommandComponentProps } from '@/modules/commands/types.js';

type ProviderModelsCache = {
  models: string[];
  fetchedAt: number;
};

const MODEL_CACHE_TTL = 5 * 60 * 1000;
const modelsCache = new Map<string, ProviderModelsCache>();

function getCachedModels(provider: string): string[] | null {
  const cached = modelsCache.get(provider);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > MODEL_CACHE_TTL) {
    modelsCache.delete(provider);
    return null;
  }
  return cached.models;
}

function setCachedModels(provider: string, models: string[]): void {
  modelsCache.set(provider, { models, fetchedAt: Date.now() });
}

function getProvidersWithAuth(
  allProviders: string[],
  providersConfig: Record<string, ProviderConfig> | undefined,
): string[] {
  if (!providersConfig) return [];
  return allProviders.filter((provider) => {
    const config = providersConfig[provider.toLowerCase()] || providersConfig[provider];
    if (!config) return false;
    const auth = config.auth;
    if (!Array.isArray(auth) || auth.length === 0) return false;
    return auth.some((a: AuthMethod) => {
      if (a.type === 'api-key' && a['api-key']) return true;
      if (a.type === 'oauth' && a.access) return true;
      return false;
    });
  });
}

interface MemoryConfigModalProps {
  context: CommandComponentProps['context'];
  deactivate: () => void;
  isActive: boolean;
}

export const MemoryConfigModal: React.FC<MemoryConfigModalProps> = ({
  context,
  deactivate,
  isActive,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const providersConfigRef = useRef(
    context.config.get<Record<string, ProviderConfig>>('providers'),
  );
  const providersConfig = providersConfigRef.current;

  const authenticatedProviders = useMemo(
    () => getProvidersWithAuth(getAllProviders(providersConfig), providersConfig),
    [providersConfig],
  );

  const currentProvider = context.config.get<string>('memory.provider');
  const currentModel = context.config.get<string>('memory.model');

  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [loadingProviders, setLoadingProviders] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const llmFactory = context.orchestratorManager?.getLLMFactory();

  const fetchStartedRef = useRef(false);
  useEffect(() => {
    if (authenticatedProviders.length === 0 || fetchStartedRef.current) return;
    fetchStartedRef.current = true;

    const abortController = new AbortController();

    const fetchModelsForProvider = async (provider: string) => {
      const cached = getCachedModels(provider);
      if (cached) {
        setProviderModels((prev) => ({ ...prev, [provider]: cached }));
        return;
      }

      setLoadingProviders((prev) => ({ ...prev, [provider]: true }));
      try {
        const models = llmFactory
          ? await llmFactory.getModels(provider, abortController.signal)
          : [];
        const resolved = models.length > 0 ? models : (PROVIDER_MODELS[provider] ?? []);
        setCachedModels(provider, resolved);
        setProviderModels((prev) => ({ ...prev, [provider]: resolved }));
      } catch {
        setProviderModels((prev) => ({
          ...prev,
          [provider]: PROVIDER_MODELS[provider] ?? [],
        }));
      } finally {
        setLoadingProviders((prev) => ({ ...prev, [provider]: false }));
      }
    };

    for (const provider of authenticatedProviders) {
      fetchModelsForProvider(provider);
    }

    return () => {
      abortController.abort();
    };
  }, [authenticatedProviders, llmFactory]);

  const comboBoxItems = useMemo<ComboBoxItem[]>(() => {
    const items: ComboBoxItem[] = [];

    items.push({
      label: 'Use default (smallModel)',
      value: '__default__',
      group: 'Reset',
    });

    for (const provider of authenticatedProviders) {
      const providerLabel = getProviderLabel(provider);
      const models = providerModels[provider] ?? [];
      const isLoading = loadingProviders[provider];

      if (isLoading && models.length === 0) {
        items.push({
          label: 'Loading...',
          value: `__loading__::${provider}`,
          group: providerLabel,
        });
      } else {
        for (const model of models) {
          items.push({
            label: model,
            value: `${provider}::${model}`,
            group: providerLabel,
          });
        }
      }
    }

    return items;
  }, [authenticatedProviders, providerModels, loadingProviders]);

  const handleSelect = async (item: ComboBoxItem) => {
    if (item.value.startsWith('__loading__::')) return;

    try {
      if (item.value === '__default__') {
        await context.config.delete('memory.provider', 'global');
        await context.config.delete('memory.model', 'global');
      } else {
        const [provider, model] = item.value.split('::');
        if (!provider || !model) return;
        await context.config.set('memory.provider', provider, 'global');
        await context.config.set('memory.model', model, 'global');
      }
      deactivate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save config');
    }
  };

  const modalHeight = Math.min(rows - 4, 24);

  const currentLabel =
    currentProvider && currentModel
      ? `${currentProvider} / ${currentModel}`
      : 'default (smallModel)';

  const titleRight = <Text dimColor>{currentLabel}</Text>;

  if (authenticatedProviders.length === 0) {
    return (
      <AppModal
        visible={true}
        title="Memory Extraction Model"
        onClose={deactivate}
        closeOnEscape={true}
        height={8}
      >
        <Box flexDirection="column">
          <Text color={theme.colors.warning}>No providers configured.</Text>
          <Text color={theme.colors.muted} dimColor>
            Run /auth to configure a provider first.
          </Text>
        </Box>
      </AppModal>
    );
  }

  return (
    <AppModal
      visible={true}
      title="Memory Extraction Model"
      rightTitle={titleRight}
      onClose={deactivate}
      closeOnEscape={true}
      closeOnEnter={false}
      footer={
        <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
          <HelpText
            segments={[
              { text: '↑↓', highlight: true },
              { text: ' navigate • ' },
              { text: 'Enter', highlight: true },
              { text: ' select • ' },
              { text: 'ESC', highlight: true },
              { text: ' cancel' },
            ]}
          />
        </Box>
      }
      height={modalHeight}
    >
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {error && (
          <Box marginBottom={1}>
            <Text color={theme.colors.error}>{error}</Text>
          </Box>
        )}
        <ComboBox
          items={comboBoxItems}
          placeholder="Type to search models..."
          enableRotation={true}
          showItemCount={false}
          focus={isActive}
          onSelect={handleSelect}
          onCancel={deactivate}
        />
      </Box>
    </AppModal>
  );
};
