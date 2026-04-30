import type React from 'react';
import { useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { eventBus } from '@/services/EventBus.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { SessionInfo } from '@/types.js';
import { WindowedComboBox, type ComboBoxItem } from '@/components/ComboBox/index.js';

type HistorySelectionProps = {
  availableSessions: SessionInfo[];
  hasMore: boolean;
  isLoadingMore: boolean;
  isSearching: boolean;
  searchResultCount: number | null; // null = browse mode
  onLoadMore: () => void;
  onQueryChange: (query: string) => void;
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

const getDayGroup = (sessionId: string): string => {
  const date = new Date(parseInt(sessionId, 10));
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOf7DaysAgo = new Date(startOfToday.getTime() - 6 * 86400000);

  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  if (date >= startOf7DaysAgo) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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

const getSessionStatus = (lastMessage: string | undefined, messageCount: number) => {
  if (!lastMessage || messageCount <= 1) return '○';
  if (lastMessage.includes('Successfully') || lastMessage.includes('successfully')) return '✓';
  if (lastMessage.includes('error') || lastMessage.includes('Error')) return '✗';
  if (lastMessage.includes('try again')) return '⚠';
  return '●';
};

const SessionItem: React.FC<{ item: SessionInfo; isSelected: boolean }> = ({ item, isSelected }) => {
  const { theme } = useTheme();
  const time = formatRelativeTime(item.timestamp);
  const preview = item.topic || truncateText(item.lastMessage, 60);
  const status = getSessionStatus(item.lastMessage, item.messageCount);
  const color = isSelected ? theme.model?.selectedItem || theme.colors.accent : theme.model?.item || theme.colors.text;

  return (
    <Box overflow="hidden" flexShrink={0}>
      <Text>{isSelected ? '❯ ' : '  '}</Text>
      <Text color={theme.colors.muted}>{status} </Text>
      <Text color={color} bold={isSelected}>
        {time}
        {'  '}
      </Text>
      <Text color={color} dimColor={!isSelected}>
        {preview}
      </Text>
      <Text color={theme.colors.muted} dimColor>
        {' '}
        {item.messageCount}msg
      </Text>
    </Box>
  );
};

const LOAD_MORE_THRESHOLD = 5;

export const HistorySelection: React.FC<HistorySelectionProps> = ({
  availableSessions,
  hasMore,
  isLoadingMore,
  isSearching,
  searchResultCount,
  onLoadMore,
  onQueryChange,
}) => {

  const sessionMap = useMemo(
    () => new Map(availableSessions.map((s) => [s.sessionId, s])),
    [availableSessions],
  );

  const comboBoxItems = useMemo<ComboBoxItem[]>(
    () =>
      availableSessions.map((session) => ({
        label: session.topic || session.lastMessage || session.sessionId,
        value: session.sessionId,
        group: getDayGroup(session.sessionId),
      })),
    [availableSessions],
  );

  const handleHighlight = useCallback(
    (_item: ComboBoxItem | null, index: number) => {
      // Only trigger load-more in browse mode
      if (searchResultCount !== null) return;
      if (!hasMore || isLoadingMore) return;
      if (index >= comboBoxItems.length - LOAD_MORE_THRESHOLD) {
        onLoadMore();
      }
    },
    [hasMore, isLoadingMore, comboBoxItems.length, onLoadMore, searchResultCount],
  );

  const handleSelect = (item: ComboBoxItem) => {
    const session = sessionMap.get(item.value);
    if (session) {
      eventBus.emit('ui:history:selected', session);
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <WindowedComboBox
        items={comboBoxItems}
        showSearchInput={true}
        placeholder="Search all sessions..."
        showItemCount={false}
        enableRotation={false}
        showScrollIndicators={false}
        focus={true}
        fuzzySearch={false}
        onHighlight={handleHighlight}
        onQueryChange={onQueryChange}
        renderItem={(item, isSelected) => {
          const session = sessionMap.get(item.value);
          if (!session) return null;
          return <SessionItem item={session} isSelected={isSelected} />;
        }}
        onSelect={handleSelect}
      />
      <Box height={1} flexShrink={0}>
        {isSearching && <Text dimColor>  Searching all sessions...</Text>}
        {searchResultCount !== null && !isSearching && searchResultCount === 0 && (
          <Text dimColor>  No sessions matched</Text>
        )}
        {searchResultCount !== null && !isSearching && searchResultCount > 0 && (
          <Text dimColor>  {searchResultCount} sessions matched</Text>
        )}
        {searchResultCount === null && isLoadingMore && <Text dimColor> ↓ Loading more sessions...</Text>}
        {searchResultCount === null && !hasMore && !isLoadingMore && availableSessions.length > 0 && (
          <Text dimColor>  All sessions loaded ({availableSessions.length} total)</Text>
        )}
      </Box>
    </Box>
  );
};
