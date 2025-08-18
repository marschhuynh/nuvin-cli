import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Edit,
  Trash2,
  Play,
  Pause,
  Settings,
  X,
  Save,
  Clipboard,
} from 'lucide-react';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';
import type { MCPConfig } from '@/types/mcp';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MCPServerToolsList } from '@/components/mcp/MCPServerToolsList';
import { ClipboardGetText } from '@/lib/wails-runtime';
import { useMCPServers } from '@/lib/mcp/hooks/useMCPServers';

interface MCPClipboardConfig {
  mcpServers: {
    [key: string]: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      disabled?: boolean;
      autoApprove?: string[];
      url?: string;
    };
  };
}

export function MCPSettings() {
  const { preferences, updatePreferences } = useUserPreferenceStore();
  const { servers, toggleServer, refreshStatus } = useMCPServers();
  const [showAddMCPModal, setShowAddMCPModal] = useState(false);
  const [editingMCP, setEditingMCP] = useState<MCPConfig | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [toolsRefreshTrigger, setToolsRefreshTrigger] = useState(0);
  const [selectedMCPId, setSelectedMCPId] = useState<string | null>(
    preferences?.mcpServers?.[0]?.id || null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [mcpForm, setMcpForm] = useState<Partial<MCPConfig>>({
    name: '',
    type: 'stdio',
    command: '',
    args: [],
    env: {},
    url: '',
    enabled: true,
    description: '',
  });

  const selectedMCP = (preferences?.mcpServers || []).find(
    (mcp) => mcp.id === selectedMCPId,
  );

  const parseClipboardMCPConfig = (
    clipboardText: string,
  ): Partial<MCPConfig> | null => {
    try {
      console.log(
        'Attempting to parse JSON:',
        clipboardText.substring(0, 200) + '...',
      );
      const parsed = JSON.parse(clipboardText) as MCPClipboardConfig;
      console.log('Parsed JSON structure:', parsed);

      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        console.error('Invalid structure: missing or invalid mcpServers');
        return null;
      }

      // Get the first server configuration
      const serverKeys = Object.keys(parsed.mcpServers);
      console.log('Found server keys:', serverKeys);

      if (serverKeys.length === 0) {
        console.error('No servers found in mcpServers');
        return null;
      }

      const serverKey = serverKeys[0];
      const serverConfig = parsed.mcpServers[serverKey];
      console.log('Processing server:', serverKey, serverConfig);

      // Determine server type based on configuration
      const hasUrl = serverConfig.url && serverConfig.url.trim() !== '';
      const hasCommand =
        serverConfig.command && serverConfig.command.trim() !== '';
      console.log(
        'Server analysis - hasUrl:',
        hasUrl,
        'hasCommand:',
        hasCommand,
      );

      let serverType: 'stdio' | 'http' = 'stdio';
      if (hasUrl && !hasCommand) {
        serverType = 'http';
      }

      const result = {
        name: serverKey
          .replace(/[._-]/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        type: serverType,
        command: serverConfig.command || '',
        args: serverConfig.args || [],
        env: serverConfig.env || {},
        url: serverConfig.url || '',
        enabled: !serverConfig.disabled,
        description: `Imported MCP server: ${serverKey}`,
      };

      console.log('Generated config:', result);
      return result;
    } catch (error) {
      console.error('Failed to parse clipboard MCP config:', error);
      return null;
    }
  };

  const handleImportFromClipboard = async () => {
    try {
      console.log(
        'Attempting to read MCP config from clipboard using Wails...',
      );
      const clipboardText = await ClipboardGetText();

      if (!clipboardText || clipboardText.trim() === '') {
        alert('Clipboard is empty. Please copy a valid MCP configuration.');
        return;
      }

      console.log('Raw clipboard text:', clipboardText);
      const parsedConfig = parseClipboardMCPConfig(clipboardText);
      console.log('Parsed MCP config from clipboard:', parsedConfig);

      if (parsedConfig) {
        setMcpForm({
          ...mcpForm,
          ...parsedConfig,
        });
        console.log('Form updated with parsed config');
      } else {
        alert(
          'Could not parse MCP configuration from clipboard. Please ensure it matches the expected format.',
        );
      }
    } catch (error) {
      console.error('Failed to read from clipboard:', error);
      alert(
        'Failed to access clipboard. Error: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
      );
    }
  };

  const handleEditMCP = (mcp: MCPConfig) => {
    setEditingMCP(mcp);
    setSelectedMCPId(mcp.id);
    setIsCreating(false);
    setMcpForm({
      name: mcp.name,
      type: mcp.type,
      command: mcp.command,
      args: mcp.args || [],
      env: mcp.env || {},
      url: mcp.url,
      enabled: mcp.enabled,
      description: mcp.description || '',
    });
    setIsEditing(true);
  };

  const handleDeleteMCP = (mcpId: string) => {
    const updatedServers = (preferences?.mcpServers || []).filter(
      (server) => server.id !== mcpId,
    );
    updatePreferences({ mcpServers: updatedServers });
    if (selectedMCPId === mcpId) {
      const remainingServers = updatedServers;
      setSelectedMCPId(
        remainingServers.length > 0 ? remainingServers[0].id : null,
      );
    }
  };

  const handleCreateMCP = () => {
    setEditingMCP(null);
    setSelectedMCPId(null);
    setIsCreating(true);
    setMcpForm({
      name: '',
      type: 'stdio',
      command: '',
      args: [],
      env: {},
      url: '',
      enabled: true,
      description: '',
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsCreating(false);
    setEditingMCP(null);
    if (selectedMCP) {
      // Reload MCP data
      setMcpForm({
        name: selectedMCP.name,
        type: selectedMCP.type,
        command: selectedMCP.command,
        args: selectedMCP.args || [],
        env: selectedMCP.env || {},
        url: selectedMCP.url,
        enabled: selectedMCP.enabled,
        description: selectedMCP.description || '',
      });
    }
  };

  const handleSaveMCPInline = () => {
    if (!mcpForm.name) return;
    if (mcpForm.type === 'stdio' && !mcpForm.command) return;
    if (mcpForm.type === 'http' && !mcpForm.url) return;

    if (editingMCP) {
      // Update existing MCP
      const updatedMCP: MCPConfig = {
        ...mcpForm,
        id: editingMCP.id,
      } as MCPConfig;

      const updatedServers = (preferences?.mcpServers || []).map((server) =>
        server.id === editingMCP.id ? updatedMCP : server,
      );
      updatePreferences({ mcpServers: updatedServers });
    } else {
      // Create new MCP
      const newMCP: MCPConfig = {
        ...mcpForm,
        id: crypto.randomUUID(),
      } as MCPConfig;

      const updatedServers = [...(preferences?.mcpServers || []), newMCP];
      updatePreferences({ mcpServers: updatedServers });
      setSelectedMCPId(newMCP.id);
    }

    setIsEditing(false);
    setIsCreating(false);
    setEditingMCP(null);
  };

  const handleToggleMCP = async (mcpId: string) => {
    const server = (preferences?.mcpServers || []).find((s) => s.id === mcpId);
    if (server) {
      try {
        await toggleServer(mcpId, !server.enabled);
        // Refresh server status and tools list
        setTimeout(() => {
          refreshStatus();
          setToolsRefreshTrigger((prev) => prev + 1);
        }, 1000);
      } catch (error) {
        console.error('Failed to toggle MCP server:', error);
        // Could show a toast notification here
        alert(
          `Failed to ${server.enabled ? 'disable' : 'enable'} server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  };

  const handleSaveMCP = () => {
    if (!mcpForm.name) return;
    if (mcpForm.type === 'stdio' && !mcpForm.command) return;
    if (mcpForm.type === 'http' && !mcpForm.url) return;

    const newMCP: MCPConfig = {
      id: editingMCP?.id || crypto.randomUUID(),
      name: mcpForm.name,
      type: mcpForm.type || 'stdio',
      command: mcpForm.command,
      args: mcpForm.args || [],
      env: mcpForm.env || {},
      url: mcpForm.url,
      enabled: mcpForm.enabled ?? false,
      description: mcpForm.description || '',
    };

    let updatedServers: MCPConfig[] = [];
    if (editingMCP) {
      updatedServers = (preferences?.mcpServers || []).map((server) =>
        server.id === editingMCP.id ? newMCP : server,
      );
    } else {
      updatedServers = [...(preferences?.mcpServers || []), newMCP];
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
    setMcpForm((prev) => ({ ...prev, args: [...(prev.args || []), ''] }));
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
      env: { ...prev.env, '': '' },
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
        <div className="flex flex-col min-w-48 w-64 border-r bg-card">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">MCP Servers</h2>
              <span className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground">
                {(preferences?.mcpServers || []).length}
              </span>
            </div>
            <Button
              size="sm"
              onClick={isCreating ? handleCancelEdit : handleCreateMCP}
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

          {/* MCP Server List */}
          <div className="flex-1 overflow-auto p-4">
            {/* Create Mode Banner */}
            {isCreating && (
              <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Creating New MCP Server
                  </span>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                  Fill out the form manually or use Import to load from
                  clipboard
                </p>
              </div>
            )}

            {(preferences?.mcpServers || []).length === 0 ? (
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
              <div className={`space-y-2 ${isCreating ? 'opacity-50' : ''}`}>
                {(preferences?.mcpServers || []).map((mcp) => (
                  <button
                    type="button"
                    key={mcp.id}
                    className={`w-full text-left p-2 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                      selectedMCPId === mcp.id && !isCreating
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/50'
                    } ${isCreating ? 'pointer-events-none' : ''}`}
                    onClick={() => {
                      if (!isEditing) {
                        setSelectedMCPId(mcp.id);
                        setIsCreating(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
                        e.preventDefault();
                        setSelectedMCPId(mcp.id);
                        setIsCreating(false);
                      }
                    }}
                    disabled={isEditing}
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
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                          }`}
                        >
                          {mcp.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {mcp.type === 'http' ? (
                        mcp.url
                      ) : (
                        <>
                          {mcp.command}
                          {mcp.args &&
                            mcp.args.length > 0 &&
                            ` ${mcp.args.join(' ')}`}
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Details/Configuration */}
        <div className="flex-1 flex flex-col">
          {(selectedMCP && !isCreating) || isEditing ? (
            <>
              {/* Server Details Header */}
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
                          : 'bg-blue-50 dark:bg-blue-950/30'
                      }`}
                    >
                      {isCreating ? (
                        <Plus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <div>
                      <h1
                        className={`text-lg font-semibold ${
                          isCreating ? 'text-blue-900 dark:text-blue-100' : ''
                        }`}
                      >
                        {isCreating
                          ? 'Create New MCP Server'
                          : editingMCP
                            ? `Edit ${editingMCP.name}`
                            : selectedMCP?.name}
                      </h1>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        {isCreating && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleImportFromClipboard}
                            className="border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                          >
                            <Clipboard className="h-4 w-4 mr-1" />
                            Import
                          </Button>
                        )}
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
                          disabled={
                            !mcpForm.name ||
                            (mcpForm.type === 'stdio' && !mcpForm.command) ||
                            (mcpForm.type === 'http' && !mcpForm.url)
                          }
                        >
                          <Save className="h-4 w-4 mr-1" />
                          {editingMCP ? 'Update' : 'Create'}
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
              <div className={`flex-1 p-6 overflow-auto `}>
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
                        <Label className="text-sm font-medium">
                          Transport Type
                        </Label>
                        {isEditing ? (
                          <Select
                            value={mcpForm.type || 'stdio'}
                            onValueChange={(value: 'stdio' | 'http') =>
                              setMcpForm((prev) => ({
                                ...prev,
                                type: value,
                              }))
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select transport type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="stdio">
                                Stdio (Process)
                              </SelectItem>
                              <SelectItem value="http">HTTP/SSE</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="px-3 py-2 border rounded-md bg-background text-sm h-9 flex items-center">
                            <span className="inline-flex items-center gap-2">
                              <Settings className="h-3 w-3" />
                              {selectedMCP?.type === 'stdio'
                                ? 'Stdio (Process)'
                                : 'HTTP/SSE'}
                            </span>
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
                                  ? 'text-green-600'
                                  : 'text-gray-500'
                              }`}
                            >
                              {selectedMCP.enabled ? (
                                <Play className="h-3 w-3" />
                              ) : (
                                <Pause className="h-3 w-3" />
                              )}
                              {selectedMCP.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {(isEditing ? mcpForm.type : selectedMCP?.type) ===
                      'stdio' ? (
                        <div className="grid gap-2">
                          <Label className="text-sm font-medium">Command</Label>
                          {isEditing ? (
                            <Input
                              value={mcpForm.command || ''}
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
                      ) : (
                        <div className="grid gap-2">
                          <Label className="text-sm font-medium">
                            Server URL
                          </Label>
                          {isEditing ? (
                            <Input
                              value={mcpForm.url || ''}
                              onChange={(e) =>
                                setMcpForm((prev) => ({
                                  ...prev,
                                  url: e.target.value,
                                }))
                              }
                              placeholder="http://localhost:8080/mcp"
                            />
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-background text-sm font-mono select-all h-9 flex items-center">
                              {selectedMCP?.url}
                            </div>
                          )}
                        </div>
                      )}

                      {(isEditing ? mcpForm.type : selectedMCP?.type) ===
                        'stdio' && (
                        <div className="grid gap-2">
                          <Label className="text-sm font-medium">
                            Arguments
                          </Label>
                          {isEditing ? (
                            <div className="space-y-2">
                              {(mcpForm.args || []).map((arg, index) => (
                                <div
                                  key={`arg-${index}-${arg}`}
                                  className="flex gap-2"
                                >
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
                          ) : selectedMCP?.args &&
                            selectedMCP.args.length > 0 ? (
                            <div className="px-3 py-2 border rounded-md bg-background text-sm font-mono select-all min-h-[36px] flex items-center">
                              {selectedMCP.args.join(' ')}
                            </div>
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-background text-sm text-muted-foreground h-9 flex items-center">
                              No arguments
                            </div>
                          )}
                        </div>
                      )}
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
                        {selectedMCP?.description || 'No description provided'}
                      </div>
                    )}
                  </div>

                  {/* Environment Variables / HTTP Headers */}
                  <div className="grid gap-2">
                    <Label className="text-sm font-medium">
                      {(isEditing ? mcpForm.type : selectedMCP?.type) === 'http'
                        ? 'HTTP Headers'
                        : 'Environment Variables'}
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
                                placeholder={
                                  mcpForm.type === 'http'
                                    ? 'Header-Name'
                                    : 'KEY'
                                }
                                className="w-1/3"
                              />
                              <Input
                                value={value}
                                onChange={(e) =>
                                  handleEnvVarChange(key, e.target.value)
                                }
                                placeholder={
                                  mcpForm.type === 'http'
                                    ? 'header value'
                                    : 'value'
                                }
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
                          ),
                        )}
                        <Button
                          variant="outline"
                          onClick={addEnvVar}
                          className="h-9"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          {mcpForm.type === 'http'
                            ? 'Add HTTP Header'
                            : 'Add Environment Variable'}
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
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="px-3 py-2 border rounded-md bg-background text-sm text-muted-foreground min-h-[60px] flex items-center">
                        {selectedMCP?.type === 'http'
                          ? 'No HTTP headers'
                          : 'No environment variables'}
                      </div>
                    )}
                  </div>

                  {/* Connection Preview */}
                  <div className="grid gap-2">
                    <Label className="text-sm font-medium">
                      {selectedMCP?.type === 'stdio'
                        ? 'Full Command'
                        : 'Connection URL'}
                    </Label>
                    <div className="px-3 py-2 border rounded-md bg-muted/50 text-sm font-mono select-all leading-relaxed">
                      {selectedMCP?.type === 'stdio' ? (
                        <>
                          {isEditing ? mcpForm.command : selectedMCP?.command}
                          {isEditing &&
                            mcpForm.args &&
                            mcpForm.args.length > 0 &&
                            ` ${mcpForm.args.join(' ')}`}
                          {!isEditing &&
                            selectedMCP?.args &&
                            selectedMCP.args.length > 0 &&
                            ` ${selectedMCP.args.join(' ')}`}
                        </>
                      ) : isEditing ? (
                        mcpForm.url
                      ) : (
                        selectedMCP?.url
                      )}
                    </div>
                  </div>

                  {/* Available Tools */}
                  {selectedMCP && (
                    <div className="space-y-4">
                      <div className="rounded-lg">
                        <MCPServerToolsList
                          server={selectedMCP}
                          enabledTools={
                            preferences?.enabledMCPTools?.[selectedMCP.id] || []
                          }
                          onToolToggle={(toolName, enabled) => {
                            const currentEnabled =
                              preferences?.enabledMCPTools?.[selectedMCP.id] ||
                              [];
                            const newEnabled = enabled
                              ? [...currentEnabled, toolName]
                              : currentEnabled.filter(
                                  (name) => name !== toolName,
                                );

                            const newEnabledTools = {
                              ...preferences?.enabledMCPTools,
                              [selectedMCP.id]: newEnabled,
                            };

                            updatePreferences({
                              enabledMCPTools: newEnabledTools,
                            });
                          }}
                          isEditing={!isEditing}
                          refreshTrigger={toolsRefreshTrigger}
                        />
                      </div>
                    </div>
                  )}
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
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAddMCPModal} onOpenChange={setShowAddMCPModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingMCP ? 'Edit MCP Server' : 'Add MCP Server'}
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
                <Label htmlFor="type">Server Type</Label>
                <Select
                  value={mcpForm.type || 'stdio'}
                  onValueChange={(value: 'stdio' | 'http') =>
                    setMcpForm((prev) => ({
                      ...prev,
                      type: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select server type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stdio">Stdio (Command-based)</SelectItem>
                    <SelectItem value="http">HTTP (URL-based)</SelectItem>
                  </SelectContent>
                </Select>
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

              {mcpForm.type === 'stdio' ? (
                <div className="space-y-2">
                  <Label htmlFor="command">Command *</Label>
                  <Input
                    id="command"
                    value={mcpForm.command}
                    onChange={(e) =>
                      setMcpForm((prev) => ({
                        ...prev,
                        command: e.target.value,
                      }))
                    }
                    placeholder="python /path/to/server.py"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="url">URL *</Label>
                  <Input
                    id="url"
                    value={mcpForm.url}
                    onChange={(e) =>
                      setMcpForm((prev) => ({ ...prev, url: e.target.value }))
                    }
                    placeholder="http://localhost:3000"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Arguments</Label>
                <div className="space-y-2">
                  {(mcpForm.args || []).map((arg, index) => (
                    <div key={`arg-${index}-${arg}`} className="flex gap-2">
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
              {editingMCP ? 'Update' : 'Add'} MCP Server
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
