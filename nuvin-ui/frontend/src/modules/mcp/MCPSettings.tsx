import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';
import type { MCPConfig } from '@/types/mcp';
import { ClipboardGetText } from '@/lib/browser-runtime';
import { useMCPServers } from '@/lib/mcp/hooks/useMCPServers';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components';

import { MCPServerHeader } from './components/MCPServerHeader';
import { MCPServersSidebar } from './components/MCPServersSidebar';
import { MCPServerEditor } from './components/MCPServerEditor';
import { MCPServerDetails } from './components/MCPServerDetails';

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
  const { toggleServer, refreshStatus } = useMCPServers();
  const [editingMCP, setEditingMCP] = useState<MCPConfig | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [toolsRefreshTrigger, setToolsRefreshTrigger] = useState(0);
  const [selectedMCPId, setSelectedMCPId] = useState<string | null>(preferences?.mcpServers?.[0]?.id || null);
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

  console.log('mcpForm', mcpForm);

  const selectedMCP = (preferences?.mcpServers || []).find((mcp) => mcp.id === selectedMCPId);

  // Dialog state for user notifications
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const showDialog = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogOpen(true);
  };

  const parseClipboardMCPConfig = (clipboardText: string): Partial<MCPConfig> | null => {
    try {
      console.log('Attempting to parse JSON:', `${clipboardText.substring(0, 200)}...`);
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

      const hasUrl = serverConfig.url && serverConfig.url.trim() !== '';
      const hasCommand = serverConfig.command && serverConfig.command.trim() !== '';
      console.log('Server analysis - hasUrl:', hasUrl, 'hasCommand:', hasCommand);

      let serverType: 'stdio' | 'http' = 'stdio';
      if (hasUrl && !hasCommand) {
        serverType = 'http';
      }

      const result = {
        name: serverKey.replace(/[._-]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
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
      console.log('Attempting to read MCP config from clipboard using Wails...');
      const clipboardText = await ClipboardGetText();

      if (!clipboardText || clipboardText.trim() === '') {
        showDialog('Clipboard Empty', 'Please copy a valid MCP configuration JSON and try again.');
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
        showDialog(
          'Import Failed',
          'Could not parse MCP configuration from clipboard. Ensure it matches the expected JSON format.',
        );
      }
    } catch (error) {
      console.error('Failed to read from clipboard:', error);
      showDialog(
        'Clipboard Error',
        `Failed to access clipboard${error instanceof Error && error.message ? `: ${error.message}` : ''}`,
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
    const updatedServers = (preferences?.mcpServers || []).filter((server) => server.id !== mcpId);
    updatePreferences({ mcpServers: updatedServers });
    if (selectedMCPId === mcpId) {
      const remainingServers = updatedServers;
      setSelectedMCPId(remainingServers.length > 0 ? remainingServers[0].id : null);
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
        showDialog(
          'Server Toggle Failed',
          `Failed to ${server.enabled ? 'disable' : 'enable'} server${
            error instanceof Error && error.message ? `: ${error.message}` : ''
          }`,
        );
      }
    }
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
        <MCPServersSidebar
          servers={preferences?.mcpServers || []}
          selectedId={selectedMCPId}
          isCreating={isCreating}
          isEditing={isEditing}
          onSelect={(id) => {
            if (!isEditing) {
              setSelectedMCPId(id);
              setIsCreating(false);
            }
          }}
          onCreate={handleCreateMCP}
          onCancelCreate={handleCancelEdit}
        />

        {/* Right Panel - Details/Configuration */}
        <div className="flex-1 flex flex-col">
          {(selectedMCP && !isCreating) || isEditing ? (
            <>
              <MCPServerHeader
                isCreating={isCreating}
                isEditing={isEditing}
                selectedMCP={selectedMCP || null}
                editingMCP={editingMCP}
                mcpForm={mcpForm}
                onImportFromClipboard={handleImportFromClipboard}
                onCancelEdit={handleCancelEdit}
                onSaveInline={handleSaveMCPInline}
                onToggle={handleToggleMCP}
                onEdit={handleEditMCP}
                onDelete={handleDeleteMCP}
              />

              {/* Server Details Content */}
              <div className={`flex flex-col flex-1 p-4 overflow-hidden space-y-4`}>
                {isEditing ? (
                  <MCPServerEditor
                    mcpForm={mcpForm}
                    setMcpForm={(updater) => setMcpForm((prev) => updater(prev))}
                    handleArgChange={handleArgChange}
                    addArg={addArg}
                    removeArg={removeArg}
                    handleEnvVarChange={handleEnvVarChange}
                    addEnvVar={addEnvVar}
                    removeEnvVar={removeEnvVar}
                  />
                ) : selectedMCP ? (
                  <MCPServerDetails
                    server={selectedMCP}
                    enabledTools={preferences?.enabledMCPTools?.[selectedMCP.id] || []}
                    onUpdateEnabledTools={(newEnabled) => {
                      const newEnabledTools = {
                        ...preferences?.enabledMCPTools,
                        [selectedMCP.id]: newEnabled,
                      };
                      updatePreferences({ enabledMCPTools: newEnabledTools });
                    }}
                    refreshTrigger={toolsRefreshTrigger}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Settings className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">No server selected</h3>
                <p className="text-muted-foreground mb-4">Select a server from the list to view its details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notification Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            {dialogMessage && <DialogDescription>{dialogMessage}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
