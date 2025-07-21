import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useActiveModel, useActiveModelActions } from '../hooks/useActiveModel';
import { useModelsStore } from '@/store/useModelsStore';
import { useProviderStore } from '@/store/useProviderStore';
import { CheckCircle, Circle, Eye, EyeOff, Search, RefreshCw, Type, Image, Mic, Volume2, FileText, Filter } from 'lucide-react';
import { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fetchProviderModels, type ProviderType } from '@/lib/providers/provider-utils';

export function ModelStateManager() {
  const { availableModels, isLoading, error } = useActiveModel();
  const { toggleModelEnabled, setProviderModels, setProviderLoading, setProviderError } = useActiveModelActions();
  const { enableAllModels, disableAllModels } = useModelsStore();
  const { activeProviderId, providers } = useProviderStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalityFilter, setModalityFilter] = useState<string | null>(null);

  // Get the active provider configuration
  const activeProvider = providers.find(p => p.id === activeProviderId);

  // Filter models based on search query and modality filter
  const filteredModels = useMemo(() => {
    let models = availableModels;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      models = models.filter(
        (model) =>
          model.id.toLowerCase().includes(query) ||
          model.modality?.toLowerCase().includes(query) ||
          model.name.toLowerCase().includes(query),
      );
    }

    // Apply modality filter
    if (modalityFilter) {
      models = models.filter((model) => {
        const inputModalities = model.inputModalities || [];
        const outputModalities = model.outputModalities || [];
        const allModalities = [...inputModalities, ...outputModalities];
        return allModalities.includes(modalityFilter);
      });
    }

    return models;
  }, [availableModels, searchQuery, modalityFilter]);

  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    useAnimationFrameWithResizeObserver: true,
    count: filteredModels.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 140,
    overscan: 7,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 140,
  });

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
      console.log('Fetched models:', fetchedModels);
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
          {searchQuery || modalityFilter
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

        {/* Filter and Bulk Actions */}
        <div className="flex items-center justify-between gap-4 mb-3 flex-shrink-0">
          {/* Modality Filters */}
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-muted-foreground" />
            <div className="flex gap-1">
              <Button
                variant={modalityFilter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setModalityFilter(null)}
                className="h-6 text-[10px] px-2"
              >
                All
              </Button>
              <Button
                variant={modalityFilter === 'text' ? "default" : "outline"}
                size="sm"
                onClick={() => setModalityFilter(modalityFilter === 'text' ? null : 'text')}
                className="h-6 text-[10px] px-2"
              >
                <Type className="w-3 h-3 mr-1" />
                Text
              </Button>
              <Button
                variant={modalityFilter === 'image' ? "default" : "outline"}
                size="sm"
                onClick={() => setModalityFilter(modalityFilter === 'image' ? null : 'image')}
                className="h-6 text-[10px] px-2"
              >
                <Image className="w-3 h-3 mr-1" />
                Image
              </Button>
              <Button
                variant={modalityFilter === 'audio' ? "default" : "outline"}
                size="sm"
                onClick={() => setModalityFilter(modalityFilter === 'audio' ? null : 'audio')}
                className="h-6 text-[10px] px-2"
              >
                <Mic className="w-3 h-3 mr-1" />
                Audio
              </Button>
              <Button
                variant={modalityFilter === 'file' ? "default" : "outline"}
                size="sm"
                onClick={() => setModalityFilter(modalityFilter === 'file' ? null : 'file')}
                className="h-6 text-[10px] px-2"
              >
                <FileText className="w-3 h-3 mr-1" />
                File
              </Button>
            </div>
          </div>
          
          {/* Bulk Actions */}
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnableAll}
              disabled={enabledCount === totalCount || isLoading}
              className="h-6 text-[10px] px-2"
            >
              <Eye className="w-3 h-3 mr-1" />
              Enable All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisableAll}
              disabled={enabledCount === 0 || isLoading}
              className="h-6 text-[10px] px-2"
            >
              <EyeOff className="w-3 h-3 mr-1" />
              Disable All
            </Button>
          </div>
        </div>

        {/* Individual Model Controls */}
        <div className="space-y-2 flex-1 overflow-y-auto" ref={listRef}>
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
            <div
              style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const model = filteredModels[virtualItem.index];
                return (
                  <div
                    key={model.id}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className="pb-2"
                  >
                    <div
                      className={`group relative p-4 rounded-lg border transition-all duration-200 hover:shadow-md ${
                        model.enabled
                          ? 'bg-card border-primary/20 shadow-sm'
                          : 'bg-muted/10 border-border hover:bg-muted/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Model ID, Modality Icons, and Toggle */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          className="text-sm font-semibold cursor-pointer hover:text-primary transition-colors bg-transparent border-none p-0 m-0 text-left truncate"
                          onClick={() => toggleModelEnabled(model.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleModelEnabled(model.id);
                            }
                          }}
                          title={model.id}
                          tabIndex={0}
                          aria-pressed={model.enabled}
                          disabled={isLoading}
                        >
                          {model.id}
                        </button>
                        
                        {/* Modality Icons */}
                        {((model.inputModalities?.length ?? 0) > 0 || (model.outputModalities?.length ?? 0) > 0) && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {(model.inputModalities?.length ?? 0) > 0 && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30" title={`Input: ${model.inputModalities?.join(', ') ?? ''}`}>
                                <span className="text-[9px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">IN</span>
                                <div className="flex items-center gap-0.5">
                                  {model.inputModalities?.includes('text') && <Type className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />}
                                  {model.inputModalities?.includes('image') && <Image className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />}
                                  {model.inputModalities?.includes('audio') && <Mic className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />}
                                  {model.inputModalities?.includes('file') && <FileText className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />}
                                </div>
                              </div>
                            )}
                            {(model.outputModalities?.length ?? 0) > 0 && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/30" title={`Output: ${model.outputModalities?.join(', ') ?? ''}`}>
                                <span className="text-[9px] font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">OUT</span>
                                <div className="flex items-center gap-0.5">
                                  {model.outputModalities?.includes('text') && <Type className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />}
                                  {model.outputModalities?.includes('image') && <Image className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />}
                                  {model.outputModalities?.includes('audio') && <Volume2 className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <Button
                        variant={model.enabled ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleModelEnabled(model.id)}
                        className="h-7 w-7 p-0 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                        title={model.enabled ? 'Disable model' : 'Enable model'}
                        disabled={isLoading}
                      >
                        {model.enabled ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : (
                          <Circle className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>

                    {/* Meta Information */}
                    <div className="flex items-center gap-4 text-xs">
                      {/* Price Info */}
                      {(model.inputCost !== undefined || model.outputCost !== undefined) && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-muted-foreground">Price:</span>
                          <span className="font-mono text-foreground">
                            {model.inputCost !== undefined && model.outputCost !== undefined
                              ? model.inputCost === 0 && model.outputCost === 0
                                ? 'Free'
                                : `$${model.inputCost.toFixed(3)}/$${model.outputCost.toFixed(3)}`
                              : 'N/A'}
                          </span>
                        </div>
                      )}

                      {/* Context Length */}
                      {model.contextLength && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-muted-foreground">Context:</span>
                          <span className="font-mono text-foreground">
                            {model.contextLength >= 1000
                              ? `${(model.contextLength / 1000).toFixed(0)}K tokens`
                              : `${model.contextLength} tokens`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Supported Parameters */}
                    {model.supportedParameters && model.supportedParameters.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {model.supportedParameters.map((param) => (
                          <Badge 
                            key={param} 
                            variant="outline" 
                            className="text-[10px] px-2 py-0.5 h-auto font-mono border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40 transition-colors"
                          >
                            {param}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
