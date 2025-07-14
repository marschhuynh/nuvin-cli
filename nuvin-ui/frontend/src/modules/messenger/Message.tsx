import { User, Cpu, Copy, Check, FileText } from 'lucide-react';
import { useState, useCallback } from 'react';
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export function Message({ role, content }: MessageProps) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await ClipboardSetText(content.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  }, [content]);

  const toggleRawView = useCallback(() => {
    setShowRaw((prev) => !prev);
  }, []);

  return (
    <div
      className={`flex gap-4 chat-message ${
        role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      {role === 'assistant' && (
        <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
          <Cpu className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
      <div
        className={`max-w-[70%] p-4 rounded-lg shadow-sm border relative group overflow-auto ${
          role === 'user'
            ? 'bg-primary text-primary-foreground border-primary/20'
            : 'bg-card border-border'
        }`}
      >
        {role === 'user' || showRaw ? (
          // For user messages or raw view, show plain text
          <pre className="text-sm whitespace-pre-wrap font-sans">
            {content.trim()}
          </pre>
        ) : (
          // For assistant messages in rendered view, show markdown
          <div className="text-sm">
            <MarkdownRenderer
              content={content.trim()}
              className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            />
          </div>
        )}

        <div className="absolute top-2 right-2 flex gap-1">
          {role === 'assistant' && (
            <button
              onClick={toggleRawView}
              className={`p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted text-muted-foreground ${
                showRaw ? 'bg-muted/50' : ''
              }`}
              title={showRaw ? 'Show rendered content' : 'Show raw content'}
            >
              <FileText className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${
              role === 'user'
                ? 'hover:bg-primary-foreground/10 text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground'
            }`}
            title="Copy message"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      {role === 'user' && (
        <div className="h-8 w-8 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}
