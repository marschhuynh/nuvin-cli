import type React from 'react';
import { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { eventBus } from '@/services/EventBus.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { SessionInfo } from '@/types.js';
import SelectInput from './SelectInput/index.js';

type HistorySelectionProps = {
  availableSessions: SessionInfo[];
};

const formatRelativeTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 5) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return diffInHours < 6 ? `${diffInHours}h ago` : `Today ${timeStr}`;
  }
  if (diffInDays === 1) {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `Yesterday ${timeStr}`;
  }
  if (diffInDays < 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dayName} ${timeStr}`;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const getSmartPreview = (message: string | undefined, maxLength: number = 50): string => {
  if (!message) return 'No preview available';

  const cleaned = message.replace(/\s+/g, ' ').trim();

  if (cleaned.includes('successfully')) return '✓ Task completed';
  if (cleaned.includes('error') || cleaned.includes('Error')) return '✗ Error occurred';
  if (cleaned.includes('No message preview available')) return 'Empty session';

  if (cleaned.length <= maxLength) return cleaned;

  const words = cleaned.split(' ');
  let result = '';
  for (const word of words) {
    if (`${result} ${word}`.length > maxLength - 3) break;
    result += (result ? ' ' : '') + word;
  }

  return result + (result.length < maxLength ? '...' : '');
};

const getSessionStatus = (lastMessage: string | undefined, messageCount: number) => {
  if (!lastMessage) return { icon: '○', color: 'gray' };
  if (lastMessage.includes('Successfully') || lastMessage.includes('successfully')) {
    return { icon: '✓', color: 'green' };
  }
  if (lastMessage.includes('error') || lastMessage.includes('Error')) {
    return { icon: '✗', color: 'red' };
  }
  if (lastMessage.includes('try again')) {
    return { icon: '⚠', color: 'yellow' };
  }
  if (messageCount === 1) {
    return { icon: '○', color: 'gray' };
  }
  return { icon: '●', color: 'blue' };
};

const getMessageCountBadge = (count: number) => {
  if (count === 1) return { text: '1 msg', color: 'gray' };
  if (count < 10) return { text: `${count} msgs`, color: 'cyan' };
  if (count < 50) return { text: `${count} msgs`, color: 'green' };
  return { text: `${count} msgs`, color: 'magenta' };
};

const SessionItem: React.FC<{ item: SessionInfo; isSelected: boolean; cols: number }> = ({
  item,
  isSelected,
  cols = 60,
}) => {
  const { theme } = useTheme();
  const relativeTime = formatRelativeTime(item.timestamp);
  const displayText = item.topic || item.lastMessage;
  const smartPreview = getSmartPreview(displayText, cols - 5);
  const status = getSessionStatus(item.lastMessage, item.messageCount);
  const badge = getMessageCountBadge(item.messageCount);

  const textColor = isSelected ? theme.history.selected : theme.history.unselected;
  const dimmed = !isSelected;

  return (
    <Box flexDirection="column" height={3} paddingX={0} paddingY={0}>
      <Box justifyContent="space-between" height={1}>
        <Box>
          <Text color={status.color} bold>
            {status.icon}
          </Text>
          <Text> </Text>
          <Text color={textColor} bold={isSelected} dimColor={dimmed}>
            {relativeTime}
            {' - '}
          </Text>
          <Text color={theme.history.badge} dimColor={dimmed}>
            {badge.text}
          </Text>
        </Box>
      </Box>

      <Box height={1} width={cols - 2}>
        <Text color={textColor} dimColor={dimmed}>
          {smartPreview}
        </Text>
      </Box>
    </Box>
  );
};

const VISIBLE_ITEMS = 7;

export const HistorySelection: React.FC<HistorySelectionProps> = ({ availableSessions }) => {
  const { theme } = useTheme();
  const [cols, _rows] = useStdoutDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const lastSelectedRef = useRef<string | null>(null);

  useInput(
    (_input, key) => {
      if (key.escape) {
      }
    },
    { isActive: true },
  );

  return (
    <Box marginLeft={2} marginTop={1} flexDirection="column">
      <Box marginBottom={1} justifyContent="space-between">
        <Box>
          <Text color={theme.history.title} bold>
            Session History{' '}
          </Text>
          <Text color={theme.history.help} dimColor>
            (↑↓ navigate • Enter select • ESC cancel)
          </Text>
        </Box>
        {availableSessions.length > VISIBLE_ITEMS && (
          <Text color={theme.history.keybind} dimColor>
            <Text>{String(selectedIndex + 1)}</Text> of <Text>{String(availableSessions.length)}</Text>
          </Text>
        )}
      </Box>

      {availableSessions.length === 0 ? (
        <Box flexDirection="column" paddingX={1}>
          <Text color={theme.history.help} dimColor>
            No previous sessions found.
          </Text>
          <Text color={theme.history.help} dimColor>
            Start chatting to create your first session!
          </Text>
        </Box>
      ) : (
        <SelectInput<SessionInfo>
          limit={VISIBLE_ITEMS}
          items={availableSessions.map((session, _index) => ({
            key: session.sessionId,
            label: session.sessionId,
            value: session,
          }))}
          itemComponent={(props: { isSelected?: boolean; label: string; value: SessionInfo }) => {
            const sessionId = props.value.sessionId;

            if (props.isSelected && lastSelectedRef.current !== sessionId) {
              const itemIndex = availableSessions.findIndex((s) => s.sessionId === sessionId);
              if (itemIndex !== -1) {
                lastSelectedRef.current = sessionId;
                setTimeout(() => setSelectedIndex(itemIndex), 0);
              }
            }
            return (
              <SessionItem cols={cols - 2} item={props.value} isSelected={!!props.isSelected} />
            );
          }}
          onSelect={(item) => eventBus.emit('ui:history:selected', item.value)}
        />
      )}
    </Box>
  );
};
