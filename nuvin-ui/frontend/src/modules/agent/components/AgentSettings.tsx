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
  Loader2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Check,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useAgentStore } from "@/store/useAgentStore";
import { useState, useEffect } from "react";
import type { AgentSettings as AgentSettingsType } from "@/types";
import type { AgentToolConfig } from "@/types/tools";
import { a2aService, A2AError } from "@/lib";
import { toolRegistry } from "@/lib/tools";
import { LogInfo } from "@wails/runtime";

type AgentPersona =
  | "helpful"
  | "professional"
  | "creative"
  | "analytical"
  | "casual";
type ResponseLength = "short" | "medium" | "long";
type AgentType = "local" | "remote";

export function AgentSettings() {
  const { agents, deleteAgent, addAgent, updateAgent } = useAgentStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "success" | "error" | "warning"
  >("idle");

  const [agentData, setAgentData] = useState<{
    name: string;
    persona: AgentPersona;
    responseLength: ResponseLength;
    temperature: number;
    topP: number;
    maxTokens: number;
    systemPrompt: string;
    agentType: AgentType;
    url: string;
    auth: {
      type: "bearer" | "apikey" | "basic" | "none";
      token?: string;
      username?: string;
      password?: string;
      headerName?: string;
    };
    toolConfig: AgentToolConfig;
  }>({
    name: "",
    persona: "helpful",
    responseLength: "medium",
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 2048,
    systemPrompt:
      "You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.",
    agentType: "local",
    url: "",
    auth: { type: "none" },
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
        persona: selectedAgent.persona,
        responseLength:
          selectedAgent.responseLength === "detailed"
            ? "long"
            : selectedAgent.responseLength,
        temperature: selectedAgent.temperature,
        topP: selectedAgent.topP,
        maxTokens: selectedAgent.maxTokens,
        systemPrompt: selectedAgent.systemPrompt,
        agentType: selectedAgent.agentType,
        url: selectedAgent.url || "",
        auth: selectedAgent.auth || { type: "none" },
        toolConfig: selectedAgent.toolConfig || {
          enabledTools: [],
          maxConcurrentCalls: 3,
          timeoutMs: 30000,
        },
      });
      setConnectionStatus("idle");
    }
  }, [selectedAgent, isCreating]);

  const getStatusIcon = (status?: AgentSettingsType["status"]) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "busy":
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
        remainingAgents.length > 0 ? remainingAgents[0].id : null
      );
    }
  };

  const handleCreateAgent = () => {
    setIsCreating(true);
    setIsEditing(true);
    setSelectedAgentId(null);
    // Reset form to defaults
    setAgentData({
      name: "",
      persona: "helpful",
      responseLength: "medium",
      temperature: 0.7,
      topP: 1.0,
      maxTokens: 2048,
      systemPrompt:
        "You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.",
      agentType: "local",
      url: "",
      auth: { type: "none" },
      toolConfig: {
        enabledTools: [],
        maxConcurrentCalls: 3,
        timeoutMs: 30000,
      },
    });
    setConnectionStatus("idle");
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
        persona: selectedAgent.persona,
        responseLength:
          selectedAgent.responseLength === "detailed"
            ? "long"
            : selectedAgent.responseLength,
        temperature: selectedAgent.temperature,
        topP: selectedAgent.topP,
        maxTokens: selectedAgent.maxTokens,
        systemPrompt: selectedAgent.systemPrompt,
        agentType: selectedAgent.agentType,
        url: selectedAgent.url || "",
        auth: selectedAgent.auth || { type: "none" },
        toolConfig: selectedAgent.toolConfig || {
          enabledTools: [],
          maxConcurrentCalls: 3,
          timeoutMs: 30000,
        },
      });
    }
    setConnectionStatus("idle");
  };

  const handleSaveAgent = () => {
    if (!agentData.name.trim()) return;
    if (agentData.agentType === "remote" && !agentData.url.trim()) return;

    if (isCreating) {
      // Create new agent
      const newAgent: AgentSettingsType = {
        ...agentData,
        id: Date.now().toString(),
        auth: agentData.agentType === "remote" ? agentData.auth : undefined,
        toolConfig: agentData.toolConfig,
      };
      addAgent(newAgent);
      setSelectedAgentId(newAgent.id);
    } else if (selectedAgent) {
      // Update existing agent
      const updatedAgent: AgentSettingsType = {
        ...agentData,
        id: selectedAgent.id,
        auth: agentData.agentType === "remote" ? agentData.auth : undefined,
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
    setConnectionStatus("idle");

    try {
      const authConfig =
        agentData.auth.type !== "none"
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
        authConfig
      );
      LogInfo(`isConnected: ${isConnected}`);

      if (isConnected) {
        setConnectionStatus("success");
      } else {
        setConnectionStatus("error");
      }
    } catch (error: unknown) {
      console.error("A2A connection test failed:", error);

      if (error instanceof A2AError) {
        // Set warning for network errors, error for others
        setConnectionStatus("warning");
      } else {
        setConnectionStatus("error");
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case "success":
        return <Check className="h-4 w-4 text-green-500" />;
      case "error":
        return <X className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return testingConnection ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : agentData.url.trim() ? (
          <Wifi className="h-4 w-4 text-gray-400" />
        ) : (
          <WifiOff className="h-4 w-4 text-gray-300" />
        );
    }
  };

  const isFormValid =
    agentData.name.trim() &&
    (agentData.agentType === "local" ||
      (agentData.agentType === "remote" && agentData.url.trim()));

  return (
    <div className="flex h-full">
      {/* Left Panel - Agent List */}
      <div className="w-80 flex-shrink-0 border-r bg-card">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Agents</h2>
            <span className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground">
              {agents.length}
            </span>
          </div>
          <Button size="sm" onClick={handleCreateAgent}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-auto p-4">
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
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                    selectedAgentId === agent.id && !isCreating
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => {
                    if (!isEditing) {
                      setSelectedAgentId(agent.id);
                      setIsCreating(false);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {agent.agentType === "remote" ? (
                        <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      ) : (
                        <Home className="h-4 w-4 text-green-500 flex-shrink-0" />
                      )}
                      <span className="font-medium truncate">{agent.name}</span>
                    </div>
                    {getStatusIcon(agent.status)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{agent.persona}</span>
                    <span>•</span>
                    <span>{agent.responseLength} responses</span>
                  </div>
                  {agent.agentType === "remote" && agent.url && (
                    <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                      {agent.url}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Agent Form */}
      <div className="flex-1 flex flex-col">
        {(selectedAgent && !isCreating) || isEditing ? (
          <>
            {/* Form Header */}
            <div className="p-4 bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      agentData.agentType === "remote"
                        ? "bg-blue-50 dark:bg-blue-950/30"
                        : "bg-green-50 dark:bg-green-950/30"
                    }`}
                  >
                    {agentData.agentType === "remote" ? (
                      <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Home className="h-5 w-5 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold">
                      {isCreating
                        ? "Create New Agent"
                        : `Edit ${selectedAgent?.name}`}
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
                        Save
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

            {/* Agent Form */}
            <div className="flex-1 flex flex-col p-6 min-h-0">
              <div className="flex flex-col h-full space-y-6">
                {/* Basic Settings - 2 Column Responsive Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="agentName">Agent Name</Label>
                      {isEditing ? (
                        <Input
                          id="agentName"
                          value={agentData.name}
                          onChange={(e) =>
                            setAgentData((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          placeholder="Enter agent name"
                        />
                      ) : (
                        <div className="px-3 py-2 border rounded-md bg-background text-sm select-all h-9 flex items-center">
                          {agentData.name || "Unnamed Agent"}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label>Agent Type</Label>
                      {isEditing ? (
                        <div className="flex items-center space-x-0 bg-muted rounded-md p-0.5 h-9">
                          <button
                            type="button"
                            onClick={() =>
                              setAgentData((prev) => ({
                                ...prev,
                                agentType: "local",
                              }))
                            }
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex-1 ${
                              agentData.agentType === "local"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Local
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAgentData((prev) => ({
                                ...prev,
                                agentType: "remote",
                              }))
                            }
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex-1 ${
                              agentData.agentType === "remote"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Remote
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-background text-sm h-9">
                          {agentData.agentType === "remote" ? (
                            <Globe className="h-4 w-4 text-blue-500" />
                          ) : (
                            <Home className="h-4 w-4 text-green-500" />
                          )}
                          <span className="capitalize">
                            {agentData.agentType}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="persona">Persona</Label>
                      {agentData.agentType === "local" ? (
                        isEditing ? (
                          <Select
                            value={agentData.persona}
                            onValueChange={(value: AgentPersona) =>
                              setAgentData((prev) => ({
                                ...prev,
                                persona: value,
                              }))
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select persona" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="helpful">
                                Helpful Assistant
                              </SelectItem>
                              <SelectItem value="professional">
                                Professional
                              </SelectItem>
                              <SelectItem value="creative">Creative</SelectItem>
                              <SelectItem value="analytical">
                                Analytical
                              </SelectItem>
                              <SelectItem value="casual">Casual</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="px-3 py-2 border rounded-md bg-background text-sm capitalize select-all h-9 flex items-center">
                            {agentData.persona === "helpful"
                              ? "Helpful Assistant"
                              : agentData.persona}
                          </div>
                        )
                      ) : (
                        <div className="px-3 py-2 border rounded-md bg-muted/50 text-sm text-muted-foreground h-9 flex items-center">
                          Available for local agents only
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    {agentData.agentType === "local" ? (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="responseLength">
                            Response Length
                          </Label>
                          {isEditing ? (
                            <Select
                              value={agentData.responseLength}
                              onValueChange={(value: ResponseLength) =>
                                setAgentData((prev) => ({
                                  ...prev,
                                  responseLength: value,
                                }))
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
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-background text-sm capitalize select-all h-9 flex items-center">
                              {agentData.responseLength}
                            </div>
                          )}
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="temperature">
                            Temperature: {agentData.temperature}
                          </Label>
                          {isEditing ? (
                            <>
                              <Slider
                                value={[agentData.temperature]}
                                onValueChange={(value) =>
                                  setAgentData((prev) => ({
                                    ...prev,
                                    temperature: value[0],
                                  }))
                                }
                                max={2}
                                min={0}
                                step={0.1}
                                className="w-full"
                              />
                              <div className="flex justify-between text-xs text-muted-foreground h-5.5">
                                <span>Focused (0)</span>
                                <span>Creative (2)</span>
                              </div>
                            </>
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-background h-9 flex items-center justify-between">
                              <span className="select-all text-sm">
                                {agentData.temperature}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {agentData.temperature <= 0.3
                                  ? "Focused"
                                  : agentData.temperature >= 1.5
                                  ? "Creative"
                                  : "Balanced"}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="maxTokens">Max Tokens</Label>
                          {isEditing ? (
                            <Input
                              id="maxTokens"
                              type="number"
                              min="100"
                              max="8192"
                              value={agentData.maxTokens}
                              onChange={(e) =>
                                setAgentData((prev) => ({
                                  ...prev,
                                  maxTokens: parseInt(e.target.value) || 2048,
                                }))
                              }
                            />
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-background text-sm select-all h-9 flex items-center">
                              {agentData.maxTokens.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-2">
                          <Label htmlFor="agentUrl">Agent URL</Label>
                          {isEditing ? (
                            <>
                              <Input
                                id="agentUrl"
                                value={agentData.url}
                                onChange={(e) => {
                                  setAgentData((prev) => ({
                                    ...prev,
                                    url: e.target.value,
                                  }));
                                  setConnectionStatus("idle");
                                }}
                                placeholder="https://example.com/agent"
                                className="h-9"
                              />
                              <p className="text-xs text-muted-foreground">
                                The base URL of the A2A agent
                              </p>
                            </>
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-background text-sm font-mono break-all select-all h-9 flex items-center">
                              {agentData.url || "No URL configured"}
                            </div>
                          )}
                        </div>

                        {/* Test Connection */}
                        {isEditing && (
                          <div className="flex items-center gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={testConnection}
                              disabled={
                                !agentData.url.trim() || testingConnection
                              }
                              className="flex items-center gap-2 h-8.5"
                            >
                              {getConnectionIcon()}
                              Test Connection
                            </Button>

                            {connectionStatus !== "idle" && (
                              <span
                                className={`text-sm font-medium ${
                                  connectionStatus === "success"
                                    ? "text-green-600"
                                    : connectionStatus === "error"
                                    ? "text-red-600"
                                    : "text-yellow-600"
                                }`}
                              >
                                {connectionStatus === "success" &&
                                  "✅ Connected"}
                                {connectionStatus === "error" && "❌ Failed"}
                                {connectionStatus === "warning" && "⚠️ Issues"}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Placeholder for remote agent alignment */}
                        <div className="grid gap-2">
                          <Label>Remote Configuration</Label>
                          <div className="px-3 py-2 border rounded-md bg-muted/50 text-sm text-muted-foreground h-9 flex items-center">
                            Configure URL and authentication below
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Remote Agent Authentication */}
                {agentData.agentType === "remote" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="authType">Authentication Type</Label>
                        {isEditing ? (
                          <Select
                            value={agentData.auth.type}
                            onValueChange={(
                              value: "bearer" | "apikey" | "basic" | "none"
                            ) =>
                              setAgentData((prev) => ({
                                ...prev,
                                auth: { ...prev.auth, type: value },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select authentication type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                No Authentication
                              </SelectItem>
                              <SelectItem value="bearer">
                                Bearer Token
                              </SelectItem>
                              <SelectItem value="apikey">API Key</SelectItem>
                              <SelectItem value="basic">Basic Auth</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="px-3 py-2 border rounded-md bg-background text-sm select-all h-9 flex items-center">
                            {agentData.auth.type === "none"
                              ? "No Authentication"
                              : agentData.auth.type === "bearer"
                              ? "Bearer Token"
                              : agentData.auth.type === "apikey"
                              ? "API Key"
                              : agentData.auth.type === "basic"
                              ? "Basic Authentication"
                              : agentData.auth.type}
                          </div>
                        )}
                      </div>

                      {(agentData.auth.type === "bearer" ||
                        agentData.auth.type === "apikey") && (
                        <div className="space-y-2">
                          <Label htmlFor="authToken">
                            {agentData.auth.type === "bearer"
                              ? "Bearer Token"
                              : "API Key"}
                          </Label>
                          {isEditing ? (
                            <Input
                              id="authToken"
                              type="password"
                              value={agentData.auth.token || ""}
                              onChange={(e) =>
                                setAgentData((prev) => ({
                                  ...prev,
                                  auth: { ...prev.auth, token: e.target.value },
                                }))
                              }
                              placeholder={
                                agentData.auth.type === "bearer"
                                  ? "Enter bearer token"
                                  : "Enter API key"
                              }
                            />
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-background text-sm h-9 flex items-center">
                              {agentData.auth.token
                                ? "••••••••••••••••"
                                : "Not configured"}
                            </div>
                          )}
                        </div>
                      )}

                      {agentData.auth.type === "basic" && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            {isEditing ? (
                              <Input
                                id="username"
                                value={agentData.auth.username || ""}
                                onChange={(e) =>
                                  setAgentData((prev) => ({
                                    ...prev,
                                    auth: {
                                      ...prev.auth,
                                      username: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Enter username"
                              />
                            ) : (
                              <div className="px-3 py-2 border rounded-md bg-background text-sm select-all h-9 flex items-center">
                                {agentData.auth.username || "Not configured"}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            {isEditing ? (
                              <Input
                                id="password"
                                type="password"
                                value={agentData.auth.password || ""}
                                onChange={(e) =>
                                  setAgentData((prev) => ({
                                    ...prev,
                                    auth: {
                                      ...prev.auth,
                                      password: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Enter password"
                              />
                            ) : (
                              <div className="px-3 py-2 border rounded-md bg-background text-sm h-9 flex items-center">
                                {agentData.auth.password
                                  ? "••••••••••••••••"
                                  : "Not configured"}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Tools Configuration - Only for Local Agents */}
                {agentData.agentType === "local" && (
                  <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-center gap-2 mb-4">
                      <Wrench className="h-5 w-5 text-muted-foreground" />
                      <h3 className="text-base font-medium">Function Tools</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Available Tools */}
                      <div className="space-y-2">
                        <Label>Available Tools</Label>
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2 bg-background">
                          {toolRegistry.getAllTools().map((tool) => (
                            <div
                              key={tool.definition.name}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="checkbox"
                                id={`tool-${tool.definition.name}`}
                                checked={agentData.toolConfig.enabledTools.includes(
                                  tool.definition.name
                                )}
                                onChange={(e) => {
                                  if (!isEditing) return;
                                  const enabled = e.target.checked;
                                  setAgentData((prev) => ({
                                    ...prev,
                                    toolConfig: {
                                      ...prev.toolConfig,
                                      enabledTools: enabled
                                        ? [
                                            ...prev.toolConfig.enabledTools,
                                            tool.definition.name,
                                          ]
                                        : prev.toolConfig.enabledTools.filter(
                                            (name: string) =>
                                              name !== tool.definition.name
                                          ),
                                    },
                                  }));
                                }}
                                disabled={!isEditing}
                                className="h-4 w-4"
                              />
                              <label
                                htmlFor={`tool-${tool.definition.name}`}
                                className="text-sm font-medium cursor-pointer flex-1"
                              >
                                {tool.definition.name}
                              </label>
                              <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                                {tool.category || "utility"}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Enable tools that this agent can use during
                          conversations
                        </p>
                      </div>

                      {/* Tool Settings */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="maxConcurrentCalls">
                            Max Concurrent Tool Calls
                          </Label>
                          {isEditing ? (
                            <Input
                              id="maxConcurrentCalls"
                              type="number"
                              min="1"
                              max="10"
                              value={
                                agentData.toolConfig.maxConcurrentCalls || 3
                              }
                              onChange={(e) =>
                                setAgentData((prev) => ({
                                  ...prev,
                                  toolConfig: {
                                    ...prev.toolConfig,
                                    maxConcurrentCalls:
                                      parseInt(e.target.value) || 3,
                                  },
                                }))
                              }
                              className="h-9"
                            />
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-background text-sm h-9 flex items-center">
                              {agentData.toolConfig.maxConcurrentCalls || 3}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="timeoutMs">Tool Timeout (ms)</Label>
                          {isEditing ? (
                            <Input
                              id="timeoutMs"
                              type="number"
                              min="1000"
                              max="300000"
                              step="1000"
                              value={agentData.toolConfig.timeoutMs || 30000}
                              onChange={(e) =>
                                setAgentData((prev) => ({
                                  ...prev,
                                  toolConfig: {
                                    ...prev.toolConfig,
                                    timeoutMs:
                                      parseInt(e.target.value) || 30000,
                                  },
                                }))
                              }
                              className="h-9"
                            />
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-background text-sm h-9 flex items-center">
                              {(
                                agentData.toolConfig.timeoutMs || 30000
                              ).toLocaleString()}
                              ms
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>
                            • Max Concurrent: How many tools can run
                            simultaneously
                          </p>
                          <p>
                            • Timeout: Maximum time to wait for tool execution
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Enabled Tools Summary */}
                    {agentData.toolConfig.enabledTools.length > 0 && (
                      <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/30 rounded-md">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          <strong>
                            {agentData.toolConfig.enabledTools.length} tools
                            enabled:
                          </strong>{" "}
                          {agentData.toolConfig.enabledTools.join(", ")}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* System Prompt - Full Width at Bottom */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="grid gap-2 mb-4">
                    <Label htmlFor="systemPrompt">
                      {agentData.agentType === "remote"
                        ? "Instructions"
                        : "System Prompt"}
                    </Label>
                  </div>
                  {isEditing ? (
                    <Textarea
                      id="systemPrompt"
                      value={agentData.systemPrompt}
                      onChange={(e) =>
                        setAgentData((prev) => ({
                          ...prev,
                          systemPrompt: e.target.value,
                        }))
                      }
                      placeholder={
                        agentData.agentType === "remote"
                          ? "Enter instructions for the remote agent..."
                          : "Enter system prompt..."
                      }
                      className="flex-1 resize-none w-full min-h-[200px]"
                    />
                  ) : (
                    <div className="flex-1 p-3 border rounded-md bg-background text-sm leading-relaxed whitespace-pre-wrap min-h-[200px] overflow-auto select-all">
                      {agentData.systemPrompt || "No system prompt configured"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          // No agent selected or creating new agent
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
        )}
      </div>
    </div>
  );
}
