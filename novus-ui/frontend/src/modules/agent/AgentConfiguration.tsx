import { useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, CheckCircle, Circle, Clock, Settings } from 'lucide-react';
import { AgentConfig, AgentSettings } from '@/types';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';

interface AgentConfigurationProps {
  onConfigChange?: (config: AgentConfig) => void;
  onReset?: () => void;
}

export function AgentConfiguration({
  onConfigChange,
  onReset
  }: AgentConfigurationProps) {
    const { agents, activeAgentId, setActiveAgent, reset } = useAgentStore();
    const { providers, activeProviderId, setActiveProvider } = useProviderStore();

  // Notify parent when store changes
  useEffect(() => {
    if (onConfigChange) {
      const config: AgentConfig = {
        selectedAgent: activeAgentId,
        agents
      };
      onConfigChange(config);
    }
  }, [agents, activeAgentId, providers, activeProviderId, onConfigChange]);

  const handleAgentChange = (agentId: string) => {
    setActiveAgent(agentId);
  };

  const handleReset = () => {
    reset();
    onReset?.();
  };

  const handleProviderChange = (providerId: string) => {
    setActiveProvider(providerId);
  };

  const selectedAgent = agents.find(agent => agent.id === activeAgentId);
  const selectedProvider = providers.find(provider => provider.id === activeProviderId);

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

  const getStatusText = (status?: AgentSettings['status']) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'busy':
        return 'Busy';
      default:
        return 'Available';
    }
  };

  // Helper function to get agent description based on persona
  const getAgentDescription = (agent: AgentSettings): string => {
    if (agent.description) return agent.description;

    // Generate description based on persona and agent type
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

    // Generate default tools based on persona
    const personaTools = {
      helpful: [
        { name: 'General Q&A', description: 'Answer questions on various topics', enabled: true },
        { name: 'Task Planning', description: 'Help organize and plan tasks', enabled: true },
        { name: 'Research Assistant', description: 'Provide research and information', enabled: true }
      ],
      professional: [
        { name: 'Business Analysis', description: 'Analyze business scenarios and data', enabled: true },
        { name: 'Report Generation', description: 'Create professional reports', enabled: true },
        { name: 'Strategic Planning', description: 'Assist with strategic decisions', enabled: true }
      ],
      creative: [
        { name: 'Content Creation', description: 'Generate creative content', enabled: true },
        { name: 'Brainstorming', description: 'Generate ideas and concepts', enabled: true },
        { name: 'Storytelling', description: 'Craft narratives and stories', enabled: true }
      ],
      analytical: [
        { name: 'Data Analysis', description: 'Analyze and interpret data', enabled: true },
        { name: 'Code Review', description: 'Review and optimize code', enabled: true },
        { name: 'Problem Solving', description: 'Break down complex problems', enabled: true }
      ],
      casual: [
        { name: 'Conversation', description: 'Friendly conversation partner', enabled: true },
        { name: 'Quick Help', description: 'Fast answers to simple questions', enabled: true },
        { name: 'Entertainment', description: 'Fun activities and games', enabled: true }
      ]
    };

    return personaTools[agent.persona] || [];
  };

  return (
    <div className="w-full sm:w-80 border-l border-border bg-card">
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
                      <span className="truncate">{agent.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Active Agent Info */}
          {selectedAgent && (
            <>
              {/* Agent Description */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Description</Label>
                <p className="text-xs sm:text-sm text-muted-foreground p-2 sm:p-3 bg-muted rounded-md">
                  {getAgentDescription(selectedAgent)}
                </p>
              </div>

              {/* Tools Used */}
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

              {/* System Prompt */}
              {/* <div className="space-y-2">
                <Label htmlFor="systemPrompt" className="text-xs sm:text-sm">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  value={selectedAgent.systemPrompt}
                  readOnly
                  rows={3}
                  className="text-xs sm:text-sm"
                />
              </div> */}
            </>
          )}

          <div className="flex items-center gap-2 text-sm font-medium mb-3 sm:mb-4">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Model Configuration</span>
            <span className="sm:hidden">Model</span>
          </div>

          {/* Provider Selection */}
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

        </div>
      </div>
    </div>
  );
}
