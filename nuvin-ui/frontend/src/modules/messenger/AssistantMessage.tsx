import {
  Cpu,
  Copy,
  Check,
  FileText,
  Edit,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { ClipboardSetText } from '@/lib/wails-runtime';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useConversationStore } from '@/store/useConversationStore';
import type { MessageMetadata } from '@/types';
import { Textarea } from '@/components';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface AssistantMessageProps {
  id: string;
  content: string;
  isStreaming?: boolean;
  messageMode: 'normal' | 'transparent';
  metadata?: MessageMetadata;
}

export function AssistantMessage({
  id,
  content,
  isStreaming = false,
  messageMode,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  const { updateMessage, deleteMessage, activeConversationId } =
    useConversationStore();

  // Always strip all tool call markup from the content
  const cleanContent = useMemo(() => {
    return content.trim();
  }, [content]);

  const handleCopy = useCallback(async () => {
    try {
      // Copy raw content in raw view, clean content otherwise
      const contentToCopy = showRaw ? content.trim() : cleanContent;

      if (typeof ClipboardSetText === 'function') {
        await ClipboardSetText(contentToCopy);
      } else {
        await navigator.clipboard.writeText(contentToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  }, [content, cleanContent, showRaw]);

  const toggleRawView = useCallback(() => {
    setShowRaw((prev) => !prev);
  }, []);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setEditContent(content);
  }, [content]);

  const handleSaveEdit = useCallback(() => {
    if (activeConversationId && editContent.trim() !== content) {
      updateMessage(activeConversationId, {
        id,
        role: 'assistant',
        content: editContent.trim(),
        timestamp: new Date().toISOString(),
      });
    }
    setIsEditing(false);
  }, [activeConversationId, id, editContent, content, updateMessage]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent(content);
  }, [content]);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

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

  if (cleanContent.length === 0) return null;

  return (
    <>
      {/* Assistant avatar */}
      <div
        className={`h-8 w-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden ${isStreaming ? 'animate-pulse shadow-lg shadow-primary/30' : ''}`}
      >
        {isStreaming && (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent animate-ping" />
            <div className="absolute inset-0 bg-primary/20 animate-pulse" />
          </>
        )}
        <Cpu
          className={`h-4 w-4 text-primary-foreground relative z-10 transition-all duration-300 ${isStreaming ? 'animate-spin' : ''}`}
        />
      </div>

      {/* Message bubble container with metadata */}
      <div
        className={`relative ${isEditing ? 'w-full min-w-[600px]' : 'max-w-[70%]'} transition-all duration-300`}
      >
        {/* Message bubble */}
        <div
          className={`rounded-lg overflow-visible transition-all duration-300 p-4 relative ${
            messageMode === 'transparent'
              ? 'text-foreground'
              : isStreaming
                ? 'bg-gradient-to-br from-card to-card/80 border-border/50 shadow-md border'
                : 'bg-card border-border hover:shadow-xs hover:border-border/80 shadow-xxs border'
          }`}
        >
          {/* Metadata positioned absolutely inside the message */}

          {isEditing ? (
            // Edit mode
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full min-h-[120px] bg-transparent text-foreground placeholder-muted-foreground rounded-md p-3 text-sm font-sans resize-y leading-relaxed"
              placeholder="Edit assistant message..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  handleSaveEdit();
                } else if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
            />
          ) : showRaw ? (
            // Raw view
            <pre className="text-sm whitespace-pre-wrap font-sans">
              {content.trim()}
            </pre>
          ) : (
            // Rendered view
            <div className="text-sm relative">
              {/* Render clean content */}
              <MarkdownRenderer
                content={cleanContent}
                className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                isStreaming={isStreaming}
              />

              {isStreaming && (
                <div className="inline-flex items-center gap-2 animate-in fade-in duration-300 mt-2">
                  <span className="text-sm text-muted-foreground font-medium">
                    Generating...
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Controls positioned absolutely inside the message bubble */}
          <div className="absolute bottom-[-10px] right-2 flex gap-1 opacity-0 group-hover:opacity-100">
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
                  title="Delete message"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="p-1 rounded-md transition-all duration-200 hover:bg-foreground/20 text-foreground/80 hover:text-foreground backdrop-blur-sm shadow-sm bg-foreground/10"
                  title="Edit message"
                >
                  <Edit className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={toggleRawView}
                  className={`p-1 rounded-md transition-all duration-200 hover:bg-foreground/20 text-foreground/80 hover:text-foreground backdrop-blur-sm shadow-sm ${
                    showRaw ? 'bg-foreground/20' : 'bg-foreground/10'
                  }`}
                  title={showRaw ? 'Show rendered content' : 'Show raw content'}
                >
                  <FileText className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`p-1 rounded-md transition-all duration-200 hover:bg-foreground/20 text-foreground/80 hover:text-foreground backdrop-blur-sm shadow-sm bg-foreground/10 ${copied ? 'scale-110 bg-green-500/20 text-green-500' : ''}`}
                  title="Copy message"
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

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete message</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this message? This action cannot
              be undone.
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
