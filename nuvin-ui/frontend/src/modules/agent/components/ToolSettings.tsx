import { useState } from 'react';
import { Search } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toolRegistry } from '@/lib/tools';
import type { AgentToolConfig } from '@/types/tools';

interface ToolSettingsProps {
  toolConfig: AgentToolConfig;
  isEditing: boolean;
  onToolConfigChange: (config: AgentToolConfig) => void;
}

export function ToolSettings({
  toolConfig,
  isEditing,
  onToolConfigChange,
}: ToolSettingsProps) {
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredTools = toolRegistry
    .getAllTools()
    .filter(
      (tool) =>
        tool.definition.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tool.definition?.description
          ?.toLowerCase?.()
          ?.includes(searchTerm.toLowerCase()) ||
        tool.category?.toLowerCase?.().includes(searchTerm.toLowerCase()),
    );

  console.log(`Rendering ToolSettings with ${filteredTools.length} tools`, {
    filteredTools,
  });
  return (
    <div className="space-y-4 flex flex-col h-full min-h-0">
      {/* Tool Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maxConcurrentCalls">Max Concurrent</Label>
          {isEditing ? (
            <Input
              id="maxConcurrentCalls"
              type="number"
              min="1"
              max="10"
              value={toolConfig.maxConcurrentCalls || 3}
              onChange={(e) =>
                handleMaxConcurrentChange(parseInt(e.target.value) || 3)
              }
              className="h-9"
            />
          ) : (
            <div className="px-3 py-2 border rounded-md bg-background text-sm h-9 flex items-center">
              {toolConfig.maxConcurrentCalls || 3}
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
              value={toolConfig.timeoutMs || 30000}
              onChange={(e) =>
                handleTimeoutChange(parseInt(e.target.value) || 30000)
              }
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
        <div className="flex items-center justify-between">
          <Label>Available Tools</Label>
          <p className="text-xs text-muted-foreground">
            {filteredTools.length} tools available •{' '}
            {toolConfig.enabledTools.length} enabled
          </p>
        </div>

        <div className="space-y-2 flex-1 flex flex-col min-h-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter tools..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md bg-background">
            {filteredTools.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No tools found matching "{searchTerm}"
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredTools.map((tool) => (
                  <div
                    key={tool.definition.name}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      id={`tool-${tool.definition.name}`}
                      checked={toolConfig.enabledTools.includes(
                        tool.definition.name,
                      )}
                      onChange={(e) => {
                        if (!isEditing) return;
                        handleToolToggle(
                          tool.definition.name,
                          e.target.checked,
                        );
                      }}
                      disabled={!isEditing}
                      className="h-4 w-4 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`tool-${tool.definition.name}`}
                          className="text-sm font-medium cursor-pointer truncate"
                        >
                          {tool.category === 'mcp'
                            ? (tool as any).mcpSchema.name
                            : tool.definition.name}
                        </label>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded shrink-0">
                          {tool.category || 'utility'}
                        </span>
                      </div>
                      {tool.definition.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {tool.definition.description.substring(0, 100)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
