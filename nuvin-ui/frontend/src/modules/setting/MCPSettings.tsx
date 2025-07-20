import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Edit,
  Trash2,
  Play,
  Pause,
  Settings,
  X,
  Save,
} from "lucide-react";
import { useUserPreferenceStore } from "@/store/useUserPreferenceStore";
import { MCPConfig } from "@/store/useUserPreferenceStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface MCPSettingsProps {
  settings: any;
  onSettingsChange: (settings: any) => void;
}

export function MCPSettings({ settings, onSettingsChange }: MCPSettingsProps) {
  const { preferences, updatePreferences } = useUserPreferenceStore();
  const [showAddMCPModal, setShowAddMCPModal] = useState(false);
  const [editingMCP, setEditingMCP] = useState<MCPConfig | null>(null);
  const [selectedMCPId, setSelectedMCPId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [mcpForm, setMcpForm] = useState<Partial<MCPConfig>>({
    name: "",
    command: "",
    args: [],
    env: {},
    enabled: true,
    description: "",
  });

  const selectedMCP = preferences.mcpServers.find(
    (mcp) => mcp.id === selectedMCPId
  );

  const handleAddMCP = () => {
    setEditingMCP(null);
    setMcpForm({
      name: "",
      command: "",
      args: [],
      env: {},
      enabled: true,
      description: "",
    });
    setShowAddMCPModal(true);
  };

  const handleEditMCP = (mcp: MCPConfig) => {
    setEditingMCP(mcp);
    setSelectedMCPId(mcp.id);
    setMcpForm({
      name: mcp.name,
      command: mcp.command,
      args: mcp.args || [],
      env: mcp.env || {},
      enabled: mcp.enabled,
      description: mcp.description || "",
    });
    setIsEditing(true);
  };

  const handleDeleteMCP = (mcpId: string) => {
    const updatedServers = preferences.mcpServers.filter(
      (server) => server.id !== mcpId
    );
    updatePreferences({ mcpServers: updatedServers });
    if (selectedMCPId === mcpId) {
      const remainingServers = updatedServers;
      setSelectedMCPId(
        remainingServers.length > 0 ? remainingServers[0].id : null
      );
    }
  };

  const handleCreateMCP = () => {
    setEditingMCP(null);
    setSelectedMCPId(null);
    setMcpForm({
      name: "",
      command: "",
      args: [],
      env: {},
      enabled: true,
      description: "",
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingMCP(null);
    if (selectedMCP) {
      // Reload MCP data
      setMcpForm({
        name: selectedMCP.name,
        command: selectedMCP.command,
        args: selectedMCP.args || [],
        env: selectedMCP.env || {},
        enabled: selectedMCP.enabled,
        description: selectedMCP.description || "",
      });
    }
  };

  const handleSaveMCPInline = () => {
    if (!mcpForm.name || !mcpForm.command) return;

    if (editingMCP) {
      // Update existing MCP
      const updatedMCP: MCPConfig = {
        ...mcpForm,
        id: editingMCP.id,
      } as MCPConfig;

      const updatedServers = preferences.mcpServers.map((server) =>
        server.id === editingMCP.id ? updatedMCP : server
      );
      updatePreferences({ mcpServers: updatedServers });
    } else {
      // Create new MCP
      const newMCP: MCPConfig = {
        ...mcpForm,
        id: crypto.randomUUID(),
      } as MCPConfig;

      const updatedServers = [...preferences.mcpServers, newMCP];
      updatePreferences({ mcpServers: updatedServers });
      setSelectedMCPId(newMCP.id);
    }

    setIsEditing(false);
    setEditingMCP(null);
  };

  const handleToggleMCP = (mcpId: string) => {
    const updatedServers = preferences.mcpServers.map((server) =>
      server.id === mcpId ? { ...server, enabled: !server.enabled } : server
    );
    updatePreferences({ mcpServers: updatedServers });
  };

  const handleSaveMCP = () => {
    if (!mcpForm.name || !mcpForm.command) return;

    const newMCP: MCPConfig = {
      id: editingMCP?.id || crypto.randomUUID(),
      name: mcpForm.name!,
      command: mcpForm.command!,
      args: mcpForm.args || [],
      env: mcpForm.env || {},
      enabled: mcpForm.enabled!,
      description: mcpForm.description || "",
    };

    let updatedServers;
    if (editingMCP) {
      updatedServers = preferences.mcpServers.map((server) =>
        server.id === editingMCP.id ? newMCP : server
      );
    } else {
      updatedServers = [...preferences.mcpServers, newMCP];
    }

    updatePreferences({ mcpServers: updatedServers });
    setShowAddMCPModal(false);
    setEditingMCP(null);
  };

  const handleEnvVarChange = (key: string, value: string) => {
    setMcpForm((prev) => ({
      ...prev,
      env: { ...prev.env, [key]: value },
    }));
  };

  const handleArgChange = (index: number, value: string) => {
    const newArgs = [...(mcpForm.args || [])];
    newArgs[index] = value;
    setMcpForm((prev) => ({ ...prev, args: newArgs }));
  };

  const addArg = () => {
    setMcpForm((prev) => ({ ...prev, args: [...(prev.args || []), ""] }));
  };

  const removeArg = (index: number) => {
    setMcpForm((prev) => ({
      ...prev,
      args: (prev.args || []).filter((_, i) => i !== index),
    }));
  };

  const addEnvVar = () => {
    setMcpForm((prev) => ({
      ...prev,
      env: { ...prev.env, "": "" },
    }));
  };

  const removeEnvVar = (key: string) => {
    setMcpForm((prev) => {
      const newEnv = { ...prev.env };
      delete newEnv[key];
      return { ...prev, env: newEnv };
    });
  };

  return (
    <>
      <div className="flex h-full">
        {/* Left Panel - MCP Server List */}
        <div className="w-80 flex-shrink-0 border-r bg-card">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">MCP Servers</h2>
              <span className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground">
                {preferences.mcpServers.length}
              </span>
            </div>
            <Button size="sm" onClick={handleCreateMCP}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {/* MCP Server List */}
          <div className="flex-1 overflow-auto p-4">
            {preferences.mcpServers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Settings className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium text-muted-foreground mb-2">
                  No MCP servers
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add your first MCP server to extend AI capabilities
                </p>
                <Button onClick={handleCreateMCP}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add MCP Server
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {preferences.mcpServers.map((mcp) => (
                  <div
                    key={mcp.id}
                    className={`p-2 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                      selectedMCPId === mcp.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => {
                      if (!isEditing) {
                        setSelectedMCPId(mcp.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Settings className="h-3 w-3 text-blue-500 flex-shrink-0" />
                        <span className="font-medium truncate text-sm">
                          {mcp.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs ${
                            mcp.enabled
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                          }`}
                        >
                          {mcp.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {mcp.command}
                      {mcp.args && mcp.args.length > 0 && ` ${mcp.args.join(' ')}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Details/Configuration */}
        <div className="flex-1 flex flex-col">
          {(selectedMCP && !editingMCP) || isEditing ? (
            <>
              {/* Server Details Header */}
              <div className="p-4 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h1 className="text-lg font-semibold">
                        {editingMCP
                          ? `Edit ${editingMCP.name}`
                          : !selectedMCP
                          ? "Create New MCP Server"
                          : selectedMCP.name}
                      </h1>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isEditing ? (
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
                          onClick={handleSaveMCPInline}
                          disabled={!mcpForm.name || !mcpForm.command}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          {editingMCP ? "Update" : "Create"}
                        </Button>
                      </>
                    ) : selectedMCP ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleMCP(selectedMCP.id)}
                        >
                          {selectedMCP.enabled ? (
                            <>
                              <Pause className="h-4 w-4 mr-1" />
                              Disable
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              Enable
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditMCP(selectedMCP)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteMCP(selectedMCP.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Server Details Content */}
              <div className="flex-1 p-6 overflow-auto">
                <div className="space-y-6">
                  {/* Basic Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label className="text-sm font-medium">
                          Server Name
                        </Label>
                        {isEditing ? (
                          <Input
                            value={mcpForm.name}
                            onChange={(e) =>
                              setMcpForm((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            placeholder="Enter server name"
                          />
                        ) : (
                          <div className="px-3 py-2 border rounded-md bg-background text-sm select-all h-9 flex items-center">
                            {selectedMCP?.name}
                          </div>
                        )}
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-sm font-medium">Status</Label>
                        {isEditing ? (
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={mcpForm.enabled}
                              onCheckedChange={(checked) =>
                                setMcpForm((prev) => ({
                                  ...prev,
                                  enabled: checked,
                                }))
                              }
                            />
                            <Label className="text-sm">
                              Enable this MCP server
                            </Label>
                          </div>
                        ) : selectedMCP ? (
                          <div className="px-3 py-2 border rounded-md bg-background text-sm h-9 flex items-center">
                            <span
                              className={`inline-flex items-center gap-2 ${
                                selectedMCP.enabled
                                  ? "text-green-600"
                                  : "text-gray-500"
                              }`}
                            >
                              {selectedMCP.enabled ? (
                                <Play className="h-3 w-3" />
                              ) : (
                                <Pause className="h-3 w-3" />
                              )}
                              {selectedMCP.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label className="text-sm font-medium">Command</Label>
                        {isEditing ? (
                          <Input
                            value={mcpForm.command}
                            onChange={(e) =>
                              setMcpForm((prev) => ({
                                ...prev,
                                command: e.target.value,
                              }))
                            }
                            placeholder="python /path/to/server.py"
                          />
                        ) : (
                          <div className="px-3 py-2 border rounded-md bg-background text-sm font-mono select-all h-9 flex items-center">
                            {selectedMCP?.command}
                          </div>
                        )}
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-sm font-medium">Arguments</Label>
                        {isEditing ? (
                          <div className="space-y-2">
                            {(mcpForm.args || []).map((arg, index) => (
                              <div key={index} className="flex gap-2">
                                <Input
                                  value={arg}
                                  onChange={(e) =>
                                    handleArgChange(index, e.target.value)
                                  }
                                  placeholder="Argument"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeArg(index)}
                                  className="h-9 w-9"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              onClick={addArg}
                              className="h-9"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Add Argument
                            </Button>
                          </div>
                        ) : selectedMCP?.args && selectedMCP.args.length > 0 ? (
                          <div className="px-3 py-2 border rounded-md bg-background text-sm font-mono select-all min-h-[36px] flex items-center">
                            {selectedMCP.args.join(" ")}
                          </div>
                        ) : (
                          <div className="px-3 py-2 border rounded-md bg-background text-sm text-muted-foreground h-9 flex items-center">
                            No arguments
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="grid gap-2">
                    <Label className="text-sm font-medium">Description</Label>
                    {isEditing ? (
                      <Textarea
                        value={mcpForm.description}
                        onChange={(e) =>
                          setMcpForm((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        placeholder="Brief description of what this MCP server does"
                        rows={3}
                      />
                    ) : (
                      <div className="px-3 py-2 border rounded-md bg-background text-sm leading-relaxed min-h-[60px] select-all">
                        {selectedMCP?.description || "No description provided"}
                      </div>
                    )}
                  </div>

                  {/* Environment Variables */}
                  <div className="grid gap-2">
                    <Label className="text-sm font-medium">
                      Environment Variables
                    </Label>
                    {isEditing ? (
                      <div className="space-y-2">
                        {Object.entries(mcpForm.env || {}).map(
                          ([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <Input
                                value={key}
                                onChange={(e) => {
                                  const newKey = e.target.value;
                                  const newEnv = { ...mcpForm.env };
                                  delete newEnv[key];
                                  newEnv[newKey] = value;
                                  setMcpForm((prev) => ({
                                    ...prev,
                                    env: newEnv,
                                  }));
                                }}
                                placeholder="KEY"
                                className="w-1/3"
                              />
                              <Input
                                value={value}
                                onChange={(e) =>
                                  handleEnvVarChange(key, e.target.value)
                                }
                                placeholder="value"
                                className="w-2/3"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeEnvVar(key)}
                                className="h-9 w-9"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )
                        )}
                        <Button
                          variant="outline"
                          onClick={addEnvVar}
                          className="h-9"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Environment Variable
                        </Button>
                      </div>
                    ) : selectedMCP?.env &&
                      Object.keys(selectedMCP.env).length > 0 ? (
                      <div className="border rounded-md bg-background">
                        <div className="p-3">
                          <div className="space-y-2">
                            {Object.entries(selectedMCP.env).map(
                              ([key, value]) => (
                                <div
                                  key={key}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <span className="font-mono text-blue-600 dark:text-blue-400 select-all">
                                    {key}
                                  </span>
                                  <span className="text-muted-foreground">
                                    =
                                  </span>
                                  <span className="font-mono text-green-600 dark:text-green-400 select-all">
                                    {value}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="px-3 py-2 border rounded-md bg-background text-sm text-muted-foreground min-h-[60px] flex items-center">
                        No environment variables
                      </div>
                    )}
                  </div>

                  {/* Command Preview */}
                  <div className="grid gap-2">
                    <Label className="text-sm font-medium">Full Command</Label>
                    <div className="px-3 py-2 border rounded-md bg-muted/50 text-sm font-mono select-all leading-relaxed">
                      {isEditing ? mcpForm.command : selectedMCP?.command}
                      {isEditing &&
                        mcpForm.args &&
                        mcpForm.args.length > 0 &&
                        ` ${mcpForm.args.join(" ")}`}
                      {!isEditing &&
                        selectedMCP?.args &&
                        selectedMCP.args.length > 0 &&
                        ` ${selectedMCP.args.join(" ")}`}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Settings className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                  No server selected
                </h3>
                <p className="text-muted-foreground mb-4">
                  Select a server from the list to view its details
                </p>
                <Button onClick={handleCreateMCP}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New MCP Server
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAddMCPModal} onOpenChange={setShowAddMCPModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingMCP ? "Edit MCP Server" : "Add MCP Server"}
            </DialogTitle>
            <DialogDescription>
              Configure a Model Context Protocol server to extend AI
              capabilities
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4 px-1">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={mcpForm.name}
                  onChange={(e) =>
                    setMcpForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="My MCP Server"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={mcpForm.description}
                  onChange={(e) =>
                    setMcpForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Brief description of what this MCP server does"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="command">Command *</Label>
                <Input
                  id="command"
                  value={mcpForm.command}
                  onChange={(e) =>
                    setMcpForm((prev) => ({ ...prev, command: e.target.value }))
                  }
                  placeholder="python /path/to/server.py"
                />
              </div>

              <div className="space-y-2">
                <Label>Arguments</Label>
                <div className="space-y-2">
                  {(mcpForm.args || []).map((arg, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={arg}
                        onChange={(e) => handleArgChange(index, e.target.value)}
                        placeholder="Argument"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeArg(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={addArg}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Argument
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Environment Variables</Label>
                <div className="space-y-2">
                  {Object.entries(mcpForm.env || {}).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <Input
                        value={key}
                        onChange={(e) => {
                          const newKey = e.target.value;
                          const newEnv = { ...mcpForm.env };
                          delete newEnv[key];
                          newEnv[newKey] = value;
                          setMcpForm((prev) => ({ ...prev, env: newEnv }));
                        }}
                        placeholder="KEY"
                        className="w-1/3"
                      />
                      <Input
                        value={value}
                        onChange={(e) =>
                          handleEnvVarChange(key, e.target.value)
                        }
                        placeholder="value"
                        className="w-2/3"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEnvVar(key)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={addEnvVar}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Environment Variable
                  </Button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={mcpForm.enabled}
                  onCheckedChange={(checked) =>
                    setMcpForm((prev) => ({ ...prev, enabled: checked }))
                  }
                  id="enabled"
                />
                <Label htmlFor="enabled">Enable this MCP server</Label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 flex-shrink-0 border-t">
            <Button variant="outline" onClick={() => setShowAddMCPModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveMCP}>
              {editingMCP ? "Update" : "Add"} MCP Server
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
