import { Button } from '@/components/ui/button';
import { Settings, Plus, X } from 'lucide-react';
import type { MCPConfig } from '@/types/mcp';

interface MCPServersSidebarProps {
  servers: MCPConfig[];
  selectedId: string | null;
  isCreating: boolean;
  isEditing: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onCancelCreate: () => void;
}

export function MCPServersSidebar({
  servers,
  selectedId,
  isCreating,
  isEditing,
  onSelect,
  onCreate,
  onCancelCreate,
}: MCPServersSidebarProps) {
  return (
    <div className="flex flex-col min-w-48 w-70 border-r bg-card">
      <div className="flex justify-between items-center p-4 border-b">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">MCP Servers</h2>
          <span className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground">{servers.length}</span>
        </div>
        <Button
          size="sm"
          onClick={isCreating ? onCancelCreate : onCreate}
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

      <div className="flex-1 overflow-auto p-4">
        {isCreating && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Creating New MCP Server</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
              Fill out the form manually or use Import to load from clipboard
            </p>
          </div>
        )}

        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-muted-foreground mb-2">No MCP servers</h3>
            <p className="text-sm text-muted-foreground mb-4">Add your first MCP server to extend AI capabilities</p>
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add MCP Server
            </Button>
          </div>
        ) : (
          <div className={`space-y-2 ${isCreating ? 'opacity-50' : ''}`}>
            {servers.map((mcp) => (
              <button
                type="button"
                key={mcp.id}
                className={`w-full text-left p-2 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                  selectedId === mcp.id && !isCreating
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/50'
                } ${isCreating ? 'pointer-events-none' : ''}`}
                onClick={() => {
                  if (!isEditing) onSelect(mcp.id);
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
                    e.preventDefault();
                    onSelect(mcp.id);
                  }
                }}
                disabled={isEditing}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Settings className="h-3 w-3 text-blue-500 flex-shrink-0" />
                    <span className="font-medium truncate text-sm">{mcp.name}</span>
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
                      {mcp.args && mcp.args.length > 0 && ` ${mcp.args.join(' ')}`}
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
