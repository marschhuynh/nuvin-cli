import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { A2AError, a2aService, type ProviderType } from '@/lib';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';
import type { AgentConfig, AgentSettings } from '@/types';
import {
  AlertCircle,
  Bot,
  CheckCircle,
  Circle,
  Clock,
  Globe,
  Home,
  Loader2,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ModelSelector } from '@/modules/agent/components/ModelSelector';

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
  const { agents, activeAgentId, setActiveAgent } = useAgentStore();
  const { providers, activeProviderId, setActiveProvider, updateProvider } =
    useProviderStore();

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
  }, [
    agents,
    activeAgentId,
    providers,
    activeProviderId,
    onConfigChange,
    agentCardInfo,
  ]);

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
  }, [activeAgentId, agents]);

  const fetchAgentCardInfo = async (agent: AgentSettings) => {
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
  };

  const handleAgentChange = (agentId: string) => {
    setActiveAgent(agentId);
  };

  const handleProviderChange = (providerId: string) => {
    setActiveProvider(providerId);
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
    [activeProviderId],
  );

  const handleRefreshAgentCard = () => {
    const selectedAgent = agents.find((agent) => agent.id === activeAgentId);
    if (selectedAgent?.agentType === 'remote') {
      fetchAgentCardInfo(selectedAgent);
    }
  };

  const selectedAgent = agents.find((agent) => agent.id === activeAgentId);
  const activeProvider = providers.find((p) => p.id === activeProviderId);

  const getStatusIcon = (status?: AgentSettings['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'busy':
        return <Clock className="h-3 w-3 text-yellow-500" />;
      default:
        return <Circle className="h-3 w-3 text-gray-400" />;
    }
  };

  // Helper function to get agent description based on persona
  const getAgentDescription = (agent: AgentSettings): string => {
    if (agent.description) return agent.description;

    // For remote agents, provide a generic description since detailed info is shown in agent card
    if (agent.agentType === 'remote') {
      return `Remote A2A agent${agent.url ? ` connected to ${agent.url}` : ''}. This agent is hosted externally and follows the Agent2Agent protocol.`;
    }

    // Generate description based on persona for local agents
    const personaDescriptions = {
      helpful:
        'A friendly and supportive assistant ready to help with various tasks.',
      professional:
        'A business-focused assistant providing professional guidance and analysis.',
      creative:
        'An imaginative assistant specializing in creative thinking and content generation.',
      analytical:
        'A detail-oriented assistant focused on data analysis and logical reasoning.',
      casual:
        'A relaxed and conversational assistant for everyday interactions.',
    };

    return personaDescriptions[agent.persona] || 'A versatile AI assistant.';
  };

  // Helper function to get default tools based on persona
  const getAgentTools = (agent: AgentSettings) => {
    if (agent.tools) return agent.tools;
    return [];
  };

  const currentTools = selectedAgent
    ? getAgentTools(selectedAgent).filter((t) => t.enabled)
    : [];

  return (
    <div className="min-w-[280px] w-full max-w-[480px] border-l border-border bg-card overflow-auto">
      <div className="p-3">
        <div className="mb-6">
          <h2 className="font-semibold text-lg flex items-center gap-2 border-b border-border pb-2">
            <Bot className="h-5 w-5 text-muted-foreground" />
            Agent Configuration
          </h2>
        </div>

        <div className="space-y-6">
          {/* Agent Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Agent</Label>
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
              {/* Agent Description Card */}
              {selectedAgent.agentType === 'local' && (
                <div className="p-4 rounded-lg border bg-muted/30">
                  <Label className="text-sm font-medium mb-2 block">Description</Label>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {getAgentDescription(selectedAgent)}
                  </p>
                </div>
              )}

              {/* Available Tools */}
              {selectedAgent.agentType === 'local' && currentTools.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Available Tools</Label>
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
                            tool.enabled ? 'bg-green-500' : 'bg-muted-foreground'
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
              <div className="flex items-center justify-between pb-3 border-b">
                <h3 className="font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Model Configuration
                </h3>
              </div>

              <div className="space-y-4">
                <Label className="text-sm font-medium">Select Provider</Label>
                <Select
                  value={activeProviderId}
                  onValueChange={handleProviderChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose AI provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-muted-foreground" />
                          <span>{provider.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model Selection */}
              {activeProvider && (
                <div className="space-y-4">
                  <Label className="text-sm font-medium">Select Model</Label>
                  <ModelSelector
                    providerConfig={{
                      type: activeProvider.type as ProviderType,
                      apiKey: activeProvider.apiKey,
                      name: activeProvider.name,
                    }}
                    selectedModel={activeProvider.activeModel?.model || ''}
                    onModelSelect={handleModelChange}
                  />
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
                      <div className="font-medium text-sm">Connection Failed</div>
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
                      <Label className="text-sm font-medium mb-2 block">Description</Label>
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
                        <Label className="text-sm font-medium">Capabilities</Label>
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
                            <span className="text-sm capitalize">{capability}</span>
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
                        <Label className="text-sm font-medium">Available Skills</Label>
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
                              <div className="font-medium text-sm mb-1">{skill.name}</div>
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
                          <Label className="text-sm font-medium mb-2 block">Provider</Label>
                          <div className="text-sm">{agentCardInfo.provider.name}</div>
                          {agentCardInfo.provider.url && (
                            <div className="text-xs font-mono text-muted-foreground mt-1">
                              {agentCardInfo.provider.url}
                            </div>
                          )}
                        </div>
                      )}

                      {agentCardInfo.version && (
                        <div className="p-4 rounded-lg border bg-muted/30">
                          <Label className="text-sm font-medium mb-2 block">Version</Label>
                          <div className="text-sm font-mono">{agentCardInfo.version}</div>
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
