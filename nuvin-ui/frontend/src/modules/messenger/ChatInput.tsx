import {
  useState,
  type KeyboardEvent,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSendMessage?: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSendMessage,
  onStop,
  disabled = false,
  placeholder = 'Type your message here...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isMultiLine, setIsMultiLine] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage?.(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    onStop?.();
  };

  const autoResize = useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;

      // Reset height to auto to get the actual scroll height
      textarea.style.height = 'auto';

      // Calculate the new height based on scroll height
      const scrollHeight = textarea.scrollHeight;
      const minHeight = 58; // Increased min height for more padding
      const maxHeight = 200; // Increased max height proportionally

      // Ensure we stay within bounds
      const newHeight = Math.min(
        Math.max(scrollHeight + 2, minHeight),
        maxHeight,
      );

      // Set the calculated height
      textarea.style.height = `${newHeight}px`;

      // Determine if we're in multi-line mode (height greater than single line)
      setIsMultiLine(newHeight > minHeight);
    }
  }, []);

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    // Trigger resize after state update
    setTimeout(autoResize, 0);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: <Auto-resize when message changes>
  useEffect(() => {
    autoResize();
  }, [message]);

  // Auto-resize on component mount
  useEffect(() => {
    autoResize();
  }, [autoResize]);

  const isLoading = disabled; // Loading state when disabled

  return (
    <div className="border-t border-border p-6 bg-card">
      <div className="max-w-4xl mx-auto">
        <div className="relative group">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="resize-none focus-visible:ring-0 shadow-sm pr-16 py-4 px-4 bg-background border border-border hover:border-ring/50 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/20 rounded-lg transition-all duration-200 chat-input-textarea overflow-auto text-base placeholder:text-muted-foreground/60 focus:placeholder:text-muted-foreground/80"
            rows={1}
          />

          {/* Dynamic Button Position - centered for single line, bottom-aligned for multi-line */}
          <div
            className={`absolute right-4 transition-all duration-200 ${message.trim() || isLoading ? 'opacity-100' : 'opacity-0'} ${
              isMultiLine
                ? 'bottom-4' // Bottom alignment for multi-line
                : 'top-1/2 transform -translate-y-1/2' // Centered for single line
            }`}
          >
            {isLoading ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleStop}
                className="h-9 w-9 p-0 rounded-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-lg shadow-red-500/25 stop-button-animate transition-all duration-300 hover:scale-105"
              >
                <Square
                  className="h-3.5 w-3.5 text-white"
                  fill="currentColor"
                />
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!message.trim()}
                onClick={handleSend}
                className={`h-9 w-9 p-0 rounded-full transition-all duration-300 ${
                  message.trim()
                    ? 'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 send-button-ready hover:scale-105'
                    : 'bg-muted send-button-disabled opacity-0'
                }`}
              >
                <Send
                  className={`h-3.5 w-3.5 transition-transform duration-300 ${
                    message.trim()
                      ? 'scale-100 opacity-100 text-primary-foreground'
                      : 'scale-75 opacity-30'
                  }`}
                />
              </Button>
            )}
          </div>
        </div>

        <div className="flex justify-between text-xs text-muted-foreground/80 mt-3">
          <span className="flex items-center gap-2">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-primary to-primary/60 animate-pulse processing-dot"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-primary to-primary/60 animate-pulse processing-dot" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-primary to-primary/60 animate-pulse processing-dot" style={{animationDelay: '0.4s'}}></div>
                </div>
                <span className="font-medium">AI is thinking...</span>
              </span>
            ) : (
              <span className="font-medium">Press Shift + Enter for new line</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
