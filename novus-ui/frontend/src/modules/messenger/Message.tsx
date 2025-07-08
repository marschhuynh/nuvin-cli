import { User, Cpu, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime';

interface MessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export function Message({ role, content }: MessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await ClipboardSetText(content.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  return (
    <div
      className={`flex gap-4 chat-message ${
        role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      {role === 'assistant' && (
        <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
          <Cpu className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
      <div
        className={`max-w-[70%] p-4 rounded-lg shadow-sm border relative group ${
          role === 'user'
            ? 'bg-primary text-primary-foreground border-primary/20'
            : 'bg-card/90 backdrop-blur-sm border-border/60'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{content.trim()}</p>
        <button
          onClick={handleCopy}
          className={`absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${
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
      {role === 'user' && (
        <div className="h-8 w-8 bg-secondary rounded-full flex items-center justify-center">
          <User className="h-4 w-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}