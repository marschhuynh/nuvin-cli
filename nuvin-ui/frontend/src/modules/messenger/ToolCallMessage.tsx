import {
  Wrench,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit,
  Check,
  Copy,
  Save,
  X
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime';
import { useConversationStore } from '@/store/useConversationStore';

interface ToolCallMessageProps {
  id: string;
  toolName: string;
  arguments: any;
  result?: {
    status: 'success' | 'error' | 'warning';
    type: 'text' | 'json';
    result: string | object;
    additionalResult?: Record<string, any>;
    metadata?: Record<string, any>;
  };
  isExecuting?: boolean;
}

export function ToolCallMessage({
  id,
  toolName,
  arguments: args,
  result,
  isExecuting = false,
}: ToolCallMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showToolDetail, setShowToolDetail] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editArgs, setEditArgs] = useState(JSON.stringify(args, null, 2));

  const { updateMessage, deleteMessage, activeConversationId } =
    useConversationStore();

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

  const formatJSON = useCallback((data: any) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, []);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setEditArgs(JSON.stringify(args, null, 2));
  }, [args]);

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
    } catch (error) {
      alert('Invalid JSON format. Please check your syntax.');
    }
  }, [
    activeConversationId,
    id,
    editArgs,
    toolName,
    result,
    isExecuting,
    updateMessage,
  ]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditArgs(JSON.stringify(args, null, 2));
  }, [args]);

  const handleDelete = useCallback(() => {
    if (
      activeConversationId &&
      confirm('Are you sure you want to delete this tool call?')
    ) {
      deleteMessage(activeConversationId, id);
    }
  }, [activeConversationId, id, deleteMessage]);

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

  return (
    <>
      {/* Tool icon */}
      <div className="h-8 w-8 bg-green-400 rounded-full flex items-center justify-center flex-shrink-0">
        <Wrench className="h-4 w-4 text-white" />
      </div>

      {/* Tool call card - compact linear layout */}
      <div
        className={`relative ${isEditing ? 'w-full min-w-[600px]' : 'w-[70%] max-w-[70%]'} transition-all duration-300`}
      >
        <div className="rounded-lg bg-card border-border hover:shadow-xs hover:border-border/80 shadow-xxs border transition-all duration-300 overflow-visible relative">
          {!showToolDetail ? (
            /* Compact linear view: icon > name > status > collapse */
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                {/* Status icon */}
                {getStatusIcon()}

                {/* Tool name */}
                <span className="font-medium text-foreground text-sm">
                  {toolName}
                </span>

                {/* Status badge */}
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    isExecuting
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : result?.status === 'success'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                        : result?.status === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                          : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {getStatusText()}
                </span>

                {/* Collapse controls */}
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowToolDetail(!showToolDetail)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted/50"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Expanded view */
            <>
              {/* Header */}
              <div className="px-3 py-2.5 border-b border-border/50">
                <div className="flex items-center gap-3">
                  {getStatusIcon()}
                  <span className="font-medium text-foreground text-sm">
                    {toolName}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      isExecuting
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                        : result?.status === 'success'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          : result?.status === 'error'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                            : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {getStatusText()}
                  </span>

                  {/* Collapse controls */}
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowToolDetail(!showToolDetail)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted/50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-3 space-y-3">
                {/* Arguments Section */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Arguments
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(args || {}).length} parameters
                    </span>
                  </div>

                  <div className="mt-2 p-3 bg-muted/50 rounded border border-border">
                    {isEditing ? (
                      <textarea
                        value={editArgs}
                        onChange={(e) => setEditArgs(e.target.value)}
                        className="w-full min-h-[120px] bg-transparent text-foreground placeholder-muted-foreground border border-border rounded-md p-2 text-xs font-mono resize-y leading-relaxed"
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
                      <pre className="text-xs text-foreground overflow-auto leading-relaxed font-mono">
                        {formatJSON(args)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Control buttons positioned absolutely inside the tool card */}
          <div className="absolute top-2.5 right-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="p-1 rounded-md transition-all duration-200 hover:bg-foreground/20 text-foreground/80 hover:text-foreground backdrop-blur-sm shadow-sm bg-foreground/10"
                  title="Save changes"
                >
                  <Save className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="p-1 rounded-md transition-all duration-200 hover:bg-foreground/20 text-foreground/80 hover:text-foreground backdrop-blur-sm shadow-sm bg-foreground/10"
                  title="Cancel editing"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
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
                  onClick={handleEdit}
                  className="p-1 rounded-md transition-all duration-200 hover:bg-foreground/20 text-foreground/80 hover:text-foreground backdrop-blur-sm shadow-sm bg-foreground/10"
                  title="Edit tool arguments"
                >
                  <Edit className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`p-1 rounded-md transition-all duration-200 hover:bg-foreground/20 text-foreground/80 hover:text-foreground backdrop-blur-sm shadow-sm bg-foreground/10 ${
                    copied ? 'scale-110 bg-green-500/20 text-green-500' : ''
                  }`}
                  title="Copy tool call"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
