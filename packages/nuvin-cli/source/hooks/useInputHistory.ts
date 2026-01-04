import { useState, useEffect, useCallback, useRef } from 'react';
import type { MemoryPort, Message } from '@nuvin/nuvin-core';
import { logger } from '@/utils/file-logger.js';
import { useNotification } from '@/hooks/useNotification.js';
import { scanAvailableSessions } from '@/hooks/useSessionManagement.js';
import { ConfigManager } from '@/config/manager.js';

type LineInfo = {
  lineIndex: number;
  lines: string[];
};

type UseInputHistoryOptions = {
  memory?: MemoryPort<Message> | null;
  currentInput: string;
  onRecall: (message: string) => void;
};

export const useInputHistory = ({ memory, currentInput, onRecall }: UseInputHistoryOptions) => {
  const { setNotification } = useNotification();
  const [messages, setMessages] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);

  const historyPrevArmedRef = useRef(false);
  const historyNextArmedRef = useRef(false);
  
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
        const memMessages = await memory.get('cli');
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
        logger.debug('Loaded history', { count: history.length });
      } catch {
        if (lastSessionMessage) {
          setMessages([lastSessionMessage]);
        }
      }
    };

    loadHistory();
  }, [memory]);

  const navigatePrev = useCallback((): string | null => {
    const currentMessages = messagesRef.current;
    const currentIndex = indexRef.current;
    logger.debug('navigatePrev', { messages: currentMessages, currentIndex });

    if (currentMessages.length === 0 || currentIndex === 0) {
      logger.debug('navigatePrev: early return');
      return null;
    }

    const newIndex = currentIndex === -1 ? currentMessages.length - 1 : currentIndex - 1;
    setIndex(newIndex);

    const message = currentMessages[newIndex];
    logger.debug('navigatePrev: recalling', { newIndex, message });
    return message ?? null;
  }, []);

  const navigateNext = useCallback((): string | null => {
    const currentMessages = messagesRef.current;
    const currentIndex = indexRef.current;
    logger.debug('navigateNext', { messages: currentMessages, currentIndex });

    if (currentIndex === -1) {
      logger.debug('navigateNext: early return');
      return null;
    }

    if (currentIndex < currentMessages.length - 1) {
      const newIndex = currentIndex + 1;
      setIndex(newIndex);
      const message = currentMessages[newIndex];
      logger.debug('navigateNext: recalling', { newIndex, message });
      return message ?? null;
    }

    setIndex(-1);
    logger.debug('navigateNext: reset to empty');
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
      if (lineInfo.lineIndex !== 0) {
        return;
      }

      const isMultiline = lineInfo.lines.length > 1;
      const input = currentInputRef.current;

      if (!isMultiline || input.trim() === '') {
        handleHistoryPrev();
      } else if (historyPrevArmedRef.current) {
        historyPrevArmedRef.current = false;
        handleHistoryPrev();
      } else {
        historyPrevArmedRef.current = true;
        setNotification('Press ↑ again to navigate history', 1000);
        setTimeout(() => {
          historyPrevArmedRef.current = false;
        }, 1000);
      }
    },
    [handleHistoryPrev, setNotification],
  );

  const handleDownArrow = useCallback(
    (lineInfo: LineInfo) => {
      if (lineInfo.lineIndex !== lineInfo.lines.length - 1) {
        return;
      }

      const isMultiline = lineInfo.lines.length > 1;
      const input = currentInputRef.current;

      if (!isMultiline || input.trim() === '') {
        handleHistoryNext();
      } else if (historyNextArmedRef.current) {
        historyNextArmedRef.current = false;
        handleHistoryNext();
      } else {
        historyNextArmedRef.current = true;
        setNotification('Press ↓ again to navigate history', 1000);
        setTimeout(() => {
          historyNextArmedRef.current = false;
        }, 1000);
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
