import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { useAgentStore } from '@/store/useAgentStore';
import { ModelConfig, AgentSettings } from '@/types';
import { Check, X, Loader2, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { a2aService, A2AError, A2AErrorType } from '@/lib';
import { LogInfo } from '@wails/runtime';

interface AgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: AgentSettings | null; // If provided, we're editing; if null/undefined, we're creating
}

type AgentPersona = 'helpful' | 'professional' | 'creative' | 'analytical' | 'casual';
type ResponseLength = 'short' | 'medium' | 'long';
type AgentType = 'local' | 'remote';

export function AgentModal({ open, onOpenChange, agent = null }: AgentModalProps) {
  const { addAgent, updateAgent } = useAgentStore();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error' | 'warning'>('idle');
  const [connectionError, setConnectionError] = useState<string>('');
  const [connectionErrorType, setConnectionErrorType] = useState<A2AErrorType | undefined>();
  const [detailedError, setDetailedError] = useState<string>('');

  const [agentData, setAgentData] = useState<{
    name: string;
    persona: AgentPersona;
    responseLength: ResponseLength;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    agentType: AgentType;
    url: string; // For remote agents
    auth: {
      type: 'bearer' | 'apikey' | 'basic' | 'none';
      token?: string;
      username?: string;
      password?: string;
      headerName?: string;
    };
    modelConfig: ModelConfig;
  }>({
    name: '',
    persona: 'helpful' as AgentPersona,
    responseLength: 'medium' as ResponseLength,
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.',
    agentType: 'local' as AgentType,
    url: '',
    auth: {
      type: 'none'
    },
    modelConfig: {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.'
    }
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (agent) {
        // Editing existing agent - map agent properties to form state
        setAgentData({
          name: agent.name,
          persona: agent.persona,
          responseLength: agent.responseLength === 'detailed' ? 'long' : agent.responseLength,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          systemPrompt: agent.systemPrompt,
          agentType: agent.agentType,
          url: agent.url || '',
          auth: agent.auth || { type: 'none' },
          modelConfig: agent.modelConfig
        });
      } else {
        // Creating new agent - reset to defaults
        resetForm();
      }
    } else {
      // Dialog closed - reset connection status
      setConnectionStatus('idle');
      setConnectionError('');
      setConnectionErrorType(undefined);
      setDetailedError('');
    }
  }, [open, agent]);

  const testConnection = async () => {
    if (!agentData.url.trim()) return;

    setTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionError('');
    setConnectionErrorType(undefined);
    setDetailedError('');

    try {
      // Convert auth config for A2A service
      const authConfig = agentData.auth.type !== 'none' ? {
        type: agentData.auth.type,
        token: agentData.auth.token,
        username: agentData.auth.username,
        password: agentData.auth.password,
        headerName: agentData.auth.headerName
      } : undefined;

      // Test the connection using the enhanced A2A service
      const isConnected = await a2aService.testConnection(agentData.url, authConfig);
      LogInfo(`isConnected: ${isConnected}`);

      if (isConnected) {
        console.log('A2A Agent connected successfully');
        setConnectionStatus('success');

        // Try to get additional agent info
        try {
          const agentInfo = await a2aService.getAgentInfo(agentData.url, authConfig);
          if (agentInfo && agentInfo.capabilities.length > 0) {
            setConnectionError(`Connected! Agent supports: ${agentInfo.capabilities.join(', ')}`);
          }
        } catch {
          // Ignore agent info errors, connection is still successful
        }
      } else {
        setConnectionStatus('error');
        setConnectionError('Connection test failed - unable to reach agent');
        setDetailedError('The agent did not respond to connection attempts. Please verify the URL and ensure the agent is running.');
      }

    } catch (error: unknown) {
      console.error('A2A connection test failed:', error);
      setConnectionStatus('error');

      if (error instanceof A2AError) {
        setConnectionError(error.getUserMessage());
        setConnectionErrorType(error.type);
        setDetailedError(error.message);

        // Provide specific guidance based on error type
        if (error.type === A2AErrorType.NETWORK_ERROR) {
          setConnectionStatus('warning');
        }
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Connection failed';
        setConnectionError(errorMessage);
        setDetailedError('An unexpected error occurred during the connection test.');
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'success':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'error':
        return <X className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return testingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> :
               agentData.url.trim() ? <Wifi className="h-4 w-4 text-gray-400" /> :
               <WifiOff className="h-4 w-4 text-gray-300" />;
    }
  };

  const getConnectionMessage = () => {
    switch (connectionStatus) {
      case 'success':
        return (
          <div className="text-sm text-green-600">
            <div className="font-medium">✅ Connection successful!</div>
            {connectionError && <div className="text-xs mt-1">{connectionError}</div>}
          </div>
        );
      case 'error':
        return (
          <div className="text-sm text-red-600 space-y-1">
            <div className="font-medium">❌ Connection failed</div>
            <div className="text-xs">{connectionError}</div>
            {detailedError && (
              <details className="text-xs">
                <summary className="cursor-pointer hover:underline">Technical details</summary>
                <div className="mt-1 p-2 bg-red-50 rounded text-red-700">{detailedError}</div>
              </details>
            )}
            {connectionErrorType === A2AErrorType.NETWORK_ERROR && (
              <div className="text-xs mt-2 p-2 bg-blue-50 rounded text-blue-700">
                <strong>💡 Troubleshooting tips:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Verify the agent URL is correct and accessible</li>
                  <li>Check if the agent supports CORS for web requests</li>
                  <li>Ensure the agent server is running and reachable</li>
                  <li>Try accessing the agent URL directly in your browser</li>
                </ul>
              </div>
            )}
            {connectionErrorType === A2AErrorType.AUTHENTICATION_ERROR && (
              <div className="text-xs mt-2 p-2 bg-orange-50 rounded text-orange-700">
                <strong>🔐 Authentication Help:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Double-check your authentication credentials</li>
                  <li>Verify the authentication method is supported by the agent</li>
                  <li>Ensure API keys or tokens are active and have correct permissions</li>
                </ul>
              </div>
            )}
          </div>
        );
      case 'warning':
        return (
          <div className="text-sm text-yellow-600">
            <div className="font-medium">⚠️ Connection issues detected</div>
            <div className="text-xs">{connectionError}</div>
            {detailedError && <div className="text-xs mt-1">{detailedError}</div>}
          </div>
        );
      default:
        return null;
    }
  };

  const handleSubmit = () => {
    if (!agentData.name.trim()) return;

    // For remote agents, also check URL
    if (agentData.agentType === 'remote' && !agentData.url.trim()) return;

    if (agent) {
      // Editing existing agent
      const finalAgentData: AgentSettings = {
        ...agentData,
        id: agent.id,
        // Include authentication for remote agents
        auth: agentData.agentType === 'remote' ? agentData.auth : undefined,
        // Update model config for remote agents
        modelConfig: agentData.agentType === 'remote' ? {
          model: 'remote-a2a',
          temperature: agentData.temperature,
          maxTokens: agentData.maxTokens,
          topP: 1,
          systemPrompt: agentData.systemPrompt
        } : agentData.modelConfig
      };
      updateAgent(finalAgentData);
    } else {
      // Creating new agent
      const finalAgentData: AgentSettings = {
        ...agentData,
        id: Date.now().toString(),
        // Include authentication for remote agents
        auth: agentData.agentType === 'remote' ? agentData.auth : undefined,
        // Update model config for remote agents
        modelConfig: agentData.agentType === 'remote' ? {
          model: 'remote-a2a',
          temperature: agentData.temperature,
          maxTokens: agentData.maxTokens,
          topP: 1,
          systemPrompt: agentData.systemPrompt
        } : agentData.modelConfig
      };
      addAgent(finalAgentData);
    }

    onOpenChange(false);
  };

  const resetForm = () => {
    setConnectionStatus('idle');
    setConnectionError('');
    setConnectionErrorType(undefined);
    setDetailedError('');
    setAgentData({
      name: '',
      persona: 'helpful',
      responseLength: 'medium',
      temperature: 0.7,
      maxTokens: 2048,
      systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.',
      agentType: 'local',
      url: '',
      auth: {
        type: 'none'
      },
      modelConfig: {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2048,
        topP: 1,
        systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.'
      }
    });
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const isFormValid = agentData.name.trim() &&
    (agentData.agentType === 'local' ||
    (agentData.agentType === 'remote' && agentData.url.trim()));

  const isEditing = !!agent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{isEditing ? 'Edit Agent' : 'Add New Agent'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modify the agent configuration.' : 'Configure a new AI agent for your conversations.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="agentName">Agent Name</Label>
            <Input
              id="agentName"
              value={agentData.name}
              onChange={(e) => setAgentData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter agent name"
            />
          </div>

          <div className="grid gap-2">
            <Label>Agent Type</Label>
            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={() => setAgentData(prev => ({ ...prev, agentType: 'local' }))}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  agentData.agentType === 'local'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Local Agent
              </button>
              <button
                type="button"
                onClick={() => setAgentData(prev => ({ ...prev, agentType: 'remote' }))}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  agentData.agentType === 'remote'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Remote (A2A)
              </button>
            </div>
          </div>

          {/* Remote Agent Configuration */}
          {agentData.agentType === 'remote' && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="agentUrl">Agent URL</Label>
                <Input
                  id="agentUrl"
                  value={agentData.url}
                  onChange={(e) => {
                    setAgentData(prev => ({ ...prev, url: e.target.value }));
                    setConnectionStatus('idle');
                    setConnectionError('');
                    setConnectionErrorType(undefined);
                    setDetailedError('');
                  }}
                  placeholder="https://example.com/agent"
                />
                <p className="text-xs text-muted-foreground">
                  The base URL of the A2A agent
                </p>
              </div>

              {/* Enhanced Connection Test UI */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={testConnection}
                    disabled={!agentData.url.trim() || testingConnection}
                    className="flex items-center gap-2"
                  >
                    {getConnectionIcon()}
                    Test A2A Connection
                  </Button>

                  {agentData.url.trim() && connectionStatus === 'idle' && (
                    <span className="text-xs text-muted-foreground">
                      Click to test connection
                    </span>
                  )}
                </div>

                {/* Connection Status Display */}
                {connectionStatus !== 'idle' && (
                  <div className="p-3 rounded-lg border bg-card">
                    {getConnectionMessage()}
                  </div>
                )}
              </div>

              {/* Authentication Configuration */}
              <div className="grid gap-2">
                <Label htmlFor="authType">Authentication Type</Label>
                <Select
                  value={agentData.auth.type}
                  onValueChange={(value: 'bearer' | 'apikey' | 'basic' | 'none') =>
                    setAgentData(prev => ({
                      ...prev,
                      auth: { ...prev.auth, type: value }
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select authentication type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Authentication</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="apikey">API Key</SelectItem>
                    <SelectItem value="basic">Basic Auth (Username/Password)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bearer Token / API Key Fields */}
              {(agentData.auth.type === 'bearer' || agentData.auth.type === 'apikey') && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="authToken">
                      {agentData.auth.type === 'bearer' ? 'Bearer Token' : 'API Key'}
                    </Label>
                    <Input
                      id="authToken"
                      type="password"
                      value={agentData.auth.token || ''}
                      onChange={(e) => setAgentData(prev => ({
                        ...prev,
                        auth: { ...prev.auth, token: e.target.value }
                      }))}
                      placeholder={agentData.auth.type === 'bearer' ? 'Enter bearer token' : 'Enter API key'}
                    />
                  </div>

                  {agentData.auth.type === 'apikey' && (
                    <div className="grid gap-2">
                      <Label htmlFor="headerName">Header Name (Optional)</Label>
                      <Input
                        id="headerName"
                        value={agentData.auth.headerName || ''}
                        onChange={(e) => setAgentData(prev => ({
                          ...prev,
                          auth: { ...prev.auth, headerName: e.target.value }
                        }))}
                        placeholder="Authorization (default)"
                      />
                      <p className="text-xs text-muted-foreground">
                        Custom header name for API key (defaults to 'Authorization')
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Basic Auth Fields */}
              {agentData.auth.type === 'basic' && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={agentData.auth.username || ''}
                      onChange={(e) => setAgentData(prev => ({
                        ...prev,
                        auth: { ...prev.auth, username: e.target.value }
                      }))}
                      placeholder="Enter username"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={agentData.auth.password || ''}
                      onChange={(e) => setAgentData(prev => ({
                        ...prev,
                        auth: { ...prev.auth, password: e.target.value }
                      }))}
                      placeholder="Enter password"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* Shared Configuration - Available for all agent types */}
          <div className="grid gap-2">
            <Label htmlFor="systemPrompt">
              {agentData.agentType === 'remote' ? 'Instructions (sent to remote agent)' : 'System Prompt'}
            </Label>
            <Textarea
              id="systemPrompt"
              value={agentData.systemPrompt}
              onChange={(e) => setAgentData(prev => ({ ...prev, systemPrompt: e.target.value }))}
              placeholder={agentData.agentType === 'remote'
                ? "Enter instructions for the remote agent..."
                : "Enter system prompt..."
              }
              className="min-h-[100px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {agentData.agentType === 'remote'
                ? 'Instructions that will be sent to the remote agent along with your messages'
                : 'Define the agent\'s behavior and role'
              }
            </p>
          </div>

          {/* Local Agent Configuration */}
          {agentData.agentType === 'local' && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="persona">Persona</Label>
                <Select
                  value={agentData.persona}
                  onValueChange={(value: AgentPersona) =>
                    setAgentData(prev => ({ ...prev, persona: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select persona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="helpful">Helpful Assistant</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="creative">Creative</SelectItem>
                    <SelectItem value="analytical">Analytical</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="responseLength">Response Length</Label>
                <Select
                  value={agentData.responseLength}
                  onValueChange={(value: ResponseLength) =>
                    setAgentData(prev => ({ ...prev, responseLength: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select response length" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="long">Long</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="temperature">Temperature: {agentData.temperature}</Label>
                <Slider
                  value={[agentData.temperature]}
                  onValueChange={(value) => setAgentData(prev => ({ ...prev, temperature: value[0] }))}
                  max={2}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Focused (0)</span>
                  <span>Balanced (1)</span>
                  <span>Creative (2)</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxTokens">Max Tokens</Label>
                <Input
                  id="maxTokens"
                  type="number"
                  min="100"
                  max="8192"
                  value={agentData.maxTokens}
                  onChange={(e) => setAgentData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 2048 }))}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of tokens in the response (100-8192)
                </p>
              </div>
            </>
          )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid}
          >
            {isEditing ? 'Update Agent' : 'Add Agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
