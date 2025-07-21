import { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Message as MessageType } from "@/types";
import { Message } from "./Message";
import { LoadingMessage } from "./components/LoadingMessage";

interface MessageListProps {
  messages: MessageType[];
  isLoading?: boolean;
  streamingMessageId?: string | null;
  useVirtualizer?: boolean;
}

export function MessageList({
  messages,
  isLoading = false,
  streamingMessageId,
  useVirtualizer: enableVirtualizer = true,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    enabled: enableVirtualizer,
    useAnimationFrameWithResizeObserver: true,
    count: messages.length + (isLoading ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 4,
    measureElement: (element) => {
      return element?.getBoundingClientRect().height ?? 200;
    },
  });

  const scrollToBottom = () => {
    if (parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  };

  // Scroll to bottom when component mounts (opening conversation)
  useEffect(() => {
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  }, []);

  const renderMessages = () => {
    if (messages.length === 0 && !isLoading) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <p className="text-lg mb-2">Welcome to Nuvin Space</p>
            <p className="text-sm">
              Start a conversation by typing a message below.
            </p>
          </div>
        </div>
      );
    }

    if (!enableVirtualizer) {
      return (
        <div className="space-y-6">
          {messages.map((message) => (
            <Message
              key={message.id}
              id={message.id}
              role={message.role}
              content={message.content}
              timestamp={message.timestamp}
              isStreaming={streamingMessageId === message.id}
            />
          ))}
          {isLoading && <LoadingMessage />}
        </div>
      );
    }

    return (
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
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
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="pb-6">
                {isLoadingItem ? (
                  <LoadingMessage />
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
    );
  };

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto p-6 bg-message-list-background"
    >
      <div className="max-w-4xl mx-auto">
        {renderMessages()}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
