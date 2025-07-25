import { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { toolRegistry } from '@/lib/tools/tool-registry';
import type { MCPConfig } from '@/types/mcp';

interface MCPServerToolsListProps {
  server: MCPConfig;
  enabledTools: string[];
  onToolToggle?: (toolName: string, enabled: boolean) => void;
  isEditing?: boolean;
}

export function MCPServerToolsList({
  server,
  enabledTools,
  onToolToggle,
  isEditing = false,
}: MCPServerToolsListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  console.log(`Rendering MCPServerToolsList for server: ${server.id}`, {
    enabledTools,
    server,
  });

  const handleToolToggle = (toolName: string, enabled: boolean) => {
    if (onToolToggle) {
      onToolToggle(toolName, enabled);
    }
  };

  const serverTools = useMemo(() => {
    return toolRegistry.getMCPToolsForServer(server.id);
  }, [server.id]);

  const filteredTools = useMemo(() => {
    if (!searchTerm) return serverTools;

    return serverTools.filter((tool) => {
      const name = tool.getMCPSchema().name;
      const description = tool.getMCPSchema().description || '';
      return (
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [serverTools, searchTerm]);

  return (
    <div className="space-y-4 h-full min-h-[300px]">
      <div className="space-y-2 h-full flex flex-col">
        <div className="flex items-center justify-between">
          <Label>Available Tools</Label>
          <p className="text-xs text-muted-foreground">
            {filteredTools.length} tools available • {enabledTools.length}{' '}
            enabled
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

          <div className="flex-1 overflow-y-auto border rounded-md bg-background max-h-[400px]">
            {filteredTools.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {searchTerm
                  ? `No tools found matching "${searchTerm}"`
                  : 'No tools available for this server'}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredTools.map((tool) => {
                  const schema = tool.getMCPSchema();
                  const toolName = schema.name;
                  const isEnabled = enabledTools.includes(toolName);
                  const isAvailable = tool.isAvailable();

                  return (
                    <div
                      key={toolName}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        id={`tool-${toolName}`}
                        checked={isEnabled}
                        onChange={(e) => {
                          if (!isEditing) return;
                          handleToolToggle(toolName, e.target.checked);
                        }}
                        disabled={!isEditing || !isAvailable}
                        className="h-4 w-4 shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <label
                            htmlFor={`tool-${toolName}`}
                            className="text-sm font-medium cursor-pointer truncate"
                          >
                            {toolName}
                          </label>
                          {!isAvailable && (
                            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-800 rounded shrink-0">
                              Unavailable
                            </span>
                          )}
                          {isAvailable && !isEnabled && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded shrink-0">
                              Available
                            </span>
                          )}
                          {isEnabled && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded shrink-0">
                              Enabled
                            </span>
                          )}
                        </div>
                        {schema.description && (
                          <p className="text-xs text-muted-foreground">
                            {schema.description.substring(0, 120)}
                            {schema.description.length > 120 && '...'}
                          </p>
                        )}

                        {/* Tool parameters preview */}
                        {schema.inputSchema?.properties && (
                          <div className="mt-2">
                            <span className="text-xs font-medium text-gray-700 mr-2">
                              Parameters:
                            </span>
                            <div className="inline-flex flex-wrap gap-1">
                              {Object.keys(schema.inputSchema.properties)
                                .slice(0, 3)
                                .map((param) => (
                                  <span
                                    key={param}
                                    className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded"
                                  >
                                    {param}
                                  </span>
                                ))}
                              {Object.keys(schema.inputSchema.properties)
                                .length > 3 && (
                                <span className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                                  +
                                  {Object.keys(schema.inputSchema.properties)
                                    .length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
