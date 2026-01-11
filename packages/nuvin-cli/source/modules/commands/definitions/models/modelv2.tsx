import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { AppModal } from '@/components/AppModal.js';
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { getAllProviders, getProviderLabel } from '@/config/providers.js';
import type { ProviderConfig, AuthMethod } from '@/config/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { PROVIDER_MODELS } from '@/const.js';

type ProviderModelsCache = {
  models: string[];
  fetchedAt: number;
};

const MODEL_CACHE_TTL = 5 * 60 * 1000;
const RECENT_MODELS_KEY = 'recentModels';
const MAX_RECENT_MODELS = 5;

const modelsCache = new Map<string, ProviderModelsCache>();

function getProvidersWithAuth(
  allProviders: string[],
  providersConfig: Record<string, ProviderConfig> | undefined,
): string[] {
  if (!providersConfig) return [];

  return allProviders.filter((provider) => {
    const providerLower = provider.toLowerCase();
    const config = providersConfig[providerLower] || providersConfig[provider];
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
  modelsCache.set(provider, {
    models,
    fetchedAt: Date.now(),
  });
}

type RecentModel = {
  provider: string;
  model: string;
  usedAt: number;
};

function getRecentModels(config: CommandComponentProps['context']['config']): RecentModel[] {
  const recent = config.get<RecentModel[]>(RECENT_MODELS_KEY) || [];
  return recent.slice(0, MAX_RECENT_MODELS);
}

async function addRecentModel(
  config: CommandComponentProps['context']['config'],
  provider: string,
  model: string,
): Promise<void> {
  const recent = config.get<RecentModel[]>(RECENT_MODELS_KEY) || [];
  const filtered = recent.filter((r) => !(r.provider === provider && r.model === model));
  const updated = [{ provider, model, usedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT_MODELS);
  await config.set(RECENT_MODELS_KEY, updated, 'global');
}

const ModelsV2CommandComponent = ({ context, deactivate, isActive }: CommandComponentProps) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const providersConfigRef = useRef(context.config.get<Record<string, ProviderConfig>>('providers'));
  const providersConfig = providersConfigRef.current;

  const allProvidersRef = useRef(getAllProviders(providersConfig));
  const authenticatedProvidersRef = useRef(getProvidersWithAuth(allProvidersRef.current, providersConfig));
  const authenticatedProviders = authenticatedProvidersRef.current;

  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [loadingProviders, setLoadingProviders] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const recentModelsRef = useRef(getRecentModels(context.config));
  const recentModels = recentModelsRef.current;

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
        if (llmFactory) {
          const models = await llmFactory.getModels(provider, abortController.signal);
          if (models.length > 0) {
            setCachedModels(provider, models);
            setProviderModels((prev) => ({ ...prev, [provider]: models }));
          } else {
            const fallback = PROVIDER_MODELS[provider] || [];
            setProviderModels((prev) => ({ ...prev, [provider]: fallback }));
          }
        } else {
          const fallback = PROVIDER_MODELS[provider] || [];
          setProviderModels((prev) => ({ ...prev, [provider]: fallback }));
        }
      } catch {
        const fallback = PROVIDER_MODELS[provider] || [];
        setProviderModels((prev) => ({ ...prev, [provider]: fallback }));
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

    const validRecentModels = recentModels.filter((r) => authenticatedProviders.includes(r.provider));
    for (const recent of validRecentModels) {
      const providerLabel = getProviderLabel(recent.provider);
      items.push({
        label: `⏱ ${recent.model} (${providerLabel})`,
        value: `${recent.provider}::${recent.model}`,
      });
    }

    for (const provider of authenticatedProviders) {
      const providerLabel = getProviderLabel(provider);
      const models = providerModels[provider] || [];
      const isLoading = loadingProviders[provider];

      if (isLoading && models.length === 0) {
        items.push({
          label: `${providerLabel}: Loading...`,
          value: `__loading__::${provider}`,
        });
      } else {
        for (const model of models) {
          const isRecent = validRecentModels.some((r) => r.provider === provider && r.model === model);
          if (!isRecent) {
            items.push({
              label: `${model} (${providerLabel})`,
              value: `${provider}::${model}`,
            });
          }
        }
      }
    }

    return items;
  }, [recentModels, authenticatedProviders, providerModels, loadingProviders]);

  const handleSelect = async (item: ComboBoxItem) => {
    if (item.value.startsWith('__loading__::')) return;

    const [provider, model] = item.value.split('::');
    if (!provider || !model) return;

    try {
      await context.config.set('activeProvider', provider, 'global');
      await context.config.set('model', model, 'global');
      await context.config.set(`providers.${provider}.model`, model, 'global');
      await addRecentModel(context.config, provider, model);
      deactivate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save model');
    }
  };

  const modalHeight = Math.min(rows - 4, 24);

  if (authenticatedProviders.length === 0) {
    return (
      <AppModal
        visible={true}
        title="Select Model"
        onClose={deactivate}
        closeOnEscape={true}
        height={8}
      >
        <Box flexDirection="column">
          <Text color="yellow">No providers configured.</Text>
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
      title="Select Model"
      onClose={deactivate}
      closeOnEscape={false}
      closeOnEnter={false}
      height={modalHeight}
    >
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {error && (
          <Box marginBottom={1}>
            <Text color="red">{error}</Text>
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

export function registerModelsV2Command(registry: CommandRegistry) {
  registry.register({
    id: '/modelv2',
    type: 'component',
    description: 'Select model from all authenticated providers.',
    category: 'config',
    component: ModelsV2CommandComponent,
  });
}
