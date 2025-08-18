import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components';
import { Button } from '@/components/ui/button';
import { useToolPermissionStore } from '@/store';
import { toolRegistry } from '@/lib/tools/tool-registry';

export function ToolPermissionDialog() {
  const { request, resolveRequest, allowForConversation } = useToolPermissionStore();

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
          <DialogTitle>
            Allow tool "{request?.toolName}" to run?
          </DialogTitle>
        </DialogHeader>
        {request && (
          <div className="space-y-3 py-1 overflow-hidden">
            {/* Tool meta */}
            <div className="text-sm text-muted-foreground">
              {(() => {
                const isMCP = toolRegistry.isMCPTool(request.toolName);
                if (isMCP) {
                  const serverId = toolRegistry.getMCPServerIdForTool(request.toolName);
                  return (
                    <span>
                      Source: MCP server{serverId ? ` (${serverId})` : ''}
                    </span>
                  );
                }
                return <span>Source: built-in tool</span>;
              })()}
            </div>

            {/* Description */}
            {(request.toolParams as any).description && <div className="text-sm">
              <span className="font-medium">What it does: </span>
              <span className="text-muted-foreground">
                {(request.toolParams as any).description}
              </span>
            </div>}

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
