import { useEffect } from 'react';
import { Loader2, AlertCircle, Info } from 'lucide-react';
import {
  LLMProviderConfig,
  ProviderType,
  fetchProviderModels,
} from '@/lib/providers/provider-utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ModelSelectView } from './ModelSelectView';
import { useActiveProvider } from '../hooks/useActiveProvider';
import { useActiveModel, useActiveModelActions } from '../hooks/useActiveModel';

interface ModelSelectorProps {
  providerConfig: LLMProviderConfig;
  selectedModel?: string;
  onModelSelect: (modelId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ModelSelector({
  providerConfig,
  selectedModel,
  onModelSelect,
  disabled = false,
  className,
}: ModelSelectorProps) {
  const activeProviderConfig = useActiveProvider();
  const { enabledModels, isLoading, error } = useActiveModel();
  const { setProviderModels, setProviderLoading, setProviderError } = useActiveModelActions();

  useEffect(() => {
    console.log('Rendering ModelSelector with providerConfig:', activeProviderConfig);
    async function loadModels() {
      if (!activeProviderConfig?.apiKey) {
        setProviderModels([]);
        return;
      }

      setProviderLoading(true);
      setProviderError(null);

      try {
        const fetchedModels = await fetchProviderModels({
          type: activeProviderConfig.type as ProviderType,
          apiKey: activeProviderConfig.apiKey,
          name: activeProviderConfig.name,
        });
        setProviderModels(fetchedModels);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load models';
        setProviderError(errorMessage);
        setProviderModels([]);
        console.error('Failed to fetch models:', err);
      }
    }

    loadModels();
  }, [activeProviderConfig, setProviderModels, setProviderLoading, setProviderError]);

  const handleRefresh = () => {
    if (!isLoading && providerConfig?.apiKey) {
      setProviderError(null);
      setProviderModels([]);
      // Trigger useEffect by updating a dependency
      const loadModels = async () => {
        setProviderLoading(true);
        try {
          const fetchedModels = await fetchProviderModels(providerConfig);
          setProviderModels(fetchedModels);
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to load models';
          setProviderError(errorMessage);
          setProviderModels([]);
        }
      };
      loadModels();
    }
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 p-4 border rounded-lg bg-muted/50',
          className,
        )}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading models...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'p-4 border border-destructive/20 rounded-lg bg-destructive/5',
          className,
        )}
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-destructive">
              Error loading models: {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="mt-2 h-7 text-xs"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (enabledModels.length === 0) {
    return (
      <div className={cn('p-4 border rounded-lg bg-muted/50', className)}>
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {!providerConfig?.apiKey
              ? 'Enter an API key to load models'
              : 'No models available'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <ModelSelectView
        models={enabledModels}
        selectedModel={selectedModel}
        onModelSelect={onModelSelect}
        disabled={disabled}
      />
    </div>
  );
}
