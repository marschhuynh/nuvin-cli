import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useActiveModel, useActiveModelActions } from '../hooks/useActiveModel';
import { useModelsStore } from '@/store/useModelsStore';
import { useProviderStore } from '@/store/useProviderStore';
import { CheckCircle, Circle, Eye, EyeOff } from 'lucide-react';

export function ModelStateManager() {
  const { availableModels } = useActiveModel();
  const { toggleModelEnabled } = useActiveModelActions();
  const { enableAllModels, disableAllModels } = useModelsStore();
  const { activeProviderId } = useProviderStore();

  if (!activeProviderId || availableModels.length === 0) {
    return (
      <div className="p-3 border rounded-lg bg-card">
        <h3 className="text-sm font-medium mb-2">Model Management</h3>
        <p className="text-sm text-muted-foreground">
          No models available for the current provider.
        </p>
      </div>
    );
  }

  const enabledCount = availableModels.filter(model => model.enabled).length;
  const totalCount = availableModels.length;

  const handleEnableAll = () => {
    enableAllModels(activeProviderId);
  };

  const handleDisableAll = () => {
    disableAllModels(activeProviderId);
  };

  return (
    <div className="p-3 border rounded-lg bg-card  overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium truncate">Model Management</h3>
        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
          {enabledCount}/{totalCount}
        </span>
      </div>

      <div className="space-y-3">
        {/* Bulk Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableAll}
            disabled={enabledCount === totalCount}
            className="h-7 text-xs flex-1"
          >
            <Eye className="w-3 h-3 mr-1" />
            Enable All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisableAll}
            disabled={enabledCount === 0}
            className="h-7 text-xs flex-1"
          >
            <EyeOff className="w-3 h-3 mr-1" />
            Disable All
          </Button>
        </div>

        {/* Individual Model Controls */}
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {availableModels.map((model) => (
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
                  <div
                    className="text-xs font-medium truncate cursor-pointer hover:text-primary transition-colors"
                    onClick={() => toggleModelEnabled(model.id)}
                    title={model.name}
                  >
                    {model.name}
                  </div>
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
                variant={model.enabled ? "default" : "outline"}
                size="sm"
                onClick={() => toggleModelEnabled(model.id)}
                className="h-6 w-6 p-0 flex-shrink-0"
                title={model.enabled ? "Disable model" : "Enable model"}
              >
                {model.enabled ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}