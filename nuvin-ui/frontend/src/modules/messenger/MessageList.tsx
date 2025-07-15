import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message as MessageType } from '@/types';
import { Message } from './Message';

interface MessageListProps {
  messages: MessageType[];
  isLoading?: boolean;
  streamingMessageId?: string | null;
}

export function MessageList({ messages, isLoading = false, streamingMessageId }: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    useAnimationFrameWithResizeObserver: true,
    count: messages.length + (isLoading ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 7,
    measureElement: (element) => {
      return element?.getBoundingClientRect().height ?? 200;
    },
  });

  const scrollToBottom = () => {
    if (parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      scrollToBottom();
    }, 100);
  }, [messages]);

  // Scroll to bottom when component mounts (opening conversation)
  useEffect(() => {
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  }, []);

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto p-6 bg-message-list-background"
    >
      <div className="max-w-4xl mx-auto">
        {messages.length === 0 && !isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">Welcome to Nuvin Space</p>
              <p className="text-sm">
                Start a conversation by typing a message below.
              </p>
            </div>
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const isLoadingItem = virtualItem.index >= messages.length;
              const message = messages[virtualItem.index];

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="pb-6">
                    {(isLoadingItem) ? (
                      <div className="flex justify-start animate-in fade-in slide-in-from-left-3 duration-300">
                        <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent animate-pulse duration-1000" />
                          <div className="h-4 w-4 bg-primary-foreground rounded-full animate-pulse relative z-10" />
                        </div>
                        <div className="max-w-[70%] p-4 rounded-lg bg-card ml-4 shadow-md border border-border/50 relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/10 to-transparent -translate-x-full animate-pulse duration-2000" />
                          <div className="flex space-x-1.5 items-center relative z-10">
                            <div className="flex space-x-1">
                              <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-bounce shadow-sm" />
                              <div
                                className="w-2 h-2 bg-gradient-to-r from-purple-400 to-purple-600 rounded-full animate-bounce shadow-sm"
                                style={{ animationDelay: '0.15s' }}
                              />
                              <div
                                className="w-2 h-2 bg-gradient-to-r from-green-400 to-green-600 rounded-full animate-bounce shadow-sm"
                                style={{ animationDelay: '0.3s' }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Message
                        id={message.id}
                        role={message.role}
                        content={message.content}
                        timestamp={message.timestamp}
                        isStreaming={streamingMessageId === message.id}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
