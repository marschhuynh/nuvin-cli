import { useState, useRef, useEffect } from 'react';
import { markdownCache } from '@/utils/markdownCache.js';

interface StreamingOptions {
  debounceMs?: number;
}

export const useStreamingMarkdown = (content: string, isStreaming: boolean, options: StreamingOptions = {}) => {
  const { debounceMs = 100 } = options;
  const [debouncedContent, setDebouncedContent] = useState(content);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (!isStreaming) {
      markdownCache.clear();
      setDebouncedContent(content);
      return;
    }

    if (debouncedContent && content.startsWith(debouncedContent) && content.length - debouncedContent.length < 50) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedContent(content);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [content, isStreaming, debounceMs, debouncedContent]);

  return debouncedContent;
};
