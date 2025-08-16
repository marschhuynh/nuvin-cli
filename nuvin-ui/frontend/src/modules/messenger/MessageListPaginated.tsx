import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
} from 'react';
import type { Message as MessageType } from '@/types';
import { Message } from './Message';
import { LoadingMessage } from './components/LoadingMessage';
import { Loader2 } from 'lucide-react';
import { EmptyConversation } from './components/EmptyConversation';

interface MessageListPaginatedProps {
  messages: MessageType[];
  isLoading?: boolean;
  streamingMessageId?: string | null;
  initialLoadCount?: number;
  loadMoreCount?: number;
  conversationId?: string;
}

export function MessageListPaginated({
  messages,
  isLoading = false,
  streamingMessageId,
  initialLoadCount = 15,
  loadMoreCount = 15,
  conversationId,
}: MessageListPaginatedProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [displayedCount, setDisplayedCount] = useState(initialLoadCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastScrollTop = useRef(10);

  // Get the messages to display (from the end, newest first)
  const displayedMessages = messages.slice(-displayedCount);
  const hasMoreMessages = messages.length > displayedCount;

  const scrollToBottom = useCallback((smooth = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'start',
      });
    }
  }, []);

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
      Math.min(prev + loadMoreCount, messages.length),
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

  // Check if content height is less than container height and load more if needed
  const checkAndLoadMoreIfNeeded = useCallback(() => {
    if (isLoadingMore || !hasMoreMessages) return;

    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    // Check if content is shorter than the container (no scrollbar needed)
    const containerHeight = scrollElement.clientHeight;
    const contentHeight = scrollElement.scrollHeight;

    if (contentHeight <= containerHeight) {
      // Content doesn't fill the container, load more messages
      loadMoreMessages();
    }
  }, [isLoadingMore, hasMoreMessages, loadMoreMessages]);

  // Handle scroll to detect when user scrolls up and reaches the top
  const handleScroll = useCallback(() => {
    if (!parentRef.current || isLoadingMore || !hasMoreMessages) return;

    const { scrollTop } = parentRef.current;
    const isScrollingUp = scrollTop < lastScrollTop.current;

    // Only load more messages if user is scrolling UP and near the top
    if (isScrollingUp && scrollTop <= 200) {
      loadMoreMessages();
    }

    // Update last scroll position after checking
    lastScrollTop.current = scrollTop;
  }, [isLoadingMore, hasMoreMessages, loadMoreMessages]);

  // Attach scroll listener
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useLayoutEffect(() => {
    // Initial scroll to bottom or new message is user message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      setTimeout(() => {
        scrollToBottom(true);
      }, 100); // Delay to ensure DOM updates
    }
  }, [messages, scrollToBottom]);

  useLayoutEffect(() => {
    if (conversationId) {
      setTimeout(() => {
        scrollToBottom(true);
      }, 100); // Delay to ensure DOM updates
    }
  }, [scrollToBottom, conversationId]);

  // Reset displayed count when messages change significantly
  useLayoutEffect(() => {
    if (messages.length < displayedCount) {
      setDisplayedCount(Math.max(initialLoadCount, messages.length));
    }
  }, [messages.length, displayedCount, initialLoadCount]);

  // Check if we need to load more messages after displaying initial messages
  useLayoutEffect(() => {
    // Use a small delay to ensure DOM has updated
    const timeoutId = setTimeout(() => {
      checkAndLoadMoreIfNeeded();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [checkAndLoadMoreIfNeeded]);

  // Also check after loading completes
  useEffect(() => {
    if (!isLoadingMore) {
      // Use a small delay to ensure DOM has updated after loading
      const timeoutId = setTimeout(() => {
        checkAndLoadMoreIfNeeded();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [isLoadingMore, checkAndLoadMoreIfNeeded]);

  // Check when window is resized or container size changes
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const resizeObserver = new ResizeObserver(() => {
      // Use a small delay to ensure measurements are accurate
      setTimeout(() => {
        checkAndLoadMoreIfNeeded();
      }, 100);
    });

    resizeObserver.observe(scrollElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [checkAndLoadMoreIfNeeded]);

  const renderMessages = () => {
    if (messages.length === 0 && !isLoading) {
      return <EmptyConversation />;
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
              <div className="text-center space-y-2">
                <button
                  type="button"
                  onClick={() => loadMoreMessages()}
                  className="px-4 py-2 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={isLoadingMore}
                >
                  Load{' '}
                  {Math.min(loadMoreCount, messages.length - displayedCount)}{' '}
                  more messages
                </button>
                <div className="text-xs text-muted-foreground">
                  Showing {displayedCount} of {messages.length} messages
                </div>
                <p className="text-xs text-muted-foreground">
                  Or scroll up to load more automatically
                </p>
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
            metadata={message.metadata}
            toolCall={message.toolCall}
          />
        ))}

        {/* Loading Message */}
        {isLoading && <LoadingMessage />}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-hidden bg-message-list-background">
      <div ref={parentRef} className="h-full overflow-auto">
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            {renderMessages()}
            <div ref={messagesEndRef} className="h-2 w-2 mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
