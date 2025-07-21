import { useRef, useEffect, useState, useCallback } from "react";
import { Message as MessageType } from "@/types";
import { Message } from "./Message";
import { LoadingMessage } from "./components/LoadingMessage";
import { Loader2 } from "lucide-react";

interface MessageListPaginatedProps {
  messages: MessageType[];
  isLoading?: boolean;
  streamingMessageId?: string | null;
  initialLoadCount?: number;
  loadMoreCount?: number;
}

export function MessageListPaginated({
  messages,
  isLoading = false,
  streamingMessageId,
  initialLoadCount = 5,
  loadMoreCount = 10,
}: MessageListPaginatedProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [displayedCount, setDisplayedCount] = useState(initialLoadCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Get the messages to display (from the end, newest first)
  const displayedMessages = messages.slice(-displayedCount);
  const hasMoreMessages = messages.length > displayedCount;

  const scrollToBottom = () => {
    if (parentRef.current) {
      parentRef.current.scrollTo({
        top: parentRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  // Load more messages
  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreMessages) return;

    setIsLoadingMore(true);

    // Store current scroll position before loading more
    const scrollElement = parentRef.current;
    const scrollTopBefore = scrollElement?.scrollTop || 0;
    const scrollHeightBefore = scrollElement?.scrollHeight || 0;

    // Simulate loading delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    setDisplayedCount((prev) =>
      Math.min(prev + loadMoreCount, messages.length)
    );

    // Restore scroll position after DOM update
    setTimeout(() => {
      if (scrollElement) {
        const scrollHeightAfter = scrollElement.scrollHeight;
        const heightDifference = scrollHeightAfter - scrollHeightBefore;
        scrollElement.scrollTop = scrollTopBefore + heightDifference;
      }
      setIsLoadingMore(false);
    }, 0);
  }, [isLoadingMore, hasMoreMessages, loadMoreCount, messages.length]);

  // Handle scroll to detect when user reaches the top
  const handleScroll = useCallback(() => {
    if (!parentRef.current || isLoadingMore || !hasMoreMessages) return;

    const { scrollTop } = parentRef.current;

    // If user scrolled to within 100px of the top, load more messages
    if (scrollTop <= 100) {
      loadMoreMessages();
    }
  }, [isLoadingMore, hasMoreMessages, loadMoreMessages]);

  // Attach scroll listener
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener("scroll", handleScroll);
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Scroll to bottom only when new messages arrive (not when loading more)
  useEffect(() => {
    if (displayedMessages.length > 0 && !isLoadingMore) {
      // Only auto-scroll if we're showing all messages or if it's a new message
      const isShowingAllMessages = displayedCount >= messages.length;
      if (isShowingAllMessages) {
        setTimeout(() => {
          scrollToBottom();
        }, 100);
      }
    }
  }, [displayedMessages.length, isLoadingMore, displayedCount, messages.length]);

  // Initial scroll to bottom
  useEffect(() => {
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  }, []);

  // Reset displayed count when messages change significantly
  useEffect(() => {
    if (messages.length < displayedCount) {
      setDisplayedCount(Math.max(initialLoadCount, messages.length));
    }
  }, [messages.length, displayedCount, initialLoadCount]);

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

    return (
      <div className="space-y-6">
        {/* Load More Indicator */}
        {hasMoreMessages && (
          <div className="flex justify-center py-4">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading more messages...</span>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Scroll up to load{" "}
                  {Math.min(loadMoreCount, messages.length - displayedCount)}{" "}
                  more messages
                </p>
                <div className="text-xs text-muted-foreground">
                  Showing {displayedCount} of {messages.length} messages
                </div>
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {displayedMessages.map((message) => (
          <Message
            key={message.id}
            id={message.id}
            role={message.role}
            content={message.content}
            timestamp={message.timestamp}
            isStreaming={streamingMessageId === message.id}
          />
        ))}

        {/* Loading Message */}
        {isLoading && <LoadingMessage />}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-hidden bg-message-list-background">
      <div className="h-full p-6">
        <div className="max-w-4xl mx-auto h-full">
          <div ref={parentRef} className="h-full overflow-auto">
            {renderMessages()}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
