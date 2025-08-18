import { User, Copy, Check, Edit, Trash2, Save, X } from 'lucide-react';
import { useState, useCallback } from 'react';
import { ClipboardSetText } from '@/lib/wails-runtime';
import { useConversationStore } from '@/store/useConversationStore';
import { Textarea } from '@/components';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface UserMessageProps {
  id: string;
  content: string;
  isStreaming?: boolean;
  messageMode: 'normal' | 'transparent';
}

export function UserMessage({ id, content, messageMode }: UserMessageProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const trimmedContent = content.trim();

  const { updateMessage, deleteMessage, activeConversationId } =
    useConversationStore();

  const handleCopy = useCallback(async () => {
    try {
      if (typeof ClipboardSetText === 'function') {
        await ClipboardSetText(trimmedContent);
      } else {
        await navigator.clipboard.writeText(trimmedContent);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  }, [trimmedContent]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setEditContent(content);
  }, [content]);

  const handleSaveEdit = useCallback(() => {
    if (activeConversationId && editContent.trim() !== content) {
      updateMessage(activeConversationId, {
        id,
        role: 'user',
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

  if (trimmedContent.length === 0) return null;

  return (
    <>
      {/* Message bubble */}
      <div
        className={`relative ${isEditing ? 'w-full' : 'max-w-[70%]'} overflow-visible transition-all duration-300 ${
          messageMode === 'transparent'
            ? 'text-foreground'
            : 'rounded-lg p-4 bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border-primary/20 shadow-primary/20 hover:shadow-sm shadow-xxs border'
        }`}
      >
        {isEditing ? (
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full min-h-[80px] bg-transparent text-primary-foreground placeholder-primary-foreground/70 border-none outline-none resize-y text-sm font-sans leading-relaxed"
            placeholder="Edit your message..."
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
        ) : (
          <pre className="text-sm whitespace-pre-wrap font-sans">
            {trimmedContent}
          </pre>
        )}

        {/* Controls positioned absolutely inside the message bubble */}
        <div className="absolute bottom-[-10px] right-2 flex gap-1 opacity-0 group-hover:opacity-100">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="p-1 rounded-md transition-all duration-200 hover:bg-primary-foreground/20 text-primary-foreground/80 hover:text-primary-foreground backdrop-blur-sm shadow-sm bg-primary-foreground/10"
                title="Save changes"
              >
                <Save className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1 rounded-md transition-all duration-200 hover:bg-primary-foreground/20 text-primary-foreground/80 hover:text-primary-foreground backdrop-blur-sm shadow-sm bg-primary-foreground/10"
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
                className="p-1 rounded-md transition-all duration-200 hover:bg-red-500/20 text-primary-foreground/80 hover:text-red-200 backdrop-blur-sm shadow-sm bg-primary-foreground/10"
                title="Delete message"
              >
                <Trash2 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className="p-1 rounded-md transition-all duration-200 hover:bg-primary-foreground/20 text-primary-foreground/80 hover:text-primary-foreground backdrop-blur-sm shadow-sm bg-primary-foreground/10"
                title="Edit message"
              >
                <Edit className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className={`p-1 rounded-md transition-all duration-200 hover:bg-primary-foreground/20 text-primary-foreground/80 hover:text-primary-foreground backdrop-blur-sm shadow-sm bg-primary-foreground/10 ${copied ? 'scale-110 bg-green-500/20 text-green-200' : ''}`}
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

      {/* User avatar */}
      <div className="h-8 w-8 bg-gradient-to-br from-secondary to-secondary/80 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm transition-shadow">
        <User className="h-4 w-4 text-secondary-foreground" />
      </div>
    </>
  );
}
