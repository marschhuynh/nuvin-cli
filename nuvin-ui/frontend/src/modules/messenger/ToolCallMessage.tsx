import { Wrench, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, Trash2, Check, Copy } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import { ClipboardSetText } from '@/lib/browser-runtime';
import { useConversationStore } from '@/store/useConversationStore';
import { mcpManager } from '@/lib/mcp/mcp-manager';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface ToolCallMessageProps {
  id: string;
  toolName: string;
  description?: string;
  arguments: Record<string, unknown>;
  result?: {
    status: 'success' | 'error' | 'warning';
    type: 'text' | 'json';
    result: string | object;
    additionalResult?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  isExecuting?: boolean;
  messageMode?: 'normal' | 'transparent';
}

// Helper function to remove system reminder tags from content
const removeSystemReminderTags = (content: string): string => {
  if (typeof content !== 'string') return content;
  // Remove <system-reminder>...</system-reminder> blocks including the tags
  return content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
};

export function ToolCallMessage({
  id,
  toolName,
  description,
  arguments: args,
  result,
  isExecuting = false,
  messageMode,
}: ToolCallMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showToolDetail, setShowToolDetail] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editArgs, setEditArgs] = useState(JSON.stringify(args, null, 2));
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  const contentRef = useRef<HTMLPreElement>(null);

  const { updateMessage, deleteMessage, activeConversationId } = useConversationStore();

  const handleCopy = useCallback(async () => {
    try {
      const content = `Tool: ${toolName}\nArguments: ${JSON.stringify(args, null, 2)}${
        result ? `\nResult: ${JSON.stringify(result, null, 2)}` : ''
      }`;

      if (typeof ClipboardSetText === 'function') {
        await ClipboardSetText(content);
      } else {
        await navigator.clipboard.writeText(content);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy tool call:', error);
    }
  }, [toolName, args, result]);

  const formatJSON = useCallback((data: unknown) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, []);

  const handleSaveEdit = useCallback(() => {
    try {
      const newArgs = JSON.parse(editArgs);
      if (activeConversationId) {
        // Update the message with new tool arguments
        updateMessage(activeConversationId, {
          id,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          toolCall: {
            name: toolName,
            id: id,
            arguments: newArgs,
            result,
            isExecuting,
          },
        });
      }
      setIsEditing(false);
      setContentHeight(null);
    } catch (_error) {
      setErrorDialog({
        open: true,
        title: 'Invalid JSON',
        message: 'Please check your syntax and try again.',
      });
    }
  }, [activeConversationId, id, editArgs, toolName, result, isExecuting, updateMessage]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditArgs(JSON.stringify(args, null, 2));
    setContentHeight(null);
  }, [args]);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Simple error dialog for invalid JSON
  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: '', message: '' });

  const handleDelete = useCallback(() => {
    if (activeConversationId) {
      setIsDeleteOpen(true);
    }
  }, [activeConversationId]);

  const handleConfirmDelete = useCallback(() => {
    if (activeConversationId) {
      deleteMessage(activeConversationId, id);
    }
    setIsDeleteOpen(false);
  }, [activeConversationId, id, deleteMessage]);

  const handleCancelDelete = useCallback(() => {
    setIsDeleteOpen(false);
  }, []);

  const getStatusIcon = () => {
    if (isExecuting) {
      return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    }
    if (result?.status === 'success') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (result?.status === 'error') {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return <Wrench className="h-4 w-4 text-gray-400" />;
  };

  const getStatusText = () => {
    if (isExecuting) return 'Executing...';
    if (result?.status === 'success') return 'Completed';
    if (result?.status === 'error') return 'Failed';
    if (result?.status === 'warning') return 'Warning';
    return 'Pending';
  };

  // Extract description from arguments if not provided directly
  const getToolDescription = () => {
    if (description) return description;

    // Try to extract description from arguments
    if (args && typeof args === 'object') {
      if (args.description && typeof args.description === 'string') {
        return args.description;
      }
    }

    return null;
  };

  // Helper to get MCP server name from metadata
  const getMcpServerName = () => {
    if (result?.metadata?.serverId) {
      const serverId = (result.metadata.serverId as string) ?? 'Unknown';
      const serverConfig = mcpManager.getServerConfig(serverId);
      return serverConfig?.name || 'MCP';
    }
    return null;
  };

  // Helper to get display tool name (prefer mcpToolName if available)
  const getDisplayToolName = (): string => {
    return (result?.metadata?.mcpToolName as string) || toolName;
  };

  // Helper to get result preview for second line
  const getResultPreview = () => {
    if (!result?.result) return null;

    if (typeof result.result === 'string') {
      // Take first line and limit length
      const firstLine = result.result.split('\n')[0];
      return firstLine.length > 100 ? `${firstLine.slice(0, 100)}...` : firstLine;
    }

    return 'JSON result';
  };

  const toolDescription = getToolDescription();
  const mcpServerName = getMcpServerName();
  const displayToolName = getDisplayToolName();
  const resultPreview = getResultPreview();

  return (
    <>
      {/* Error dialog */}
      <Dialog open={errorDialog.open} onOpenChange={(o) => setErrorDialog((d) => ({ ...d, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{errorDialog.title}</DialogTitle>
            {errorDialog.message && <DialogDescription>{errorDialog.message}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm border bg-background hover:bg-muted/50"
              onClick={() => setErrorDialog((d) => ({ ...d, open: false }))}
            >
              OK
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Tool icon */}
      <div className="h-8 w-8 bg-green-400 rounded-full flex items-center justify-center flex-shrink-0">
        <Wrench className="h-4 w-4 text-white" />
      </div>

      {/* Tool call card - compact linear layout */}
      <div
        className={`relative ${isEditing ? 'w-full min-w-[600px]' : 'w-[70%] max-w-[70%]'} transition-all duration-300`}
      >
        <div
          className={
            messageMode === 'transparent'
              ? 'text-foreground'
              : 'rounded-lg bg-card border-border hover:shadow-xs hover:border-border/80 shadow-xxs border transition-all duration-300 overflow-visible relative'
          }
        >
          {!showToolDetail ? (
            /* Compact linear view: 2-line friendly layout */
            <div className="px-3 py-2.5">
              {/* First line: collapse icon > status icon > tool name > MCP name (if MCP tool) */}
              <div className="flex items-center gap-3">
                {/* Collapse controls */}
                <button
                  type="button"
                  onClick={() => setShowToolDetail(!showToolDetail)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted/50"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>

                {/* Status icon */}
                {getStatusIcon()}

                {/* Tool name */}
                <span className="font-medium text-foreground text-sm flex-shrink-0">{displayToolName}</span>

                {/* MCP server name (if MCP tool) */}
                {mcpServerName && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 ml-auto flex-shrink-0">
                    {mcpServerName}
                  </span>
                )}
              </div>

              {/* Second line: tool description or result preview */}
              {(toolDescription || resultPreview) && (
                <div className="mt-1 ml-8 flex items-center">
                  <span className="text-xs text-muted-foreground truncate">{toolDescription || resultPreview}</span>
                </div>
              )}
            </div>
          ) : (
            /* Expanded view */
            <>
              {/* Header - consistent with compact mode */}
              <div className="px-3 py-2.5 border-b border-border/50">
                {/* First line: collapse icon > status icon > tool name > MCP name (if MCP tool) */}
                <div className="flex items-center gap-3">
                  {/* Collapse controls */}
                  <button
                    type="button"
                    onClick={() => setShowToolDetail(!showToolDetail)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted/50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>

                  {/* Status icon */}
                  {getStatusIcon()}

                  {/* Tool name */}
                  <span className="font-medium text-foreground text-sm flex-shrink-0">{displayToolName}</span>

                  {/* MCP server name (if MCP tool) */}
                  {mcpServerName && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 ml-auto flex-shrink-0">
                      {mcpServerName}
                    </span>
                  )}
                </div>

                {/* Second line: tool description or result preview */}
                {(toolDescription || resultPreview) && (
                  <div className="mt-1 ml-8 flex items-center">
                    <span className="text-xs text-muted-foreground truncate">{toolDescription || resultPreview}</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-3 space-y-3">
                {/* Arguments Section */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Arguments</span>
                    <span className="text-xs text-muted-foreground">{Object.keys(args || {}).length} parameters</span>
                  </div>

                  <div className="mt-2 p-3 bg-muted/50 rounded border border-border">
                    {isEditing ? (
                      <textarea
                        value={editArgs}
                        onChange={(e) => setEditArgs(e.target.value)}
                        className="w-full bg-transparent text-foreground placeholder-muted-foreground border border-border rounded-md p-2 text-xs font-mono resize-y leading-relaxed"
                        style={{
                          minHeight: contentHeight ? `${Math.max(contentHeight, 120)}px` : '120px',
                          height: contentHeight ? `${Math.max(contentHeight, 120)}px` : 'auto',
                        }}
                        placeholder="Edit tool arguments (JSON format)..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey) {
                            e.preventDefault();
                            handleSaveEdit();
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                      />
                    ) : (
                      <pre ref={contentRef} className="text-xs text-foreground overflow-auto leading-relaxed font-mono">
                        {formatJSON(args)}
                      </pre>
                    )}
                  </div>
                </div>
                {/* Result Section */}
                {result && (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Result</span>
                      {result.status === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : result.status === 'warning' ? (
                        <XCircle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>

                    <div className="mt-2">
                      <div
                        className={`overflow-auto p-3 rounded border text-sm ${
                          result.status === 'success'
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-800 dark:text-green-200'
                            : result.status === 'warning'
                              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/50 text-yellow-800 dark:text-yellow-200'
                              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-200'
                        }`}
                      >
                        {/* Display the actual result content */}
                        {result.result ? (
                          typeof result.result === 'string' ? (
                            <div className="whitespace-pre-wrap text-xs leading-relaxed">
                              {removeSystemReminderTags(result.result)}
                            </div>
                          ) : (
                            <pre className="overflow-auto leading-relaxed font-mono text-xs">
                              {formatJSON(result.result)}
                            </pre>
                          )
                        ) : (
                          <div className="flex items-center gap-2">
                            {result.status === 'success' ? (
                              <>
                                <CheckCircle className="h-4 w-4" />
                                <span>Operation completed successfully</span>
                              </>
                            ) : result.status === 'warning' ? (
                              <>
                                <XCircle className="h-4 w-4" />
                                <span>Operation completed with warnings</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-4 w-4" />
                                <span>Operation failed</span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Show additional result if available */}
                        {result.additionalResult && (
                          <div className="mt-3 pt-3 border-t border-current/20">
                            <div className="text-xs font-medium mb-2 opacity-80">Additional Information:</div>
                            <pre className="overflow-auto leading-relaxed font-mono text-xs opacity-90">
                              {formatJSON(result.additionalResult)}
                            </pre>
                          </div>
                        )}

                        {/* Show metadata if available */}
                        {result.metadata && Object.keys(result.metadata).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-current/20">
                            <div className="text-xs font-medium mb-2 opacity-80">Metadata:</div>
                            <pre className="overflow-auto leading-relaxed font-mono text-xs opacity-90">
                              {formatJSON(result.metadata)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Control buttons positioned absolutely inside the tool card */}
          <div className="absolute bottom-[-10px] right-2 flex gap-1 opacity-0 group-hover:opacity-100">
            {
              <>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="p-1 rounded-md transition-all duration-200 hover:bg-red-500/20 text-foreground/80 hover:text-red-500 backdrop-blur-sm shadow-sm bg-foreground/10"
                  title="Delete tool call"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`p-1 rounded-md transition-all duration-200 hover:bg-foreground/20 text-foreground/80 hover:text-foreground backdrop-blur-sm shadow-sm bg-foreground/10 ${
                    copied ? 'scale-110 bg-green-500/20 text-green-500' : ''
                  }`}
                  title="Copy tool call"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </>
            }
          </div>
        </div>
      </div>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tool call</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this tool call? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelDelete}
                className="px-3 py-1 rounded-md bg-muted/10 text-foreground hover:bg-muted/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3 py-1 rounded-md bg-red-500 text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
