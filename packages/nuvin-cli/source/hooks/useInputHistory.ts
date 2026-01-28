import { useState, useEffect, useCallback, useRef } from 'react';
import type { MemoryPort, Message } from '@nuvin/nuvin-core';
import { useNotification } from '@/hooks/useNotification.js';
import { scanAvailableSessions } from '@/hooks/useSessionManagement.js';
import { ConfigManager } from '@/config/manager.js';

type LineInfo = {
  lineIndex: number;
  lines: string[];
};

type UseInputHistoryOptions = {
  memory?: MemoryPort<Message> | null;
  conversationId?: string;
  currentInput: string;
  onRecall: (message: string) => void;
};

export const useInputHistory = ({
  memory,
  conversationId = 'default',
  currentInput,
  onRecall,
}: UseInputHistoryOptions) => {
  const { setNotification } = useNotification();
  const [messages, setMessages] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);

  const historyPrevArmedRef = useRef(false);
  const historyNextArmedRef = useRef(false);
  const lastUpArrowTimeRef = useRef(0);
  const lastDownArrowTimeRef = useRef(0);

  // Use refs to avoid recreating callbacks when these values change
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const indexRef = useRef(index);
  indexRef.current = index;

  const currentInputRef = useRef(currentInput);
  currentInputRef.current = currentInput;

  useEffect(() => {
    const loadHistory = async () => {
      const configManager = ConfigManager.getInstance();
      const currentProfile = configManager.getCurrentProfile();

      let lastSessionMessage: string | null = null;
      try {
        const sessions = await scanAvailableSessions(1, currentProfile);
        lastSessionMessage = sessions?.[0]?.lastMessage ?? null;
      } catch {
        lastSessionMessage = null;
      }

      if (!memory) {
        if (lastSessionMessage) {
          setMessages([lastSessionMessage]);
        }
        return;
      }

      try {
        const memMessages = await memory.get(conversationId);
        const userMessages = memMessages
          .filter((msg) => msg.role === 'user')
          .map((msg) => {
            if (typeof msg.content === 'string') return msg.content;
            if (msg.content && typeof msg.content === 'object' && 'parts' in msg.content) {
              return msg.content.parts
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('\n');
            }
            return '';
          })
          .filter((text) => text.trim() !== '');

        const history = lastSessionMessage ? [lastSessionMessage, ...userMessages] : userMessages;
        setMessages(history);
      } catch {
        if (lastSessionMessage) {
          setMessages([lastSessionMessage]);
        }
      }
    };

    loadHistory();
  }, [memory, conversationId]);

  const navigatePrev = useCallback((): string | null => {
    const currentMessages = messagesRef.current;
    const currentIndex = indexRef.current;

    if (currentMessages.length === 0 || currentIndex === 0) {
      return null;
    }

    const newIndex = currentIndex === -1 ? currentMessages.length - 1 : currentIndex - 1;
    setIndex(newIndex);

    const message = currentMessages[newIndex];
    return message ?? null;
  }, []);

  const navigateNext = useCallback((): string | null => {
    const currentMessages = messagesRef.current;
    const currentIndex = indexRef.current;

    if (currentIndex === -1) {
      return null;
    }

    if (currentIndex < currentMessages.length - 1) {
      const newIndex = currentIndex + 1;
      setIndex(newIndex);
      const message = currentMessages[newIndex];
      return message ?? null;
    }

    setIndex(-1);
    return '';
  }, []);

  const handleHistoryPrev = useCallback(() => {
    const message = navigatePrev();
    if (message !== null) {
      onRecall(message);
    }
  }, [navigatePrev, onRecall]);

  const handleHistoryNext = useCallback(() => {
    const message = navigateNext();
    if (message !== null) {
      onRecall(message);
    }
  }, [navigateNext, onRecall]);

  const handleUpArrow = useCallback(
    (lineInfo: LineInfo) => {
      const now = Date.now();
      const timeSinceLastUp = now - lastUpArrowTimeRef.current;
      lastUpArrowTimeRef.current = now;

      if (lineInfo.lineIndex !== 0) {
        historyPrevArmedRef.current = false;
        return;
      }

      const isMultiline = lineInfo.lines.length > 1;
      const input = currentInputRef.current;

      if (!isMultiline || input.trim() === '') {
        handleHistoryPrev();
      } else if (historyPrevArmedRef.current) {
        // Require a distinct keypress (~100ms gap indicates key release+press)
        // Key repeat is typically ~30-50ms, so 100ms gap means user released and pressed again
        if (timeSinceLastUp > 100) {
          historyPrevArmedRef.current = false;
          handleHistoryPrev();
        }
        // If holding key (rapid repeat), ignore and keep armed
      } else {
        historyPrevArmedRef.current = true;
        setNotification('Press ↑ again to navigate history', 1500);
        setTimeout(() => {
          historyPrevArmedRef.current = false;
        }, 1500);
      }
    },
    [handleHistoryPrev, setNotification],
  );

  const handleDownArrow = useCallback(
    (lineInfo: LineInfo) => {
      const now = Date.now();
      const timeSinceLastDown = now - lastDownArrowTimeRef.current;
      lastDownArrowTimeRef.current = now;

      if (lineInfo.lineIndex !== lineInfo.lines.length - 1) {
        historyNextArmedRef.current = false;
        return;
      }

      const isMultiline = lineInfo.lines.length > 1;
      const input = currentInputRef.current;

      if (!isMultiline || input.trim() === '') {
        handleHistoryNext();
      } else if (historyNextArmedRef.current) {
        // Require a distinct keypress (~100ms gap indicates key release+press)
        // Key repeat is typically ~30-50ms, so 100ms gap means user released and pressed again
        if (timeSinceLastDown > 100) {
          historyNextArmedRef.current = false;
          handleHistoryNext();
        }
        // If holding key (rapid repeat), ignore and keep armed
      } else {
        historyNextArmedRef.current = true;
        setNotification('Press ↓ again to navigate history', 1500);
        setTimeout(() => {
          historyNextArmedRef.current = false;
        }, 1500);
      }
    },
    [handleHistoryNext, setNotification],
  );

  const addMessage = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setMessages((prev) => {
      if (prev[prev.length - 1] === trimmed) return prev;
      return [...prev, trimmed];
    });
    setIndex(-1);
  }, []);

  return {
    handleUpArrow,
    handleDownArrow,
    addMessage,
  };
};
