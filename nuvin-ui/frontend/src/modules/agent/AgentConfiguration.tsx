import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';
import { useModelsStore } from '@/store/useModelsStore';
import type { AgentConfig } from '@/types';
import {
  AlertCircle,
  Bot,
  Globe,
  Home,
  Loader2,
  Settings,
  Type,
  Eye,
  Mic,
  Image,
} from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { formatContextLength } from '@/lib/providers/provider-utils';
import { ConversationTodoList } from '@/components/conversation/ConversationTodoList';

interface AgentConfigurationProps {
  onConfigChange?: (config: AgentConfig) => void;
  onReset?: () => void;
}

export function AgentConfiguration({
  onConfigChange,
}: AgentConfigurationProps) {
  const navigate = useNavigate();
  const { agents, activeAgentId, setActiveAgent } = useAgentStore();
  const { providers, activeProviderId, updateProvider, setActiveProvider } = useProviderStore();
  const { getEnabledModels, loading, errors } = useModelsStore();

  // Notify parent when store changes
  useEffect(() => {
    if (onConfigChange) {
      const config: AgentConfig = {
        selectedAgent: activeAgentId,
        agents,
      };
      onConfigChange(config);
    }
  }, [agents, activeAgentId, onConfigChange]);

  const handleAgentChange = (agentId: string) => {
    setActiveAgent(agentId);
  };

  // Helper function to find which provider a model belongs to
  const findProviderForModel = useCallback((modelId: string) => {
    const { models } = useModelsStore.getState();
    for (const [providerId, providerModels] of Object.entries(models)) {
      if (providerModels.some(model => model.id === modelId)) {
        return providerId;
      }
    }
    return null;
  }, []);

  const handleModelChange = useCallback(
    (modelId: string) => {
      // Find which provider this model belongs to
      const targetProviderId = findProviderForModel(modelId);
      
      if (!targetProviderId) {
        console.error('Could not find provider for model:', modelId);
        return;
      }

      // Find the target provider
      const targetProvider = providers.find((p) => p.id === targetProviderId);
      if (!targetProvider) {
        console.error('Provider not found:', targetProviderId);
        return;
      }

      // Update the active provider if it's different
      if (activeProviderId !== targetProviderId) {
        setActiveProvider(targetProviderId);
      }

      // Update the model in the target provider
      const updatedProvider = {
        ...targetProvider,
        activeModel: {
          ...targetProvider.activeModel,
          model: modelId,
        },
      };
      updateProvider(updatedProvider);
    },
    [providers, activeProviderId, setActiveProvider, updateProvider, findProviderForModel],
  );

  const handleNavigateToProviderSettings = () => {
    navigate('/settings?tab=providers');
  };

  const selectedAgent = agents.find((agent) => agent.id === activeAgentId);
  const activeProvider = providers.find((p) => p.id === activeProviderId);

  // Get available models for the active provider from store
  const enabledModels = getEnabledModels();
  const isLoadingModels = loading[activeProviderId || ''] || false;
  const modelsError = errors[activeProviderId || ''] || null;

  // Helper function to get modality icons
  const getModalityIcons = useCallback((model: any) => {
    const icons = [];
    const modalities = model.inputModalities || [];

    if (modalities.includes('text') || modalities.length === 0) {
      icons.push(<Type key="text" className="h-1.5 w-1.5 text-blue-500" />);
    }
    if (modalities.includes('image') || model.modality === 'multimodal') {
      icons.push(
        <Image size={5} key="image" className="h-1.5 w-1.5 text-green-500" />,
      );
    }
    if (modalities.includes('audio')) {
      icons.push(<Mic key="audio" className="h-1.5 w-1.5 text-purple-500" />);
    }
    if (modalities.includes('video')) {
      icons.push(<Eye key="video" className="h-1.5 w-1.5 text-orange-500" />);
    }

    return icons.length > 0
      ? icons
      : [<Type key="text" className="h-1.5 w-1.5 text-blue-500" />];
  }, []);

  // Convert models to combobox options
  const modelOptions = useMemo(() => {
    return enabledModels.map((model) => {
      const [provider, modelName] = model.name.split(': ');
      const contextInfo = formatContextLength(model.contextLength);
      const costInfo = `$${model?.inputCost?.toFixed(
        2,
      )}/$${model?.outputCost?.toFixed(2)} / 1M`;
      const modalityIcons = getModalityIcons(model);

      return {
        value: model.id,
        label: model.name,
        searchContent: `${model.name} ${provider} ${modelName} ${contextInfo} ${costInfo}`,
        data: model,
        content: (
          <div className="flex flex-col gap-1 py-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate flex-1 min-w-0">
                {model.id}
              </span>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {contextInfo}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">{modalityIcons}</div>
              <span className="text-xs font-mono text-green-600">
                {costInfo}
              </span>
            </div>
          </div>
        ),
      };
    });
  }, [enabledModels, getModalityIcons]);

  return (
    <div className="min-w-[200px] w-full max-w-[300px] border-l border-border bg-card overflow-auto">
      <div className="p-3">
        <div className="mb-6">
          <h2 className="font-semibold text-lg flex items-center gap-2 border-b border-border pb-2">
            <Bot className="h-5 w-5 text-muted-foreground" />
            Agent Configuration
          </h2>
        </div>

        <div className="space-y-6">
          {/* Agent Selection */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Select Agent</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/settings?tab=agent')}
                className="h-4 w-4 p-0 hover:bg-muted/50"
                title="Go to Agent Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
            <Select value={activeAgentId} onValueChange={handleAgentChange}>
              <SelectTrigger>
                <SelectValue placeholder="Choose your AI assistant" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex items-center gap-2">
                      {agent.agentType === 'remote' ? (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Home className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{agent.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Configuration - Only show for local agents */}
          {selectedAgent?.agentType === 'local' && (
            <div className="space-y-6">
              {/* Model Selection */}
              {activeProvider && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Select Model</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleNavigateToProviderSettings}
                      className="h-4 w-4 p-0 hover:bg-muted/50"
                      title="Go to Provider Settings"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>

                  {isLoadingModels ? (
                    <div className="flex items-center gap-2 p-4 border rounded-lg bg-muted/50">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">
                        Loading models...
                      </span>
                    </div>
                  ) : modelsError ? (
                    <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-destructive">
                            Error loading models: {modelsError}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : modelOptions.length === 0 ? (
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          {!activeProvider?.apiKey
                            ? 'Configure provider to see available models'
                            : 'No models available for this provider'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Combobox
                      options={modelOptions}
                      value={activeProvider.activeModel?.model || ''}
                      onValueChange={handleModelChange}
                      placeholder="Select model..."
                      searchPlaceholder="Search models..."
                      emptyMessage="No models found"
                      className="w-full"
                      renderValue={(option) => {
                        const model = option.data;
                        const modalityIcons = getModalityIcons(model);
                        const costInfo = `$${model?.inputCost?.toFixed(
                          2,
                        )}/$${model?.outputCost?.toFixed(2)} / 1M`;
                        return (
                          <div className="flex flex-col gap-0.5 text-left py-0 w-full min-w-0">
                            <div className="font-medium text-sm truncate min-w-0">
                              {option.value}
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                {modalityIcons}
                              </div>
                              <div className="text-xs font-mono text-green-600 ml-auto flex-shrink-0">
                                {costInfo}
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Todo List Section */}
        <div className="mt-6">
          <ConversationTodoList />
        </div>
      </div>
    </div>
  );
}
