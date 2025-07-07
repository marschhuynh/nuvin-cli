import { useState, KeyboardEvent, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSendMessage?: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function ChatInput({
  onSendMessage,
  onStop,
  disabled = false,
  placeholder = "Type your message here...",
  maxLength = 2000
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

  const autoResize = () => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;

      // Reset height to auto to get the actual scroll height
      textarea.style.height = 'auto';

      // Calculate the new height based on scroll height
      const scrollHeight = textarea.scrollHeight;
      const minHeight = 56; // Increased min height for more padding
      const maxHeight = 200; // Increased max height proportionally

      // Ensure we stay within bounds
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

      // Set the calculated height
      textarea.style.height = `${newHeight}px`;

      // Determine if we're in multi-line mode (height greater than single line)
      setIsMultiLine(newHeight > minHeight);
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    // Trigger resize after state update
    setTimeout(autoResize, 0);
  };

  // Auto-resize when message changes
  useEffect(() => {
    autoResize();
  }, [message]);

  // Auto-resize on component mount
  useEffect(() => {
    autoResize();
  }, []);

  const isLoading = disabled; // Loading state when disabled

  return (
    <div className="border-t border-border p-6 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            className="resize-none focus-visible:ring-2 focus-visible:ring-ring pr-16 py-4 px-4 bg-white border border-border shadow-sm transition-all duration-200 chat-input-textarea overflow-hidden text-base placeholder:text-gray-400/60 focus:placeholder:text-gray-300/50"
            rows={1}
            style={{
              minHeight: '56px',
              maxHeight: '200px',
              height: '56px' // Start with increased height
            }}
          />

          {/* Dynamic Button Position - centered for single line, bottom-aligned for multi-line */}
          <div className={`absolute right-4 transition-all duration-200 ${(message.trim() || isLoading) ? 'opacity-100' : 'opacity-0'} ${
            isMultiLine
              ? 'bottom-4' // Bottom alignment for multi-line
              : 'top-1/2 transform -translate-y-1/2' // Centered for single line
          }`}>
            {isLoading ? (
              // Stop button when loading/processing
              <Button
                size="sm"
                variant="ghost"
                onClick={handleStop}
                className="h-8 w-8 p-0 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 stop-button-animate transition-all duration-200"
              >
                <Square
                  className="h-3 w-3 text-red-600 dark:text-red-400"
                  fill="currentColor"
                />
              </Button>
            ) : (
              // Send button when ready to send
              <Button
                size="sm"
                disabled={!message.trim()}
                onClick={handleSend}
                className={`h-8 w-8 p-0 rounded-full transition-all duration-200 ${
                  message.trim()
                    ? 'bg-primary hover:bg-primary/90 send-button-ready'
                    : 'bg-muted send-button-disabled opacity-0'
                }`}
              >
                <Send
                  className={`h-3 w-3 transition-transform duration-200 ${
                    message.trim() ? 'scale-100 opacity-100' : 'scale-75 opacity-30'
                  }`}
                />
              </Button>
            )}
          </div>
        </div>

        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>
            {isLoading ? (
              <span className="flex items-center gap-1">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary processing-dot"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary processing-dot"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary processing-dot"></div>
                </div>
                <span className="ml-2">Processing...</span>
              </span>
            ) : (
              "Press Shift + Enter for new line"
            )}
          </span>
          <span className={message.length > maxLength * 0.9 ? 'text-orange-500' : ''}>
            {message.length}/{maxLength}
          </span>
        </div>
      </div>
    </div>
  );
}