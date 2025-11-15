import { useMemo, useRef, useEffect } from 'react';
import { markdownCache } from '@/utils/MarkdownCache.js';

interface StreamingOptions {
  debounceMs?: number;
  maxCacheAge?: number;
}

export const useStreamingMarkdown = (content: string, isStreaming: boolean, options: StreamingOptions = {}) => {
  const { debounceMs: _debounceMs = 100 } = options;
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastContentRef = useRef<string>('');

  useEffect(() => {
    if (!isStreaming) {
      markdownCache.clear();
    }
  }, [isStreaming]);

  const debouncedContent = useMemo(() => {
    if (!isStreaming) return content;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (
      lastContentRef.current &&
      content.startsWith(lastContentRef.current) &&
      content.length - lastContentRef.current.length < 50
    ) {
      return lastContentRef.current;
    }

    lastContentRef.current = content;
    return content;
  }, [content, isStreaming]);

  return debouncedContent;
};
