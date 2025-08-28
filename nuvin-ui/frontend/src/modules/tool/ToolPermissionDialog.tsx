import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components';
import { Button } from '@/components/ui/button';
import { useToolPermissionStore } from '@/store';
import { toolRegistry } from '@/lib/tools/tool-registry';
import { mcpManager } from '@/lib/mcp/mcp-manager';
import { isMCPTool } from '@/lib/mcp/mcp-tool';

export function ToolPermissionDialog() {
  const { request, resolveRequest, allowForConversation } = useToolPermissionStore();

  // Helper to get display tool name (prefer MCP schema name if available)
  const getDisplayToolName = (toolName: string): string => {
    const tool = toolRegistry.getTool(toolName);
    if (tool && isMCPTool(tool)) {
      return tool.getMCPSchema().name;
    }
    return toolName;
  };

  // Helper to get MCP server friendly name
  const getMCPServerName = (serverId: string): string => {
    const serverConfig = mcpManager.getServerConfig(serverId);
    return serverConfig?.name || serverId;
  };

  // Helper to get tool description
  const getToolDescription = (toolName: string, toolParams?: Record<string, unknown>): string | null => {
    const tool = toolRegistry.getTool(toolName);

    if (toolParams?.description && typeof toolParams.description === 'string') {
      return toolParams.description;
    }

    if (tool) {
      if (isMCPTool(tool)) {
        return tool.getMCPSchema().description || null;
      }
      return tool.definition.description || null;
    }

    return null;
  };

  const handleAllowOnce = () => {
    resolveRequest('once');
  };

  const handleAllowConversation = () => {
    if (request) {
      allowForConversation(request.conversationId, request.toolName);
    }
    resolveRequest('conversation');
  };

  const handleDeny = () => {
    resolveRequest('deny');
  };

  return (
    <Dialog open={!!request} onOpenChange={() => resolveRequest('deny')}>
      <DialogContent className="max-w-lg" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Allow tool "{request ? getDisplayToolName(request.toolName) : ''}" to run?</DialogTitle>
        </DialogHeader>
        {request && (
          <div className="space-y-3 py-1 overflow-hidden">
            {/* Tool meta */}
            <div className="text-sm text-muted-foreground">
              {(() => {
                const isMCP = toolRegistry.isMCPTool(request.toolName);
                if (isMCP) {
                  const serverId = toolRegistry.getMCPServerIdForTool(request.toolName);
                  const serverName = serverId ? getMCPServerName(serverId) : 'Unknown';
                  return <span>Source: MCP server ({serverName})</span>;
                }
                return <span>Source: built-in tool</span>;
              })()}
            </div>

            {/* Description */}
            {(() => {
              const description = getToolDescription(request.toolName, request.toolParams);
              return description ? (
                <div className="text-sm">
                  <span className="font-medium">What it does: </span>
                  <span className="text-muted-foreground">{description}</span>
                </div>
              ) : null;
            })()}

            {/* Parameters preview */}
            {request.toolParams && Object.keys(request.toolParams).length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">Requested parameters</div>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(request.toolParams, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="destructive" onClick={handleDeny} className="w-full sm:w-auto mr-auto">
            Deny
          </Button>
          <Button variant="outline" onClick={handleAllowConversation} className="w-full sm:w-auto">
            Allow for conversation
          </Button>
          <Button onClick={handleAllowOnce} className="w-full sm:w-auto">
            Allow once
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ToolPermissionDialog;
