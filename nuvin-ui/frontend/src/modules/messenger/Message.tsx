import { User, Cpu, Copy, Check, FileText } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime';
import { MarkdownRenderer } from './MarkdownRenderer';
import { parseToolCalls, stripToolCalls } from '@/lib/utils/tool-call-parser';
import { ToolCall } from './components/ToolCall';

interface MessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
}

export function Message({ role, content, isStreaming = false }: MessageProps) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const trimmedContent = content.trim();
  
  // Parse tool calls from the content
  const parsedContent = useMemo(() => {
    return parseToolCalls(trimmedContent);
  }, [trimmedContent]);

  // Get clean content without tool call markup
  const cleanContent = useMemo(() => {
    return parsedContent.hasToolCalls ? stripToolCalls(trimmedContent) : trimmedContent;
  }, [parsedContent.hasToolCalls, trimmedContent]);

  const handleCopy = useCallback(async () => {
    try {
      // Copy raw content in raw view, clean content otherwise
      const contentToCopy = showRaw ? trimmedContent : cleanContent;
      
      // Try Wails clipboard first, fallback to browser clipboard
      if (typeof ClipboardSetText === 'function') {
        await ClipboardSetText(contentToCopy);
      } else {
        await navigator.clipboard.writeText(contentToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  }, [trimmedContent, cleanContent, showRaw]);

  const toggleRawView = useCallback(() => {
    setShowRaw((prev) => !prev);
  }, []);


  return (
    <div
      className={`flex gap-4 chat-message animate-in fade-in slide-in-from-bottom-2 duration-300 group ${role === 'user' ? 'justify-end' : 'justify-start'
        }`}
    >
      {role === 'assistant' && (
        <div className={`h-8 w-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden ${isStreaming ? 'animate-pulse' : ''}`}>
          {isStreaming && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent animate-ping" />
          )}
          <Cpu className={`h-4 w-4 text-primary-foreground relative z-10 ${isStreaming ? 'animate-bounce' : ''}`} />
        </div>
      )}

      {/* Controls for user messages - positioned before message bubble */}
      {role === 'user' && trimmedContent.length > 0 && (
        <div className="flex flex-col gap-1 self-end sticky top-2 z-10 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <button
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
      )}

      {trimmedContent.length > 0 && <div
        className={`max-w-[70%] p-4 rounded-lg shadow-lg border overflow-auto transition-all duration-300 ${role === 'user'
          ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border-primary/20 shadow-primary/20'
          : isStreaming
            ? 'bg-gradient-to-br from-card to-card/80 border-border/50 shadow-md'
            : 'bg-card border-border hover:shadow-xl hover:border-border/80'
          }`}
      >
        {role === 'user' || showRaw ? (
          // For user messages or raw view, show plain text
          <pre className="text-sm whitespace-pre-wrap font-sans">
            {trimmedContent}
          </pre>
        ) : (
          // For assistant messages in rendered view, show parsed content
          <div className="text-sm relative">
            {/* Render tool calls first */}
            {parsedContent.hasToolCalls && parsedContent.toolCalls.map((toolCall, index) => (
              <ToolCall key={`${toolCall.name}-${toolCall.id}-${index}`} toolCall={toolCall} />
            ))}
            
            {/* Render clean content if there's any */}
            {cleanContent.trim().length > 0 && (
              <MarkdownRenderer
                content={cleanContent}
                className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              />
            )}
            
            {isStreaming && (
              <div className="inline-flex items-center animate-in fade-in duration-300">
                <span className="text-xs text-muted-foreground/80 animate-pulse">
                  Generating...
                </span>
              </div>
            )}
          </div>
        )}
      </div>}

      {/* Controls for assistant messages - positioned on the right of message */}
      {role === 'assistant' && trimmedContent.length > 0 && (
        <div className="flex flex-col self-end gap-1 z-10 opacity-1 group-hover:opacity-100 transition-all duration-200">
          <button
            onClick={toggleRawView}
            className={`p-1.5 rounded-md transition-all duration-200 hover:bg-muted text-muted-foreground backdrop-blur-sm border border-border/50 shadow-sm ${showRaw ? 'bg-muted/80' : 'bg-background/80'
              }`}
            title={showRaw ? 'Show rendered content' : 'Show raw content'}
          >
            <FileText className="h-4 w-4" />
          </button>
          <button
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
      )}

      {role === 'user' && (
        <div className="h-8 w-8 bg-gradient-to-br from-secondary to-secondary/80 rounded-full flex items-center justify-center flex-shrink-0 shadow-md hover:shadow-lg transition-shadow">
          <User className="h-4 w-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}
