import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toolRegistry } from '@/lib/tools';
import { mcpManager } from '@/lib/mcp/mcp-manager';
import type { AgentToolConfig } from '@/types/tools';

interface ToolSettingsProps {
  toolConfig: AgentToolConfig;
  isEditing: boolean;
  onToolConfigChange: (config: AgentToolConfig) => void;
}

export function ToolSettings({ toolConfig, isEditing, onToolConfigChange }: ToolSettingsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const handleToolToggle = (toolName: string, enabled: boolean) => {
    const enabledTools = enabled
      ? [...toolConfig.enabledTools, toolName]
      : toolConfig.enabledTools.filter((name: string) => name !== toolName);

    onToolConfigChange({ ...toolConfig, enabledTools });
  };

  const handleMaxConcurrentChange = (maxConcurrentCalls: number) => {
    onToolConfigChange({ ...toolConfig, maxConcurrentCalls });
  };

  const handleTimeoutChange = (timeoutMs: number) => {
    onToolConfigChange({ ...toolConfig, timeoutMs });
  };

  const builtInFiltered = useMemo(
    () =>
      toolRegistry
        .getBuiltInTools()
        .filter(
          (tool) =>
            tool.definition.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tool.definition?.description?.toLowerCase?.()?.includes(searchTerm.toLowerCase()) ||
            tool.category?.toLowerCase?.().includes(searchTerm.toLowerCase()),
        ),
    [searchTerm],
  );

  const mcpServerIds = useMemo(() => toolRegistry.getMCPServerIds(), []);

  const mcpToolsByServer = useMemo(() => {
    const result: Record<string, ReturnType<typeof toolRegistry.getMCPToolsForServer>> = {};
    for (const id of mcpServerIds) {
      const tools = toolRegistry
        .getMCPToolsForServer(id)
        .filter(
          (tool) =>
            id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tool.getMCPSchema().name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tool.definition?.description?.toLowerCase?.()?.includes(searchTerm.toLowerCase()),
        );
      if (tools.length > 0) result[id] = tools;
    }
    return result;
  }, [mcpServerIds, searchTerm]);

  const totalVisibleTools = builtInFiltered.length + Object.values(mcpToolsByServer).reduce((a, b) => a + b.length, 0);
  const enabledVisibleTools = toolConfig.enabledTools.filter(
    (name) =>
      builtInFiltered.some((t) => t.definition.name === name) ||
      Object.values(mcpToolsByServer).some((arr) => arr.some((t) => t.definition.name === name)),
  ).length;
  const builtInNames = useMemo(() => builtInFiltered.map((t) => t.definition.name), [builtInFiltered]);
  const builtInEnabledCount = builtInNames.filter((n) => toolConfig.enabledTools.includes(n)).length;
  const builtInAllChecked = builtInEnabledCount === builtInNames.length && builtInNames.length > 0;
  const builtInSomeChecked = builtInEnabledCount > 0 && !builtInAllChecked;

  return (
    <div className="space-y-4 flex flex-col h-full min-h-[300px]">
      {/* Tool Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid space-y-2">
          <Label htmlFor="maxConcurrentCalls">Max Concurrent</Label>
          {isEditing ? (
            <Input
              id="maxConcurrentCalls"
              type="number"
              min="1"
              max="10"
              value={toolConfig.maxConcurrentCalls || 3}
              onChange={(e) => handleMaxConcurrentChange(parseInt(e.target.value) || 3)}
              className="h-9"
            />
          ) : (
            <div className="px-3 py-2 border rounded-md bg-background text-sm h-9 flex items-center">
              {toolConfig.maxConcurrentCalls || 3}
            </div>
          )}
        </div>

        <div className="grid space-y-2">
          <Label htmlFor="timeoutMs">Tool Timeout (ms)</Label>
          {isEditing ? (
            <Input
              id="timeoutMs"
              type="number"
              min="1000"
              max="300000"
              step="1000"
              value={toolConfig.timeoutMs || 30000}
              onChange={(e) => handleTimeoutChange(parseInt(e.target.value) || 30000)}
              className="h-9"
            />
          ) : (
            <div className="px-3 py-2 border rounded-md bg-background text-sm h-9 flex items-center">
              {(toolConfig.timeoutMs || 30000).toLocaleString()} ms
            </div>
          )}
        </div>
      </div>

      {/* Available Tools */}
      <div className="space-y-2 flex-1 flex flex-col min-h-0">
        <div className="flex flex-wrap items-center justify-between">
          <Label className="whitespace-no-break-spaces">Available Tools</Label>
          <p className="text-xs text-muted-foreground">{`${enabledVisibleTools} / ${totalVisibleTools} tools`}</p>
        </div>

        <div className="space-y-2 flex-1 flex flex-col min-h-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter tools or MCP servers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md bg-background">
            {/* Built-in tools accordion */}
            {builtInFiltered.length > 0 && (
              <div className="divide-y divide-border">
                {/* Built-in header */}
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, builtin: !prev.builtin }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenGroups((prev) => ({ ...prev, builtin: !prev.builtin }));
                    }
                  }}
                  className="flex items-center gap-2 p-2 bg-muted/40 cursor-pointer select-none w-full text-left"
                >
                  {openGroups.builtin ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <input
                    type="checkbox"
                    aria-label="Toggle all built-in tools"
                    ref={(el) => {
                      if (el) el.indeterminate = builtInSomeChecked;
                    }}
                    checked={builtInAllChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (!isEditing) return;
                      const current = new Set(toolConfig.enabledTools);
                      if (e.target.checked) {
                        for (const name of builtInNames) current.add(name);
                      } else {
                        for (const name of builtInNames) current.delete(name);
                      }
                      onToolConfigChange({ ...toolConfig, enabledTools: Array.from(current) });
                    }}
                    disabled={!isEditing}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">Built-in Tools</div>
                    <div className="text-xs text-muted-foreground">
                      {builtInEnabledCount} / {builtInNames.length} tools
                    </div>
                  </div>
                </button>

                {/* Built-in list */}
                {openGroups.builtin && (
                  <div className="divide-y divide-border">
                    {builtInFiltered.map((tool) => (
                      <div key={tool.definition.name} className="flex gap-2 p-2 hover:bg-muted/50 transition-colors">
                        {/* Spacer to align with accordion checkbox */}
                        <div className="w-4" />
                        <input
                          type="checkbox"
                          id={`tool-${tool.definition.name}`}
                          checked={toolConfig.enabledTools.includes(tool.definition.name)}
                          onChange={(e) => {
                            if (!isEditing) return;
                            handleToolToggle(tool.definition.name, e.target.checked);
                          }}
                          disabled={!isEditing}
                          className="h-4 w-4 shrink-0 mt-1.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`tool-${tool.definition.name}`}
                              className="text-sm font-medium cursor-pointer truncate"
                            >
                              {tool.definition.name}
                            </label>
                            <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded shrink-0">
                              {tool.category || 'utility'}
                            </span>
                          </div>
                          {tool.definition.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                              {tool.definition.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MCP grouped tools */}
            {Object.keys(mcpToolsByServer).length > 0 ? (
              <div className="divide-y divide-border">
                {Object.entries(mcpToolsByServer).map(([serverId, tools]) => {
                  const toolNames = tools.map((t) => t.definition.name);
                  const enabledCount = toolNames.filter((n) => toolConfig.enabledTools.includes(n)).length;
                  const allChecked = enabledCount === toolNames.length && toolNames.length > 0;
                  const someChecked = enabledCount > 0 && !allChecked;
                  const open = !!openGroups[serverId];

                  const toggleGroup = (checked: boolean) => {
                    if (!isEditing) return;
                    const current = new Set(toolConfig.enabledTools);
                    if (checked) {
                      for (const name of toolNames) current.add(name);
                    } else {
                      for (const name of toolNames) current.delete(name);
                    }
                    onToolConfigChange({ ...toolConfig, enabledTools: Array.from(current) });
                  };

                  return (
                    <div key={serverId} className="">
                      {/* Group header */}
                      <button
                        type="button"
                        onClick={() => setOpenGroups((prev) => ({ ...prev, [serverId]: !open }))}
                        className="flex items-center gap-2 p-2 bg-muted/40 cursor-pointer select-none w-full text-left"
                      >
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <input
                          type="checkbox"
                          aria-label={`Toggle all tools for ${serverId}`}
                          ref={(el) => {
                            if (el) el.indeterminate = someChecked;
                          }}
                          checked={allChecked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleGroup(e.target.checked);
                          }}
                          disabled={!isEditing}
                          className="h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {mcpManager.getServerConfig(serverId)?.name || serverId}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {enabledCount} / {toolNames.length} tools
                          </div>
                        </div>
                      </button>

                      {/* Group body */}
                      {open && (
                        <div className="divide-y divide-border">
                          {tools.map((tool) => (
                            <div
                              key={tool.definition.name}
                              className="flex gap-2 p-2 hover:bg-muted/50 transition-colors"
                            >
                              {/* Spacer to align with accordion checkbox */}
                              <div className="w-4" />
                              <input
                                type="checkbox"
                                id={`tool-${tool.definition.name}`}
                                checked={toolConfig.enabledTools.includes(tool.definition.name)}
                                onChange={(e) => {
                                  if (!isEditing) return;
                                  handleToolToggle(tool.definition.name, e.target.checked);
                                }}
                                disabled={!isEditing}
                                className="h-4 w-4 shrink-0 mt-1.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <label
                                    htmlFor={`tool-${tool.definition.name}`}
                                    className="text-sm font-medium cursor-pointer truncate"
                                  >
                                    {tool.getMCPSchema().name}
                                  </label>
                                  <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded shrink-0">
                                    mcp
                                  </span>
                                </div>
                                {tool.definition.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                                    {tool.definition.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              builtInFiltered.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No tools found matching "{searchTerm}"
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
