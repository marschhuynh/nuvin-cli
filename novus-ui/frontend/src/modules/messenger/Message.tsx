import { User, Cpu } from 'lucide-react';

interface MessageProps {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export function Message({ role, content }: MessageProps) {
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
        className={`max-w-[70%] p-4 rounded-lg shadow-sm border ${
          role === 'user'
            ? 'bg-primary text-primary-foreground border-primary/20'
            : 'bg-card/90 backdrop-blur-sm border-border/60'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{content}</p>
      </div>
      {role === 'user' && (
        <div className="h-8 w-8 bg-secondary rounded-full flex items-center justify-center">
          <User className="h-4 w-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}