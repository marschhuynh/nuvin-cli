import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useActiveModelActions } from '../hooks/useActiveModel';
import { CheckCircle, Circle, RefreshCw, Type, Image, Mic, Volume2, FileText } from 'lucide-react';
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface Model {
  id: string;
  name: string;
  enabled: boolean;
  modality?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  inputCost?: number;
  outputCost?: number;
  contextLength?: number;
  supportedParameters?: string[];
}

interface ModelsListProps {
  models: Model[];
  isLoading: boolean;
  searchQuery: string;
}

export function ModelsList({ models, isLoading, searchQuery }: ModelsListProps) {
  const { toggleModelEnabled } = useActiveModelActions();

  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: models.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  return (
    <div className="flex-1 overflow-hidden">
      {isLoading ? (
        <div className="text-center text-muted-foreground py-4">
          <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
          Loading models...
        </div>
      ) : models.length === 0 ? (
        <div className="text-center text-muted-foreground py-4">
          {searchQuery ? 'No models match your search' : 'No models available'}
        </div>
      ) : (
        <div className="overflow-auto" style={{ height: '100%' }} ref={listRef}>
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const model = models[virtualRow.index];
              return (
                <div
                  key={model.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
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
                            {((model.inputModalities?.length ?? 0) > 0 ||
                              (model.outputModalities?.length ?? 0) > 0) && (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {(model.inputModalities?.length ?? 0) > 0 && (
                                  <div
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30"
                                    title={`Input: ${model.inputModalities?.join(', ') ?? ''}`}
                                  >
                                    <span className="text-[9px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                                      IN
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                      {model.inputModalities?.includes('text') && (
                                        <Type className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                                      )}
                                      {model.inputModalities?.includes('image') && (
                                        <Image className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                                      )}
                                      {model.inputModalities?.includes('audio') && (
                                        <Mic className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                                      )}
                                      {model.inputModalities?.includes('file') && (
                                        <FileText className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                                      )}
                                    </div>
                                  </div>
                                )}
                                {(model.outputModalities?.length ?? 0) > 0 && (
                                  <div
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/30"
                                    title={`Output: ${model.outputModalities?.join(', ') ?? ''}`}
                                  >
                                    <span className="text-[9px] font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                                      OUT
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                      {model.outputModalities?.includes('text') && (
                                        <Type className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
                                      )}
                                      {model.outputModalities?.includes('image') && (
                                        <Image className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
                                      )}
                                      {model.outputModalities?.includes('audio') && (
                                        <Volume2 className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
                                      )}
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
