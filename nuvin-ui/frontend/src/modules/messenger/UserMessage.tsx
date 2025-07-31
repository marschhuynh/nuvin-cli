import { User, Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime';

interface UserMessageProps {
  content: string;
  isStreaming?: boolean;
  messageMode: 'normal' | 'transparent';
}

export function UserMessage({ content, messageMode }: UserMessageProps) {
  const [copied, setCopied] = useState(false);
  const trimmedContent = content.trim();

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

  if (trimmedContent.length === 0) return null;

  return (
    <>
      {/* Controls for user messages - positioned before message bubble */}
      <div className="flex flex-col gap-1 self-end sticky top-2 z-10 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <button
          type="button"
          onClick={handleCopy}
          className={`p-1.5 rounded-md transition-all duration-200 hover:bg-muted text-muted-foreground backdrop-blur-sm border border-border/50 shadow-sm bg-background/80 ${copied ? 'scale-110 bg-green-100/80 text-green-600' : ''}`}
          title="Copy message"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Message bubble */}
      <div
        className={`max-w-[70%] overflow-auto transition-all duration-300 ${
          messageMode === 'transparent'
            ? 'text-foreground'
            : 'rounded-lg p-4 bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border-primary/20 shadow-primary/20 hover:shadow-sm shadow-xxs border'
        }`}
      >
        <pre className="text-sm whitespace-pre-wrap font-sans">
          {trimmedContent}
        </pre>
      </div>

      {/* User avatar */}
      <div className="h-8 w-8 bg-gradient-to-br from-secondary to-secondary/80 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm transition-shadow">
        <User className="h-4 w-4 text-secondary-foreground" />
      </div>
    </>
  );
}
