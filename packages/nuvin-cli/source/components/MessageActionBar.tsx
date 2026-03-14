import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '../contexts/InputContext/index.js';
import { useTheme } from '../contexts/ThemeContext.js';
import type { MessageLine } from '../adapters/index.js';

export type MessageAction = 'copy' | 'edit' | 'retry';

type MessageActionBarProps = {
  messageType: MessageLine['type'];
  onAction: (action: MessageAction) => Promise<boolean>;
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
  copy: '📋 Copy',
  edit: '✏️  Edit',
  retry: '🔄 Retry',
};

export const MessageActionBar: React.FC<MessageActionBarProps> = ({ messageType, onAction }) => {
  const { theme } = useTheme();
  const actions = getActionsForType(messageType);
  const [focusIndex, setFocusIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 1500);
    return () => clearTimeout(timer);
  }, [feedback]);

  useInput(
    (_input, key) => {
      if (key.leftArrow) {
        setFocusIndex((i) => Math.max(0, i - 1));
        return true;
      }
      if (key.rightArrow) {
        setFocusIndex((i) => Math.min(actions.length - 1, i + 1));
        return true;
      }
      if (key.return) {
        const action = actions[focusIndex];
        onAction(action).then((success) => {
          if (action === 'copy') {
            setFeedback(success ? 'Copied!' : 'Copy failed');
          }
        });
        return true;
      }
    },
    { isActive: !feedback, priority: 200 },
  );

  if (feedback) {
    return (
      <Box justifyContent="flex-end" width="100%">
        <Text color={theme.colors.success} bold>
          {feedback}
        </Text>
      </Box>
    );
  }

  return (
    <Box justifyContent="flex-end" width="100%">
      {actions.map((action, i) => {
        const isFocused = i === focusIndex;
        return (
          <Box key={action} marginLeft={i > 0 ? 1 : 0}>
            <Text
              bold={isFocused}
              underline={isFocused}
              color={isFocused ? theme.colors.accent : undefined}
              dimColor={!isFocused}
            >
              [{ACTION_LABELS[action]}]
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
