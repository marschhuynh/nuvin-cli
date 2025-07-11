import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Check, Info } from 'lucide-react';
import { ModelInfo } from '@/lib/providers/llm-provider';
import { LLMProviderConfig, fetchProviderModels, formatModelCost, formatContextLength } from '@/lib/providers/provider-utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface ModelSelectorProps {
  providerConfig: LLMProviderConfig;
  selectedModel?: string;
  onModelSelect: (modelId: string) => void;
  disabled?: boolean;
  className?: string;
  showDetails?: boolean;
}

export function ModelSelector({
  providerConfig,
  selectedModel,
  onModelSelect,
  disabled = false,
  className,
  showDetails = true
}: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadModels() {
      if (!providerConfig?.apiKey) {
        setModels([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const fetchedModels = await fetchProviderModels(providerConfig);
        setModels(fetchedModels);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load models';
        setError(errorMessage);
        setModels([]);
        console.error('Failed to fetch models:', err);
      } finally {
        setLoading(false);
      }
    }

    loadModels();
  }, [providerConfig]);

  const handleRefresh = () => {
    if (!loading && providerConfig?.apiKey) {
      setError(null);
      setModels([]);
      // Trigger useEffect by updating a dependency
      const loadModels = async () => {
        setLoading(true);
        try {
          const fetchedModels = await fetchProviderModels(providerConfig);
          setModels(fetchedModels);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to load models';
          setError(errorMessage);
          setModels([]);
        } finally {
          setLoading(false);
        }
      };
      loadModels();
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 p-4 border rounded-lg bg-muted/50", className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading models...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-4 border border-destructive/20 rounded-lg bg-destructive/5", className)}>
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-destructive">Error loading models: {error}</p>
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

  if (models.length === 0) {
    return (
      <div className={cn("p-4 border rounded-lg bg-muted/50", className)}>
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {!providerConfig?.apiKey ? 'Enter an API key to load models' : 'No models available'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {showDetails ? (
        <ModelCardView
          models={models}
          selectedModel={selectedModel}
          onModelSelect={onModelSelect}
          disabled={disabled}
        />
      ) : (
        <ModelSelectView
          models={models}
          selectedModel={selectedModel}
          onModelSelect={onModelSelect}
          disabled={disabled}
        />
      )}
    </div>
  );
}

interface ModelViewProps {
  models: ModelInfo[];
  selectedModel?: string;
  onModelSelect: (modelId: string) => void;
  disabled: boolean;
}

function ModelCardView({ models, selectedModel, onModelSelect, disabled }: ModelViewProps) {
  return (
    <div className="grid gap-2">
      {models.map((model) => (
        <div
          key={model.id}
          className={cn(
            "p-3 border rounded-lg cursor-pointer transition-all duration-200",
            "hover:shadow-sm",
            selectedModel === model.id
              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
              : 'border-border hover:border-primary/50 hover:bg-accent/50',
            disabled && 'opacity-50 cursor-not-allowed hover:border-border hover:bg-transparent'
          )}
          onClick={() => !disabled && onModelSelect(model.id)}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-selected={selectedModel === model.id}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault();
              onModelSelect(model.id);
            }
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm truncate">{model.name}</h3>
                {selectedModel === model.id && (
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </div>
              {model.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {model.description}
                </p>
              )}
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="font-medium">Context:</span> {formatContextLength(model.contextLength)}
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-medium">Cost:</span> {formatModelCost(model.inputCost, model.outputCost)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ModelSelectView({ models, selectedModel, onModelSelect, disabled }: ModelViewProps) {
  const selectedModelInfo = models.find(m => m.id === selectedModel);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Select
          value={selectedModel || ''}
          onValueChange={onModelSelect}
          disabled={disabled}
        >
          <SelectTrigger id="model-select" className="w-full">
            <SelectValue placeholder="Choose a model..." />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatContextLength(model.contextLength)} • {formatModelCost(model.inputCost, model.outputCost)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedModelInfo && (
        <div className="p-3 bg-muted/50 rounded-lg border">
          <h4 className="font-medium text-sm mb-2">{selectedModelInfo.name}</h4>
          {selectedModelInfo.description && (
            <p className="text-xs text-muted-foreground mb-2">
              {selectedModelInfo.description}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-medium text-muted-foreground">Context Length:</span>
              <div className="font-medium">{formatContextLength(selectedModelInfo.contextLength)}</div>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Pricing:</span>
              <div className="font-medium">{formatModelCost(selectedModelInfo.inputCost, selectedModelInfo.outputCost)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Example usage component for testing/development
export function ModelSelectorExample() {
  const [selectedProvider, setSelectedProvider] = useState<LLMProviderConfig>({
    type: 'OpenAI',
    apiKey: '',
  });
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showDetails, setShowDetails] = useState(true);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Model Selection Demo</h1>
        <p className="text-muted-foreground">
          Test the model selection component with different providers and configurations.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider-select">Provider Type</Label>
            <Select
              value={selectedProvider.type}
              onValueChange={(value) => setSelectedProvider({
                ...selectedProvider,
                type: value as any,
                apiKey: '' // Clear API key when changing provider
              })}
            >
              <SelectTrigger id="provider-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OpenAI">OpenAI</SelectItem>
                <SelectItem value="Anthropic">Anthropic</SelectItem>
                <SelectItem value="OpenRouter">OpenRouter</SelectItem>
                <SelectItem value="GitHub">GitHub Copilot</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <input
              id="api-key"
              type="password"
              value={selectedProvider.apiKey}
              onChange={(e) => setSelectedProvider({
                ...selectedProvider,
                apiKey: e.target.value
              })}
              placeholder="Enter your API key"
              className="w-full h-9 px-3 py-2 border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 rounded-md"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show-details"
              checked={showDetails}
              onChange={(e) => setShowDetails(e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="show-details" className="text-sm">
              Show detailed view
            </Label>
          </div>
        </div>

        <div className="space-y-4">
          {selectedProvider.apiKey && (
            <div className="space-y-2">
              <Label>Available Models</Label>
              <ModelSelector
                providerConfig={selectedProvider}
                selectedModel={selectedModel}
                onModelSelect={setSelectedModel}
                showDetails={showDetails}
              />
            </div>
          )}

          {selectedModel && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <h3 className="font-medium text-sm mb-1">Selection Summary</h3>
              <p className="text-sm text-muted-foreground">
                <strong>Model:</strong> {selectedModel}
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Provider:</strong> {selectedProvider.type}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
