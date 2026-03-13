import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, type BoxRef } from 'ink';
import { useInput, useMouse } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { MessageLine } from '@/adapters/index.js';
import { AppModal } from './AppModal.js';
import type { MessageAction } from './MessageActionBar.js';
import { extractMessageContent } from '../utils/extractMessageContent.js';
import { copyTextToClipboard } from '../utils/copyText.js';
import { eventBus } from '../services/EventBus.js';

type MessageActionModalProps = {
  visible: boolean;
  message: MessageLine | null;
  onClose: () => void;
};

function getActionsForType(type: MessageLine['type']): MessageAction[] {
  switch (type) {
    case 'user':
      return ['copy', 'edit'];
    case 'assistant':
      return ['copy', 'retry'];
    default:
      return ['copy'];
  }
}

const ACTION_LABELS: Record<MessageAction, string> = {
  copy: 'Copy',
  edit: 'Edit',
  retry: 'Retry',
};

const ACTION_DESCRIPTIONS: Record<MessageAction, string> = {
  copy: 'Copy message to clipboard',
  edit: 'Edit and resend this message',
  retry: 'Regenerate response',
};

export const MessageActionModal: React.FC<MessageActionModalProps> = ({ visible, message, onClose }) => {
  const { originalTheme: theme } = useTheme();
  const actions = message ? getActionsForType(message.type) : [];
  const [focusIndex, setFocusIndex] = useState(0);
  const actionRefs = useRef<Map<number, BoxRef>>(new Map());

  const setActionRef = useCallback((index: number, el: BoxRef | null) => {
    if (el) {
      actionRefs.current.set(index, el);
    } else {
      actionRefs.current.delete(index);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setFocusIndex(0);
    }
  }, [visible]);

  const handleAction = useCallback(async (action: MessageAction) => {
    if (!message) return;
    if (action === 'copy') {
      const content = extractMessageContent(message);
      await copyTextToClipboard(content);
    } else if (action === 'edit') {
      eventBus.emit('ui:input:edit', { content: message.content });
    } else if (action === 'retry') {
      eventBus.emit('ui:input:retry', { content: '' });
    }
    onClose();
  }, [message, onClose]);

  useInput((_input, key) => {
    if (key.upArrow) {
      setFocusIndex((i) => Math.max(0, i - 1));
      return true;
    }
    if (key.downArrow) {
      setFocusIndex((i) => Math.min(actions.length - 1, i + 1));
      return true;
    }
    if (key.return) {
      const action = actions[focusIndex];
      if (action) {
        void handleAction(action);
      }
      return true;
    }
  }, { isActive: visible, priority: 200 });

  const findActionAtPosition = useCallback((x: number, y: number): number | null => {
    for (const [index, ref] of actionRefs.current) {
      const bounds = ref.getBounds();
      if (
        x >= bounds.x + 1 &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y + 1 &&
        y <= bounds.y + bounds.height
      ) {
        return index;
      }
    }
    return null;
  }, []);

  useMouse(
    (event) => {
      if (event.type === 'click' && event.button === 0) {
        const index = findActionAtPosition(event.x, event.y);
        if (index !== null) {
          setFocusIndex(index);
          const action = actions[index];
          if (action) {
            void handleAction(action);
          }
          return true;
        }
      }
      if (event.type === 'move') {
        const index = findActionAtPosition(event.x, event.y);
        if (index !== null) {
          setFocusIndex(index);
        }
        return true;
      }
    },
    { isActive: visible, priority: 150 },
  );

  if (!visible || !message) return null;

  return (
    <AppModal
      visible={visible}
      title="Actions"
      onClose={onClose}
      closeOnEscape
      backdrop
      paddingX={0}
      paddingY={0}
      marginX={0}
      marginY={0}
      containerProps={{ width: '50%' }}
    >
      <Box flexDirection="column">
        {actions.map((action, i) => {
          const isFocused = i === focusIndex;
          return (
            <Box key={action} padding={1} ref={(el: BoxRef | null) => setActionRef(i, el)} backgroundColor={isFocused ? "black" : "blackBright"}>
              <Text
                bold={isFocused}
                color={isFocused ? theme.colors.accent : undefined}
                dimColor={!isFocused}
              >
                {isFocused ? '▸ ' : '  '}{ACTION_LABELS[action]}
              </Text>
              <Text dimColor color={isFocused ? theme.colors.muted : undefined}> — {ACTION_DESCRIPTIONS[action]}</Text>
            </Box>
          );
        })}
      </Box>
    </AppModal>
  );
};
