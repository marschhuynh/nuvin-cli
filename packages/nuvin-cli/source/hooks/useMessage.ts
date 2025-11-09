import { useCallback, useState } from 'react';
import * as crypto from 'node:crypto';
import type { MessageLine } from '@/adapters';
import { MAX_RENDERED_LINES } from '@/const.js';

const useMessages = () => {
  const [messages, setMessages] = useState<MessageLine[]>([]);

  const clearMessages = () => {
    setMessages([]);
  };

  const appendLine = useCallback((line: MessageLine) => {
    setMessages((prev) => {
      if (prev.length + 1 > MAX_RENDERED_LINES) {
        return [...prev.slice(-(MAX_RENDERED_LINES - 1)), line];
      }
      return [...prev, line];
    });
  }, []);

  const updateLine = useCallback((id: string, content: string) => {
    setMessages((prev) => {
      const index = prev.findIndex((msg) => msg.id === id);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = { ...updated[index], content };
      return updated;
    });
  }, []);

  const updateLineMetadata = useCallback((id: string, metadata: Partial<LineMetadata>) => {
    setMessages((prev) => {
      const index = prev.findIndex((msg) => msg.id === id);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        metadata: { ...updated[index].metadata, ...metadata },
      };
      return updated;
    });
  }, []);

  const handleError = useCallback(
    (message: string) => {
      appendLine({
        id: crypto.randomUUID(),
        type: 'error',
        content: `error: ${message}`,
        metadata: { timestamp: new Date().toISOString() },
        color: 'red',
      });
    },
    [appendLine],
  );

  const setLines = (newLines: MessageLine[]) => {
    if (newLines.length > MAX_RENDERED_LINES) {
      setMessages(newLines.slice(-MAX_RENDERED_LINES));
    } else {
      setMessages([...newLines]);
    }
  };

  return { messages, clearMessages, setLines, appendLine, updateLine, updateLineMetadata, handleError };
};

export default useMessages;
