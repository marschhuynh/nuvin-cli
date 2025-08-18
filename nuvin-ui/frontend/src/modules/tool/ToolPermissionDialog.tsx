import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components';
import { Button } from '@/components/ui/button';
import { useToolPermissionStore } from '@/store';

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Allow tool {request?.toolName}?</DialogTitle>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={handleDeny} className="w-full sm:w-auto">
            Deny
          </Button>
          <Button variant="secondary" onClick={handleAllowOnce} className="w-full sm:w-auto">
            Allow once
          </Button>
          <Button onClick={handleAllowConversation} className="w-full sm:w-auto">
            Allow for conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ToolPermissionDialog;
