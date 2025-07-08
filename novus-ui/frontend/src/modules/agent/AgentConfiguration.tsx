import { useEffect, useState } from 'react';
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, CheckCircle, Circle, Clock, Settings, Globe, Home, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { AgentConfig, AgentSettings } from '@/types';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';
import { a2aService, A2AError } from '@/lib';
import { Button } from '@/components/ui/button';

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
    const { providers, activeProviderId, setActiveProvider } = useProviderStore();

    // State for remote agent card information
    const [agentCardInfo, setAgentCardInfo] = useState<AgentCardInfo | null>(null);
    const [loadingAgentCard, setLoadingAgentCard] = useState(false);
    const [agentCardError, setAgentCardError] = useState<string | null>(null);

  // Notify parent when store changes
  useEffect(() => {
    if (onConfigChange) {
      const config: AgentConfig = {
        selectedAgent: activeAgentId,
        agents
      };
      onConfigChange(config);
    }
  }, [agents, activeAgentId, providers, activeProviderId, onConfigChange, agentCardInfo]);

  // Fetch agent card info when a remote agent is selected
  useEffect(() => {
    const selectedAgent = agents.find(agent => agent.id === activeAgentId);

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
      const authConfig = agent.auth && agent.auth.type !== 'none' ? {
        type: agent.auth.type,
        token: agent.auth.token,
        username: agent.auth.username,
        password: agent.auth.password,
        headerName: agent.auth.headerName
      } : undefined;

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

  const handleRefreshAgentCard = () => {
    const selectedAgent = agents.find(agent => agent.id === activeAgentId);
    if (selectedAgent?.agentType === 'remote') {
      fetchAgentCardInfo(selectedAgent);
    }
  };

  const selectedAgent = agents.find(agent => agent.id === activeAgentId);

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
      helpful: 'A friendly and supportive assistant ready to help with various tasks.',
      professional: 'A business-focused assistant providing professional guidance and analysis.',
      creative: 'An imaginative assistant specializing in creative thinking and content generation.',
      analytical: 'A detail-oriented assistant focused on data analysis and logical reasoning.',
      casual: 'A relaxed and conversational assistant for everyday interactions.'
    };

    return personaDescriptions[agent.persona] || 'A versatile AI assistant.';
  };

  // Helper function to get default tools based on persona
  const getAgentTools = (agent: AgentSettings) => {
    if (agent.tools) return agent.tools;
    return [];
  };

  return (
    <div className="min-w-[200px] border-l border-border bg-card overflow-auto">
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-2 text-sm font-medium mb-3 sm:mb-4">
          <Bot className="h-4 w-4" />
          <span className="hidden sm:inline">Agent Configuration</span>
          <span className="sm:hidden">Agent</span>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Agent Selection */}
          <div className="space-y-2">
            <Label htmlFor="agent" className="text-xs sm:text-sm">Select Agent</Label>
            <Select
              value={activeAgentId}
              onValueChange={handleAgentChange}
            >
              <SelectTrigger className="text-xs sm:text-sm">
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id} className="text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(agent.status || 'active')}
                      {agent.agentType === 'remote' ? (
                        <Globe className="h-3 w-3 text-blue-500" />
                      ) : (
                        <Home className="h-3 w-3 text-green-500" />
                      )}
                      <span className="truncate">{agent.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {agent.agentType === 'remote' ? '(A2A)' : '(Local)'}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Active Agent Info */}
          {selectedAgent && (
            <>
              {/* Agent Description - Only show if no agent card info for remote agents */}
              {selectedAgent.agentType === 'local' && (
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm">Description</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground p-2 sm:p-3 bg-muted rounded-md">
                    {getAgentDescription(selectedAgent)}
                  </p>
                </div>
              )}

              {/* Tools/Skills - Only show for local agents or remote agents without agent card info */}
              {selectedAgent.agentType === 'local' && (
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm">Available Tools ({getAgentTools(selectedAgent).filter(t => t.enabled).length})</Label>
                  <div className="space-y-1 sm:space-y-2 max-h-28 sm:max-h-100 overflow-y-auto">
                    {getAgentTools(selectedAgent).map((tool, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-2 p-1.5 sm:p-2 rounded-md text-xs ${
                          tool.enabled ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full mt-1 sm:mt-1.5 ${
                          tool.enabled ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{tool.name}</div>
                          <div className="text-muted-foreground line-clamp-2 sm:line-clamp-none">{tool.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Provider Selection - Only show for local agents */}
          {selectedAgent?.agentType === 'local' && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium mb-3 sm:mb-4">
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">Model Configuration</span>
                <span className="sm:hidden">Model</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider" className="text-xs sm:text-sm">Select Provider</Label>
                <Select
                  value={activeProviderId}
                  onValueChange={handleProviderChange}
                >
                  <SelectTrigger className="text-xs sm:text-sm">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id} className="text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <Settings className="h-3 w-3 text-blue-500" />
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate font-medium">{provider.name}</span>
                            <span className="text-xs text-muted-foreground">{provider.type}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Remote Agent Info - Show for remote agents */}
          {selectedAgent?.agentType === 'remote' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline">Agent Card Information</span>
                  <span className="sm:hidden">Agent Card</span>
                </div>

                {selectedAgent.url && !loadingAgentCard && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshAgentCard}
                    className="h-6 w-6 p-0"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {/* Loading State */}
              {loadingAgentCard && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    Fetching agent information...
                  </span>
                </div>
              )}

              {/* Error State */}
              {agentCardError && !loadingAgentCard && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm text-destructive font-medium">
                        Failed to load agent information
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {agentCardError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Agent Card Information */}
              {agentCardInfo && !loadingAgentCard && (
                <div className="space-y-4">
                  {/* Agent Description - Only show if different from generic description */}
                  {agentCardInfo.description && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm">Agent Description</Label>
                      <p className="text-xs sm:text-sm text-muted-foreground p-2 sm:p-3 bg-muted rounded-md">
                        {agentCardInfo.description}
                      </p>
                    </div>
                  )}

                  {/* Capabilities */}
                  {agentCardInfo.capabilities.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm">
                        Capabilities ({agentCardInfo.capabilities.length})
                      </Label>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {agentCardInfo.capabilities.map((capability, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 p-1.5 sm:p-2 rounded-md text-xs bg-blue-50 border border-blue-200"
                          >
                            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500" />
                            <span className="font-medium capitalize">{capability}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {agentCardInfo.skills.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm">
                        Available Skills ({agentCardInfo.skills.length})
                      </Label>
                      <div className="space-y-1 sm:space-y-2 overflow-y-auto">
                        {agentCardInfo.skills.map((skill) => (
                          <div
                            key={skill.id}
                            className="flex items-start gap-2 p-1.5 sm:p-2 rounded-md text-xs bg-green-50 border border-green-200"
                          >
                            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full mt-1 sm:mt-1.5 bg-green-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{skill.name}</div>
                              <div className="text-muted-foreground line-clamp-2 sm:line-clamp-none">
                                {skill.description}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Provider Information */}
                  {agentCardInfo.provider && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm">Provider</Label>
                      <p className="text-xs sm:text-sm text-muted-foreground p-2 sm:p-3 bg-muted rounded-md">
                        {agentCardInfo.provider.name}
                        {agentCardInfo.provider.url && (
                          <span className="block text-xs font-mono mt-1 text-muted-foreground/80">
                            {agentCardInfo.provider.url}
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Version */}
                  {agentCardInfo.version && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm">Version</Label>
                      <p className="text-xs sm:text-sm text-muted-foreground p-2 sm:p-3 bg-muted rounded-md font-mono">
                        {agentCardInfo.version}
                      </p>
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
