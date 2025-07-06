import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, CheckCircle, Circle, Clock } from 'lucide-react';
import { Agent, AgentConfig } from '@/types';
import { useAgentStore } from '@/store/useAgentStore';

interface AgentConfigurationProps {
  config?: AgentConfig;
  onConfigChange?: (config: AgentConfig) => void;
  onReset?: () => void;
}

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'general-assistant',
    name: 'General Assistant',
    description: 'A versatile AI assistant capable of helping with various tasks including writing, analysis, and problem-solving.',
    systemPrompt: 'You are a helpful AI assistant. Provide accurate, helpful, and friendly responses to user queries.',
    tools: [
      { name: 'text-analysis', description: 'Analyze and process text content', enabled: true },
      { name: 'web-search', description: 'Search the web for information', enabled: true },
      { name: 'code-generation', description: 'Generate and review code', enabled: true }
    ],
    status: 'active',
    lastUsed: '2 minutes ago'
  },
  {
    id: 'code-specialist',
    name: 'Code Specialist',
    description: 'Expert in software development, code review, debugging, and technical documentation.',
    systemPrompt: 'You are an expert software developer. Focus on providing high-quality code solutions, best practices, and technical guidance.',
    tools: [
      { name: 'code-generation', description: 'Generate and review code', enabled: true },
      { name: 'code-execution', description: 'Execute and test code snippets', enabled: true },
      { name: 'documentation', description: 'Generate technical documentation', enabled: true },
      { name: 'debugging', description: 'Debug and troubleshoot code', enabled: true }
    ],
    status: 'inactive',
    lastUsed: '1 hour ago'
  },
  {
    id: 'research-analyst',
    name: 'Research Analyst',
    description: 'Specialized in research, data analysis, and providing detailed insights on various topics.',
    systemPrompt: 'You are a research analyst. Provide thorough, well-researched responses with citations and evidence-based insights.',
    tools: [
      { name: 'web-search', description: 'Search the web for information', enabled: true },
      { name: 'data-analysis', description: 'Analyze datasets and trends', enabled: true },
      { name: 'fact-checking', description: 'Verify information accuracy', enabled: true },
      { name: 'citation-generation', description: 'Generate proper citations', enabled: true }
    ],
    status: 'inactive',
    lastUsed: 'Yesterday'
  }
];

const DEFAULT_CONFIG: AgentConfig = {
  selectedAgent: 'general-assistant',
  agents: DEFAULT_AGENTS
};

export function AgentConfiguration({
  config = DEFAULT_CONFIG,
  onConfigChange,
  onReset
}: AgentConfigurationProps) {
  const [localConfig, setLocalConfig] = useState<AgentConfig>(config);
  const { setActiveAgent } = useAgentStore();

  const updateConfig = (updates: Partial<AgentConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onConfigChange?.(newConfig);
    if (updates.selectedAgent) {
      setActiveAgent(updates.selectedAgent);
    }
  };

  const handleReset = () => {
    setLocalConfig(DEFAULT_CONFIG);
    onConfigChange?.(DEFAULT_CONFIG);
    setActiveAgent(DEFAULT_CONFIG.selectedAgent);
    onReset?.();
  };

  const selectedAgent = localConfig.agents.find(agent => agent.id === localConfig.selectedAgent);

  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'busy':
        return <Clock className="h-3 w-3 text-yellow-500" />;
      default:
        return <Circle className="h-3 w-3 text-gray-400" />;
    }
  };

  const getStatusText = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'busy':
        return 'Busy';
      default:
        return 'Inactive';
    }
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
              value={localConfig.selectedAgent}
              onValueChange={(value) => updateConfig({ selectedAgent: value })}
            >
              <SelectTrigger className="text-xs sm:text-sm">
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {localConfig.agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id} className="text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(agent.status)}
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
              {/* Agent Status */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Status</Label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedAgent.status)}
                    <span className="capitalize font-medium">{getStatusText(selectedAgent.status)}</span>
                  </div>
                  {selectedAgent.lastUsed && (
                    <span className="text-muted-foreground text-xs hidden sm:inline">
                      • Last used {selectedAgent.lastUsed}
                    </span>
                  )}
                  {selectedAgent.lastUsed && (
                    <span className="text-muted-foreground text-xs sm:hidden">
                      {selectedAgent.lastUsed}
                    </span>
                  )}
                </div>
              </div>

              {/* Agent Description */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Description</Label>
                <p className="text-xs sm:text-sm text-muted-foreground p-2 sm:p-3 bg-muted rounded-md">
                  {selectedAgent.description}
                </p>
              </div>

              {/* Tools Used */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Available Tools ({selectedAgent.tools.filter(t => t.enabled).length})</Label>
                <div className="space-y-1 sm:space-y-2 max-h-28 sm:max-h-32 overflow-y-auto">
                  {selectedAgent.tools.map((tool, index) => (
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
              <div className="space-y-2">
                <Label htmlFor="systemPrompt" className="text-xs sm:text-sm">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  value={selectedAgent.systemPrompt}
                  readOnly
                  rows={3}
                  className="text-xs sm:text-sm"
                />
              </div>
            </>
          )}

          <Button variant="outline" className="w-full text-xs sm:text-sm" onClick={handleReset}>
            Reset to Defaults
          </Button>
        </div>
      </div>
    </div>
  );
}
