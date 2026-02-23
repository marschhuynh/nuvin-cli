import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import { eventBus } from '@/services/EventBus.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { SessionInfo } from '@/types.js';
import { WindowedComboBox, type ComboBoxItem } from '@/components/ComboBox/index.js';

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

const truncateText = (text: string | undefined, maxLength: number = 50): string => {
  if (!text) return 'No preview available';

  const cleaned = text.replace(/\s+/g, ' ').trim();

  if (cleaned.length <= maxLength) return cleaned;

  const words = cleaned.split(' ');
  let result = '';
  for (const word of words) {
    if (`${result} ${word}`.length > maxLength - 3) break;
    result += (result ? ' ' : '') + word;
  }

  return `${result}...`;
};

const getSessionStatus = (
  lastMessage: string | undefined,
  messageCount: number,
  theme: ReturnType<typeof useTheme>['theme'],
) => {
  if (!lastMessage) return { icon: '○', color: 'gray' };
  if (lastMessage.includes('Successfully') || lastMessage.includes('successfully')) {
    return { icon: '✓', color: theme.tokens.green };
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

const getMessageCountBadge = (count: number, theme: ReturnType<typeof useTheme>['theme']) => {
  if (count === 1) return { text: '1 msg', color: 'gray' };
  if (count < 10) return { text: `${count} msgs`, color: 'cyan' };
  if (count < 50) return { text: `${count} msgs`, color: theme.tokens.green };
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
  const preview = truncateText(displayText, cols - 5);
  const status = getSessionStatus(item.lastMessage, item.messageCount, theme);
  const badge = getMessageCountBadge(item.messageCount, theme);

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
          {preview}
        </Text>
      </Box>
    </Box>
  );
};

export const HistorySelection: React.FC<HistorySelectionProps> = ({ availableSessions }) => {
  const { cols } = useStdoutDimensions();

  const comboBoxItems = useMemo<ComboBoxItem[]>(
    () =>
      availableSessions.map((session) => ({
        label: session.topic || session.lastMessage || session.sessionId,
        value: session.sessionId,
      })),
    [availableSessions],
  );

  const handleSelect = (item: ComboBoxItem) => {
    const session = availableSessions.find((s) => s.sessionId === item.value);
    if (session) {
      eventBus.emit('ui:history:selected', session);
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <WindowedComboBox
        items={comboBoxItems}
        showSearchInput={true}
        placeholder="Search sessions..."
        showItemCount={false}
        enableRotation={true}
        focus={true}
        fuzzySearch={true}
        renderItem={(item, isSelected) => {
          const session = availableSessions.find((s) => s.sessionId === item.value);
          if (!session) return null;
          return <SessionItem cols={cols - 2} item={session} isSelected={isSelected} />;
        }}
        onSelect={handleSelect}
      />
    </Box>
  );
};
