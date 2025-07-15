import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { ModelInfo } from '@/lib/providers/llm-provider';
import {
  formatContextLength,
  formatModelCost,
} from '@/lib/providers/provider-utils';

interface ModelViewProps {
  models: ModelInfo[];
  selectedModel?: string;
  onModelSelect: (modelId: string) => void;
  disabled: boolean;
}

export function ModelSelectView({
  models,
  selectedModel,
  onModelSelect,
  disabled,
}: ModelViewProps) {
  const selectedModelInfo = models.find((m) => m.id === selectedModel);

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
                <div className="flex flex-col items-start">
                  <div className="font-medium">{model.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatContextLength(model.contextLength)} •{' '}
                    {formatModelCost(model.inputCost, model.outputCost)}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* {selectedModelInfo && (
        <div className="p-3 bg-muted/50 rounded-lg border">
          <h4 className="font-medium text-sm mb-2">{selectedModelInfo.name}</h4>
          {selectedModelInfo.description && (
            <p className="text-xs text-muted-foreground mb-2">
              {selectedModelInfo.description}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-medium text-muted-foreground">
                Context Length:
              </span>
              <div className="font-medium">
                {formatContextLength(selectedModelInfo.contextLength)}
              </div>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">
                Pricing:
              </span>
              <div className="font-medium">
                {formatModelCost(
                  selectedModelInfo.inputCost,
                  selectedModelInfo.outputCost,
                )}
              </div>
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
}
