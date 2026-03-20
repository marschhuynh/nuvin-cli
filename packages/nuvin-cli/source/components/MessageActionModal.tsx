import type React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, type BoxRef } from 'ink';
import { useInput, useMouse } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { MessageLine } from '@/adapters/index.js';
import { AppModal } from './AppModal.js';
import { extractMessageContent } from '../utils/extractMessageContent.js';

type MessageAction = 'copy' | 'edit' | 'retry' | 'delete';
import { copyTextToClipboard } from '../utils/copyText.js';
import { eventBus } from '../services/EventBus.js';

type MessageActionModalProps = {
  visible: boolean;
  message: MessageLine | null;
  onClose: () => void;
  busy?: boolean;
};

function getActionsForType(type: MessageLine['type'], busy: boolean): MessageAction[] {
  const canDelete = !busy;
  switch (type) {
    case 'user':
      return canDelete ? ['copy', 'edit', 'delete'] : ['copy', 'edit'];
    case 'assistant':
      return canDelete ? ['copy', 'retry', 'delete'] : ['copy', 'retry'];
    case 'tool':
      return canDelete ? ['copy', 'delete'] : ['copy'];
    default:
      return ['copy'];
  }
}

const ACTION_LABELS: Record<MessageAction, string> = {
  copy: 'Copy',
  edit: 'Edit',
  retry: 'Retry',
  delete: 'Delete',
};

const ACTION_DESCRIPTIONS: Record<MessageAction, string> = {
  copy: 'Copy message to clipboard',
  edit: 'Edit and resend this message',
  retry: 'Regenerate response',
  delete: 'Remove this message from history',
};

export const MessageActionModal: React.FC<MessageActionModalProps> = ({ visible, message, onClose, busy = false }) => {
  const { originalTheme: theme } = useTheme();
  const actions = message ? getActionsForType(message.type, busy) : [];
  const [focusIndex, setFocusIndex] = useState(0);
  const [phase, setPhase] = useState<'actions' | 'confirm'>('actions');
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
      setPhase('actions');
      actionRefs.current.clear();
    }
  }, [visible]);

  const handleAction = useCallback(async (action: MessageAction) => {
    if (!message) return;
    if (action === 'copy') {
      const content = extractMessageContent(message);
      await copyTextToClipboard(content);
      onClose();
    } else if (action === 'edit') {
      eventBus.emit('ui:input:edit', { content: message.content });
      onClose();
    } else if (action === 'retry') {
      eventBus.emit('ui:input:retry', { content: '' });
      onClose();
    } else if (action === 'delete') {
      setPhase('confirm');
      setFocusIndex(0);
    }
  }, [message, onClose]);

  const handleConfirmDelete = useCallback(() => {
    if (!message) return;
    eventBus.emit('ui:message:delete', { messageId: message.id });
    onClose();
  }, [message, onClose]);

  const handleCancelDelete = useCallback(() => {
    setPhase('actions');
    setFocusIndex(0);
  }, []);

  useInput((_input, key) => {
    if (phase === 'actions') {
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
    } else {
      // confirm phase: 0 = Cancel, 1 = Delete
      if (key.leftArrow || key.upArrow) {
        setFocusIndex(0);
        return true;
      }
      if (key.rightArrow || key.downArrow) {
        setFocusIndex(1);
        return true;
      }
      if (key.return) {
        if (focusIndex === 0) handleCancelDelete();
        else handleConfirmDelete();
        return true;
      }
      if (key.escape) {
        handleCancelDelete();
        return true;
      }
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
          if (phase === 'actions') {
            const action = actions[index];
            if (action) {
              void handleAction(action);
            }
          } else {
            if (index === 0) handleCancelDelete();
            else handleConfirmDelete();
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
      closeOnEscape={phase === 'actions'}
      backdrop
      paddingX={0}
      paddingY={0}
      marginX={0}
      marginY={0}
      containerProps={{ width: '50%' }}
    >
      <Box flexDirection="column">
        {phase === 'actions' ? (
          actions.map((action, i) => {
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
          })
        ) : (
          <>
            <Box padding={1}>
              <Text>Delete this message? This cannot be undone.</Text>
            </Box>
            {[{ label: 'Cancel', index: 0 }, { label: 'Confirm Delete', index: 1 }].map(({ label, index }) => {
              const isFocused = index === focusIndex;
              const isDestructive = index === 1;
              return (
                <Box
                  key={label}
                  padding={1}
                  ref={(el: BoxRef | null) => setActionRef(index, el)}
                  backgroundColor={isFocused ? 'black' : 'blackBright'}
                >
                  <Text
                    bold={isFocused}
                    color={isFocused ? (isDestructive ? 'red' : theme.colors.accent) : undefined}
                    dimColor={!isFocused}
                  >
                    {isFocused ? '▸ ' : '  '}{label}
                  </Text>
                </Box>
              );
            })}
          </>
        )}
      </Box>
    </AppModal>
  );
};

