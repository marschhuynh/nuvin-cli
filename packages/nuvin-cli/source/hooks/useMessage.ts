import { useCallback, useState } from 'react';
import * as crypto from 'node:crypto';
import type { LineMetadata, MessageLine } from '@/adapters';
import { MAX_RENDERED_LINES } from '@/const.js';

const useMessages = () => {
  const [messages, setMessages] = useState<MessageLine[]>([]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const setLines = useCallback((newLines: MessageLine[]) => {
    if (newLines.length > MAX_RENDERED_LINES) {
      setMessages(newLines.slice(-MAX_RENDERED_LINES));
    } else {
      setMessages([...newLines]);
    }
  }, []);

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
      const nextMetadata: Record<string, unknown> = { ...(updated[index].metadata ?? {}) };
      for (const [key, value] of Object.entries(metadata)) {
        if (value === undefined) {
          delete nextMetadata[key];
          continue;
        }
        nextMetadata[key] = value;
      }

      updated[index] = {
        ...updated[index],
        metadata: Object.keys(nextMetadata).length > 0 ? (nextMetadata as LineMetadata) : undefined,
      };
      return updated;
    });
  }, []);

  const deleteMessages = useCallback((idsToDelete: string[]) => {
    const idSet = new Set(idsToDelete);
    setMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));
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

  return { messages, clearMessages, setLines, appendLine, updateLine, updateLineMetadata, deleteMessages, handleError };
};

export default useMessages;
