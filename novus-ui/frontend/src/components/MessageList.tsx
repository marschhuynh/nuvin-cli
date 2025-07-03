import { useEffect, useRef } from 'react';
import { Message } from './Message';
import { Message as MessageType } from '@/types';

interface MessageListProps {
  messages: MessageType[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading = false }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-muted/20">
      <div className="max-w-4xl mx-auto space-y-6">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">Welcome to Nuvin Space</p>
              <p className="text-sm">Start a conversation by typing a message below.</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <Message
                key={message.id}
                id={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
              />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
                  <div className="h-4 w-4 bg-primary-foreground rounded-full animate-pulse" />
                </div>
                <div className="max-w-[70%] p-4 rounded-lg bg-card/80 backdrop-blur-sm ml-4 shadow-sm border border-border/50">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}