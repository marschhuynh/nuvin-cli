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
import { A2AError, a2aService } from '@/lib';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';
import { useModelsStore } from '@/store/useModelsStore';
import type { AgentConfig, AgentSettings } from '@/types';
import {
  AlertCircle,
  Bot,
  Globe,
  Home,
  Loader2,
  RefreshCw,
  Settings,
  Type,
  Eye,
  Mic,
  Image,
} from 'lucide-react';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { formatContextLength } from '@/lib/providers/provider-utils';

interface AgentConfigurationProps {
  onConfigChange?: (config: AgentConfig) => void;
  onReset?: () => void;
}

interface AgentCardInfo {
  name: string;
  description: string;
  capabilities: string[];
  skills: { id: string; name: string; description: string }[];
  version?: string;
  provider?: { name: string; url?: string };
}

export function AgentConfiguration({
  onConfigChange,
}: AgentConfigurationProps) {
  const navigate = useNavigate();
  const { agents, activeAgentId, setActiveAgent } = useAgentStore();
  const { providers, activeProviderId, updateProvider } = useProviderStore();
  const { getEnabledModels, loading, errors } = useModelsStore();

  // State for remote agent card information
  const [agentCardInfo, setAgentCardInfo] = useState<AgentCardInfo | null>(
    null,
  );
  const [loadingAgentCard, setLoadingAgentCard] = useState(false);
  const [agentCardError, setAgentCardError] = useState<string | null>(null);

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

  const fetchAgentCardInfo = useCallback(async (agent: AgentSettings) => {
    if (!agent.url) return;

    setLoadingAgentCard(true);
    setAgentCardError(null);

    try {
      // Create auth config
      const authConfig =
        agent.auth && agent.auth.type !== 'none'
          ? {
              type: agent.auth.type,
              token: agent.auth.token,
              username: agent.auth.username,
              password: agent.auth.password,
              headerName: agent.auth.headerName,
            }
          : undefined;

      // Fetch agent card information
      const agentInfo = await a2aService.getAgentInfo(agent.url, authConfig);

      if (agentInfo) {
        setAgentCardInfo(agentInfo);
      } else {
        setAgentCardError('Unable to fetch agent information');
      }
    } catch (error) {
      console.error('Failed to fetch agent card:', error);
      if (error instanceof A2AError) {
        setAgentCardError(error.getUserMessage());
      } else {
        setAgentCardError('Failed to connect to agent');
      }
    } finally {
      setLoadingAgentCard(false);
    }
  }, []);

  // Fetch agent card info when a remote agent is selected
  useEffect(() => {
    const selectedAgent = agents.find((agent) => agent.id === activeAgentId);

    if (selectedAgent?.agentType === 'remote' && selectedAgent.url) {
      fetchAgentCardInfo(selectedAgent);
    } else {
      // Clear agent card info for non-remote agents
      setAgentCardInfo(null);
      setAgentCardError(null);
    }
  }, [activeAgentId, agents, fetchAgentCardInfo]);

  const handleAgentChange = (agentId: string) => {
    setActiveAgent(agentId);
  };

  const handleModelChange = useCallback(
    (modelName: string) => {
      const activeProvider = providers.find((p) => p.id === activeProviderId);
      if (activeProvider) {
        const updatedProvider = {
          ...activeProvider,
          activeModel: {
            ...activeProvider.activeModel,
            model: modelName,
          },
        };
        updateProvider(updatedProvider);
      }
    },
    [activeProviderId, providers, updateProvider],
  );

  const handleRefreshAgentCard = () => {
    const selectedAgent = agents.find((agent) => agent.id === activeAgentId);
    if (selectedAgent?.agentType === 'remote') {
      fetchAgentCardInfo(selectedAgent);
    }
  };

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
  const getModalityIcons = (model: any) => {
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
  };

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
  }, [enabledModels]);

  // Helper function to get default tools based on persona
  const getAgentTools = (agent: AgentSettings) => {
    if (agent.tools) return agent.tools;
    return [];
  };

  const currentTools = selectedAgent
    ? getAgentTools(selectedAgent).filter((t) => t.enabled)
    : [];

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

          {/* Active Agent Info */}
          {selectedAgent && (
            <div className="space-y-4">
              {/* Available Tools */}
              {selectedAgent.agentType === 'local' &&
                currentTools.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">
                        Available Tools
                      </Label>
                      <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-600 font-medium">
                        {currentTools.length} tools
                      </span>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {getAgentTools(selectedAgent).map((tool) => (
                        <div
                          key={`${tool.name}`}
                          className={`flex items-start gap-3 p-4 rounded-lg border ${
                            tool.enabled
                              ? 'bg-muted/30'
                              : 'opacity-60 bg-muted/20'
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                              tool.enabled
                                ? 'bg-green-500'
                                : 'bg-muted-foreground'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm mb-1">
                              {tool.name}
                            </div>
                            <div className="text-xs text-muted-foreground leading-relaxed">
                              {tool.description}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

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

          {/* Remote Agent Info - Show for remote agents */}
          {selectedAgent?.agentType === 'remote' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b">
                <h3 className="font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Remote Agent Info
                </h3>
                {selectedAgent.url && !loadingAgentCard && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshAgentCard}
                    className="h-8 w-8 p-0"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Loading State */}
              {loadingAgentCard && (
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Connecting to agent...</span>
                  </div>
                </div>
              )}

              {/* Error State */}
              {agentCardError && !loadingAgentCard && (
                <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        Connection Failed
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {agentCardError}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Agent Card Information */}
              {agentCardInfo && !loadingAgentCard && (
                <div className="space-y-4">
                  {/* Agent Description */}
                  {agentCardInfo.description && (
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <Label className="text-sm font-medium mb-2 block">
                        Description
                      </Label>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {agentCardInfo.description}
                      </p>
                    </div>
                  )}

                  {/* Capabilities */}
                  {agentCardInfo.capabilities.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">
                          Capabilities
                        </Label>
                        <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-600 font-medium">
                          {agentCardInfo.capabilities.length} available
                        </span>
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {agentCardInfo.capabilities.map((capability) => (
                          <div
                            key={capability}
                            className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30"
                          >
                            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                            <span className="text-sm capitalize">
                              {capability}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {agentCardInfo.skills.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">
                          Available Skills
                        </Label>
                        <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-600 font-medium">
                          {agentCardInfo.skills.length} skills
                        </span>
                      </div>
                      <div className="space-y-2">
                        {agentCardInfo.skills.map((skill) => (
                          <div
                            key={skill.id}
                            className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30"
                          >
                            <div className="w-2 h-2 rounded-full mt-1 bg-green-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm mb-1">
                                {skill.name}
                              </div>
                              <div className="text-xs text-muted-foreground leading-relaxed">
                                {skill.description}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Provider & Version Info */}
                  {(agentCardInfo.provider || agentCardInfo.version) && (
                    <div className="space-y-4">
                      {agentCardInfo.provider && (
                        <div className="p-4 rounded-lg border bg-muted/30">
                          <Label className="text-sm font-medium mb-2 block">
                            Provider
                          </Label>
                          <div className="text-sm">
                            {agentCardInfo.provider.name}
                          </div>
                          {agentCardInfo.provider.url && (
                            <div className="text-xs font-mono text-muted-foreground mt-1">
                              {agentCardInfo.provider.url}
                            </div>
                          )}
                        </div>
                      )}

                      {agentCardInfo.version && (
                        <div className="p-4 rounded-lg border bg-muted/30">
                          <Label className="text-sm font-medium mb-2 block">
                            Version
                          </Label>
                          <div className="text-sm font-mono">
                            {agentCardInfo.version}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
