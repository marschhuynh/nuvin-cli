import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Edit, Trash2, Play, Pause } from 'lucide-react';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';
import { MCPConfig } from '@/store/useUserPreferenceStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface MCPSettingsProps {
  settings: any;
  onSettingsChange: (settings: any) => void;
}

export function MCPSettings({ settings, onSettingsChange }: MCPSettingsProps) {
  const { preferences, updatePreferences } = useUserPreferenceStore();
  const [showAddMCPModal, setShowAddMCPModal] = useState(false);
  const [editingMCP, setEditingMCP] = useState<MCPConfig | null>(null);
  const [mcpForm, setMcpForm] = useState<Partial<MCPConfig>>({
    name: '',
    command: '',
    args: [],
    env: {},
    enabled: true,
    description: '',
  });

  const handleAddMCP = () => {
    setEditingMCP(null);
    setMcpForm({
      name: '',
      command: '',
      args: [],
      env: {},
      enabled: true,
      description: '',
    });
    setShowAddMCPModal(true);
  };

  const handleEditMCP = (mcp: MCPConfig) => {
    setEditingMCP(mcp);
    setMcpForm({
      name: mcp.name,
      command: mcp.command,
      args: mcp.args || [],
      env: mcp.env || {},
      enabled: mcp.enabled,
      description: mcp.description || '',
    });
    setShowAddMCPModal(true);
  };

  const handleDeleteMCP = (mcpId: string) => {
    const updatedServers = preferences.mcpServers.filter(server => server.id !== mcpId);
    updatePreferences({ mcpServers: updatedServers });
  };

  const handleToggleMCP = (mcpId: string) => {
    const updatedServers = preferences.mcpServers.map(server =>
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
      description: mcpForm.description || '',
    };

    let updatedServers;
    if (editingMCP) {
      updatedServers = preferences.mcpServers.map(server =>
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
    setMcpForm(prev => ({
      ...prev,
      env: { ...prev.env, [key]: value }
    }));
  };

  const handleArgChange = (index: number, value: string) => {
    const newArgs = [...(mcpForm.args || [])];
    newArgs[index] = value;
    setMcpForm(prev => ({ ...prev, args: newArgs }));
  };

  const addArg = () => {
    setMcpForm(prev => ({ ...prev, args: [...(prev.args || []), ''] }));
  };

  const removeArg = (index: number) => {
    setMcpForm(prev => ({
      ...prev,
      args: (prev.args || []).filter((_, i) => i !== index)
    }));
  };

  const addEnvVar = () => {
    setMcpForm(prev => ({
      ...prev,
      env: { ...prev.env, '': '' }
    }));
  };

  const removeEnvVar = (key: string) => {
    setMcpForm(prev => {
      const newEnv = { ...prev.env };
      delete newEnv[key];
      return { ...prev, env: newEnv };
    });
  };

  return (
    <div>
      <div className="p-6 border-b">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">MCP Servers</h2>
          </div>
          <Button onClick={handleAddMCP}>
            <Plus className="w-4 h-4 mr-2" />
            Add MCP Server
          </Button>
        </div>
      </div>
      <div className="p-6 overflow-y-auto">
        <div className="space-y-6">

      {preferences.mcpServers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No MCP servers configured. Add your first server to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {preferences.mcpServers.map((mcp) => (
            <Card key={mcp.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {mcp.name}
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        mcp.enabled
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}>
                        {mcp.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </CardTitle>
                    {mcp.description && (
                      <CardDescription>{mcp.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleMCP(mcp.id)}
                      title={mcp.enabled ? 'Disable' : 'Enable'}
                    >
                      {mcp.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditMCP(mcp)}
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMCP(mcp.id)}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <p><span className="font-medium">Command:</span> {mcp.command}</p>
                  {mcp.args && mcp.args.length > 0 && (
                    <p><span className="font-medium">Args:</span> {mcp.args.join(' ')}</p>
                  )}
                  {mcp.env && Object.keys(mcp.env).length > 0 && (
                    <div>
                      <p className="font-medium">Environment Variables:</p>
                      <ul className="ml-4">
                        {Object.entries(mcp.env).map(([key, value]) => (
                          <li key={key} className="text-xs">
                            {key}={value}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAddMCPModal} onOpenChange={setShowAddMCPModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingMCP ? 'Edit MCP Server' : 'Add MCP Server'}
            </DialogTitle>
            <DialogDescription>
              Configure a Model Context Protocol server to extend AI capabilities
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4 px-1">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={mcpForm.name}
                onChange={(e) => setMcpForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="My MCP Server"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={mcpForm.description}
                onChange={(e) => setMcpForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of what this MCP server does"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="command">Command *</Label>
              <Input
                id="command"
                value={mcpForm.command}
                onChange={(e) => setMcpForm(prev => ({ ...prev, command: e.target.value }))}
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
                        setMcpForm(prev => ({ ...prev, env: newEnv }));
                      }}
                      placeholder="KEY"
                      className="w-1/3"
                    />
                    <Input
                      value={value}
                      onChange={(e) => handleEnvVarChange(key, e.target.value)}
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
                onCheckedChange={(checked) => setMcpForm(prev => ({ ...prev, enabled: checked }))}
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
        </div>
      </div>
    </div>
  );
}