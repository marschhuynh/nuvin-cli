import {
  Plus,
  Bot,
  Globe,
  Home,
  Clock,
  CheckCircle,
  Circle,
  Edit,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/store/useAgentStore';
import { useState, useEffect } from 'react';
import type { AgentSettings as AgentSettingsType } from '@/types';
import type { AgentToolConfig } from '@/types/tools';
import { a2aService, A2AError } from '@/lib';
import { LogInfo } from '@/lib/wails-runtime';

import { LocalAgentSettings } from './components/LocalAgentSettings';
import { RemoteAgentSettings } from './components/RemoteAgentSettings';
import { AuthenticationSettings } from './components/AuthenticationSettings';
import { ToolSettings } from './components/ToolSettings';
import { SystemPromptSettings } from './components/SystemPromptSettings';

type ResponseLength = 'short' | 'medium' | 'long';
type AgentType = 'local' | 'remote';

export function EmptyAgentSelected({
  handleCreateAgent,
}: {
  handleCreateAgent: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">
          No agent selected
        </h3>
        <p className="text-muted-foreground mb-4">
          Select an agent from the list to edit its configuration
        </p>
        <Button onClick={handleCreateAgent}>
          <Plus className="h-4 w-4 mr-2" />
          Create New Agent
        </Button>
      </div>
    </div>
  );
}

export function AgentSettings() {
  const { agents, deleteAgent, addAgent, updateAgent } = useAgentStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    agents[0]?.id || null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'success' | 'error' | 'warning'
  >('idle');

  const [agentData, setAgentData] = useState<{
    name: string;
    responseLength: ResponseLength;
    temperature: number;
    topP: number;
    maxTokens: number;
    systemPrompt: string;
    agentType: AgentType;
    url: string;
    auth: {
      type: 'bearer' | 'apikey' | 'basic' | 'none';
      token?: string;
      username?: string;
      password?: string;
      headerName?: string;
    };
    toolConfig: AgentToolConfig;
  }>({
    name: '',
    responseLength: 'medium',
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 2048,
    systemPrompt:
      'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.',
    agentType: 'local',
    url: '',
    auth: { type: 'none' },
    toolConfig: {
      enabledTools: [],
      maxConcurrentCalls: 3,
      timeoutMs: 30000,
    },
  });

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);

  // Initialize with first agent if available
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  // Load agent data when selected agent changes
  useEffect(() => {
    if (selectedAgent && !isCreating) {
      setAgentData({
        name: selectedAgent.name,
        responseLength:
          selectedAgent.responseLength === 'detailed'
            ? 'long'
            : selectedAgent.responseLength,
        temperature: selectedAgent.temperature,
        topP: selectedAgent.topP,
        maxTokens: selectedAgent.maxTokens,
        systemPrompt: selectedAgent.systemPrompt,
        agentType: selectedAgent.agentType,
        url: selectedAgent.url || '',
        auth: selectedAgent.auth || { type: 'none' },
        toolConfig: selectedAgent.toolConfig || {
          enabledTools: [],
          maxConcurrentCalls: 3,
          timeoutMs: 30000,
        },
      });
      setConnectionStatus('idle');
    }
  }, [selectedAgent, isCreating]);

  const getStatusIcon = (status?: AgentSettingsType['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'busy':
        return <Clock className="h-3 w-3 text-yellow-500" />;
      default:
        return <Circle className="h-3 w-3 text-gray-400" />;
    }
  };

  const handleDeleteAgent = (agentId: string) => {
    deleteAgent(agentId);
    // If we deleted the selected agent, select another one
    if (selectedAgentId === agentId) {
      const remainingAgents = agents.filter((a) => a.id !== agentId);
      setSelectedAgentId(
        remainingAgents.length > 0 ? remainingAgents[0].id : null,
      );
    }
  };

  const handleCreateAgent = () => {
    setIsCreating(true);
    setIsEditing(true);
    setSelectedAgentId(null);
    // Reset form to defaults
    setAgentData({
      name: '',
      responseLength: 'medium',
      temperature: 0.7,
      topP: 1.0,
      maxTokens: 2048,
      systemPrompt:
        'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.',
      agentType: 'local',
      url: '',
      auth: { type: 'none' },
      toolConfig: {
        enabledTools: [],
        maxConcurrentCalls: 3,
        timeoutMs: 30000,
      },
    });
    setConnectionStatus('idle');
  };

  const handleEditAgent = () => {
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsCreating(false);
    if (selectedAgent) {
      // Reload agent data
      setAgentData({
        name: selectedAgent.name,
        responseLength:
          selectedAgent.responseLength === 'detailed'
            ? 'long'
            : selectedAgent.responseLength,
        temperature: selectedAgent.temperature,
        topP: selectedAgent.topP,
        maxTokens: selectedAgent.maxTokens,
        systemPrompt: selectedAgent.systemPrompt,
        agentType: selectedAgent.agentType,
        url: selectedAgent.url || '',
        auth: selectedAgent.auth || { type: 'none' },
        toolConfig: selectedAgent.toolConfig || {
          enabledTools: [],
          maxConcurrentCalls: 3,
          timeoutMs: 30000,
        },
      });
    }
    setConnectionStatus('idle');
  };

  const handleSaveAgent = () => {
    if (!agentData.name.trim()) return;
    if (agentData.agentType === 'remote' && !agentData.url.trim()) return;

    if (isCreating) {
      // Create new agent
      const newAgent: AgentSettingsType = {
        ...agentData,
        id: Date.now().toString(),
        auth: agentData.agentType === 'remote' ? agentData.auth : undefined,
        toolConfig: agentData.toolConfig,
      };
      addAgent(newAgent);
      setSelectedAgentId(newAgent.id);
    } else if (selectedAgent) {
      // Update existing agent
      const updatedAgent: AgentSettingsType = {
        ...agentData,
        id: selectedAgent.id,
        auth: agentData.agentType === 'remote' ? agentData.auth : undefined,
        toolConfig: agentData.toolConfig,
      };
      updateAgent(updatedAgent);
    }

    setIsEditing(false);
    setIsCreating(false);
  };

  const testConnection = async () => {
    if (!agentData.url.trim()) return;

    setTestingConnection(true);
    setConnectionStatus('idle');

    try {
      const authConfig =
        agentData.auth.type !== 'none'
          ? {
              type: agentData.auth.type,
              token: agentData.auth.token,
              username: agentData.auth.username,
              password: agentData.auth.password,
              headerName: agentData.auth.headerName,
            }
          : undefined;

      const isConnected = await a2aService.testConnection(
        agentData.url,
        authConfig,
      );
      LogInfo(`isConnected: ${isConnected}`);

      if (isConnected) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    } catch (error: unknown) {
      console.error('A2A connection test failed:', error);

      if (error instanceof A2AError) {
        // Set warning for network errors, error for others
        setConnectionStatus('warning');
      } else {
        setConnectionStatus('error');
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const isFormValid =
    agentData.name.trim() &&
    (agentData.agentType === 'local' ||
      (agentData.agentType === 'remote' && agentData.url.trim()));

  return (
    <div className="flex h-full">
      {/* Left Panel - Agent List */}
      <div className="flex flex-col min-w-48 w-64 border-r bg-card">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Agents</h2>
            <span className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground">
              {agents.length}
            </span>
          </div>
          <Button
            size="sm"
            onClick={isCreating ? handleCancelEdit : handleCreateAgent}
            variant={isCreating ? 'outline' : 'default'}
            className={
              isCreating
                ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30'
                : ''
            }
          >
            {isCreating ? (
              <>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </>
            )}
          </Button>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-auto p-4">
          {/* Create Mode Banner */}
          {isCreating && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Creating New Agent
                </span>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                Fill out the form to create your new agent
              </p>
            </div>
          )}

          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bot className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-muted-foreground mb-2">
                No agents yet
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first AI agent to get started
              </p>
              <Button onClick={handleCreateAgent}>
                <Plus className="h-4 w-4 mr-2" />
                Add New Agent
              </Button>
            </div>
          ) : (
            <div className={`space-y-2 ${isCreating ? 'opacity-50' : ''}`}>
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`cursor-pointer w-full text-left p-3 rounded-lg border transition-all hover:shadow-sm focus:outline-none  ${
                    selectedAgentId === agent.id && !isCreating
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50'
                  } ${isCreating ? 'pointer-events-none' : ''}`}
                  onClick={() => {
                    if (!isEditing) {
                      setSelectedAgentId(agent.id);
                      setIsCreating(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
                      e.preventDefault();
                      setSelectedAgentId(agent.id);
                      setIsCreating(false);
                    }
                  }}
                  disabled={isEditing}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {agent.agentType === 'remote' ? (
                        <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      ) : (
                        <Home className="h-4 w-4 text-green-500 flex-shrink-0" />
                      )}
                      <span className="font-medium truncate">{agent.name}</span>
                    </div>
                    {getStatusIcon(agent.status)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{agent.responseLength} responses</span>
                  </div>
                  {agent.agentType === 'remote' && agent.url && (
                    <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                      {agent.url}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Agent Form */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {(selectedAgent && !isCreating) || isEditing ? (
          <>
            {/* Form Header */}
            <div
              className={`p-4 border-b ${
                isCreating
                  ? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800'
                  : 'bg-card'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-1.5 rounded-lg ${
                      isCreating
                        ? 'bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-200 dark:ring-blue-700'
                        : agentData.agentType === 'remote'
                          ? 'bg-blue-50 dark:bg-blue-950/30'
                          : 'bg-green-50 dark:bg-green-950/30'
                    }`}
                  >
                    {isCreating ? (
                      <Plus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    ) : agentData.agentType === 'remote' ? (
                      <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Home className="h-5 w-5 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  <div>
                    <h1
                      className={`text-lg font-semibold ${
                        isCreating ? 'text-blue-900 dark:text-blue-100' : ''
                      }`}
                    >
                      {isCreating
                        ? 'Create New Agent'
                        : `${isEditing ? 'Edit' : ''} ${selectedAgent?.name}`}
                    </h1>
                  </div>
                </div>
                <div className="flex gap-2">
                  {isEditing && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEdit}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveAgent}
                        disabled={!isFormValid}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        {isCreating ? 'Create' : 'Save'}
                      </Button>
                    </>
                  )}
                  {!isEditing && selectedAgent && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEditAgent}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteAgent(selectedAgent.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Agent Form - 2 Column Layout */}
            <div className={'flex-1 flex gap-6 min-h-0 p-6 overflow-hidden'}>
              {/* Left Column - Agent Configuration */}
              <div className="flex flex-col w-2/5 space-y-6">
                {/* Local Agent Settings */}
                {agentData.agentType === 'local' && (
                  <LocalAgentSettings
                    name={agentData.name}
                    agentType={agentData.agentType}
                    isEditing={isEditing}
                    onNameChange={(name) =>
                      setAgentData({ ...agentData, name })
                    }
                    onAgentTypeChange={(agentType) =>
                      setAgentData({ ...agentData, agentType })
                    }
                    responseLength={agentData.responseLength}
                    temperature={agentData.temperature}
                    topP={agentData.topP}
                    maxTokens={agentData.maxTokens}
                    onResponseLengthChange={(responseLength) =>
                      setAgentData({ ...agentData, responseLength })
                    }
                    onTemperatureChange={(temperature) =>
                      setAgentData({ ...agentData, temperature })
                    }
                    onTopPChange={(topP) =>
                      setAgentData({ ...agentData, topP })
                    }
                    onMaxTokensChange={(maxTokens) =>
                      setAgentData({ ...agentData, maxTokens })
                    }
                  />
                )}

                {/* Remote Agent Settings */}
                {agentData.agentType === 'remote' && (
                  <RemoteAgentSettings
                    url={agentData.url}
                    isEditing={isEditing}
                    isTestingConnection={testingConnection}
                    connectionStatus={connectionStatus}
                    onUrlChange={(url) => {
                      setAgentData({ ...agentData, url });
                      setConnectionStatus('idle');
                    }}
                    onTestConnection={testConnection}
                  />
                )}

                {/* Authentication Settings for Remote Agents */}
                {agentData.agentType === 'remote' && (
                  <AuthenticationSettings
                    auth={agentData.auth}
                    isEditing={isEditing}
                    onAuthChange={(auth) =>
                      setAgentData({ ...agentData, auth })
                    }
                  />
                )}

                {/* Tool Settings for Local Agents */}
                {agentData.agentType === 'local' && (
                  <ToolSettings
                    toolConfig={agentData.toolConfig}
                    isEditing={isEditing}
                    onToolConfigChange={(toolConfig) =>
                      setAgentData({ ...agentData, toolConfig })
                    }
                  />
                )}
              </div>
              {/* Right Column - System Prompt */}
              <div className="w-3/5 h-full">
                <SystemPromptSettings
                  systemPrompt={agentData.systemPrompt}
                  agentType={agentData.agentType}
                  isEditing={isEditing}
                  onSystemPromptChange={(systemPrompt) =>
                    setAgentData({ ...agentData, systemPrompt })
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <EmptyAgentSelected handleCreateAgent={handleCreateAgent} />
        )}
      </div>
    </div>
  );
}
