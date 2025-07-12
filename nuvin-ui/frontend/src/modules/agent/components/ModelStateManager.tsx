import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActiveModel, useActiveModelActions } from '../hooks/useActiveModel';
import { useModelsStore } from '@/store/useModelsStore';
import { useProviderStore } from '@/store/useProviderStore';
import { CheckCircle, Circle, Eye, EyeOff, Search, RefreshCw } from 'lucide-react';
import { useState, useMemo } from 'react';
import { fetchProviderModels, type ProviderType } from '@/lib/providers/provider-utils';

export function ModelStateManager() {
  const { availableModels, isLoading, error } = useActiveModel();
  const { toggleModelEnabled, setProviderModels, setProviderLoading, setProviderError } = useActiveModelActions();
  const { enableAllModels, disableAllModels } = useModelsStore();
  const { activeProviderId, providers } = useProviderStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Get the active provider configuration
  const activeProvider = providers.find(p => p.id === activeProviderId);

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableModels;
    }

    const query = searchQuery.toLowerCase();
    return availableModels.filter(
      (model) =>
        model.name.toLowerCase().includes(query) ||
        model.description?.toLowerCase().includes(query),
    );
  }, [availableModels, searchQuery]);

  const handleReloadModels = async () => {
    if (!activeProvider || !activeProviderId || isLoading) {
      return;
    }

    setProviderError(null);
    setProviderLoading(true);

    try {
      const fetchedModels = await fetchProviderModels({
        type: activeProvider.type as ProviderType,
        apiKey: activeProvider.apiKey,
        name: activeProvider.name,
      });
      setProviderModels(fetchedModels);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reload models';
      setProviderError(errorMessage);
    }
  };

  if (!activeProviderId || (!availableModels.length && !isLoading && !error)) {
    return (
      <div className="p-3 border rounded-lg bg-card">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate">Model Management</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReloadModels}
            disabled={isLoading || !activeProvider?.apiKey}
            className="h-6 w-6 p-0 flex-shrink-0"
            title="Reload models"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          No models available for the current provider.
        </p>
      </div>
    );
  }

  const enabledCount = availableModels.filter((model) => model.enabled).length;
  const totalCount = availableModels.length;
  const filteredEnabledCount = filteredModels.filter(
    (model) => model.enabled,
  ).length;
  const filteredTotalCount = filteredModels.length;

  const handleEnableAll = () => {
    enableAllModels(activeProviderId);
  };

  const handleDisableAll = () => {
    disableAllModels(activeProviderId);
  };

  return (
    <div className="flex flex-col border rounded-lg bg-card overflow-hidden h-full">
      <div className="flex items-center justify-between p-3 border-b flex-shrink-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate">Model Management</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReloadModels}
            disabled={isLoading || !activeProvider?.apiKey}
            className="h-6 w-6 p-0 flex-shrink-0"
            title="Reload models"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-1 ml-2">
          {searchQuery
            ? `${filteredEnabledCount}/${filteredTotalCount}`
            : `${enabledCount}/${totalCount}`}
        </span>
      </div>

      <div className="flex flex-col p-3 flex-1 min-h-0">
        {/* Error Display */}
        {error && (
          <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Search Input */}
        <div className="mb-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 h-7 text-xs"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Bulk Actions */}
        <div className="flex gap-2 mb-3 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableAll}
            disabled={enabledCount === totalCount || isLoading}
            className="h-7 text-xs flex-1"
          >
            <Eye className="w-3 h-3 mr-1" />
            Enable All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisableAll}
            disabled={enabledCount === 0 || isLoading}
            className="h-7 text-xs flex-1"
          >
            <EyeOff className="w-3 h-3 mr-1" />
            Disable All
          </Button>
        </div>

        {/* Individual Model Controls */}
        <div className="space-y-2 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-4">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
              Loading models...
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              {searchQuery
                ? 'No models match your search'
                : 'No models available'}
            </div>
          ) : (
            filteredModels.map((model) => (
              <div
                key={model.id}
                className="flex items-center gap-2 p-2 rounded-md border bg-muted/20 overflow-hidden"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {model.enabled ? (
                    <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                  ) : (
                    <Circle className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <button
                      type="button"
                      className="text-xs font-medium cursor-pointer hover:text-primary transition-colors bg-transparent border-none p-0 m-0"
                      onClick={() => toggleModelEnabled(model.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleModelEnabled(model.id);
                        }
                      }}
                      title={model.name}
                      tabIndex={0}
                      aria-pressed={model.enabled}
                      disabled={isLoading}
                    >
                      {model.name}
                    </button>
                    {model.description && (
                      <div
                        className="text-xs text-muted-foreground mt-0.5"
                        title={model.description}
                      >
                        {model.description}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant={model.enabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleModelEnabled(model.id)}
                  className="h-6 w-6 p-0 flex-shrink-0"
                  title={model.enabled ? 'Disable model' : 'Enable model'}
                  disabled={isLoading}
                >
                  {model.enabled ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <Circle className="w-3 h-3" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
