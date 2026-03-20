import type React from 'react';
import { useRef, useMemo, useState, useCallback, useEffect, type ReactNode } from 'react';
import { Box } from 'ink';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import type { SessionInfo } from '@/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useAltMode } from '@/contexts/AltModeContext.js';
import { useInput, useMouse } from '@/contexts/InputContext/index.js';
import { eventBus } from '@/services/EventBus.js';
import { MessageLine } from '../MessageLine.js';
import { WelcomeLogo } from '../RecentSessions.js';
import { MessageActionModal } from '../MessageActionModal.js';
import { mergeToolCallsWithResultsCached, type MergeCache } from '../ChatDisplay.js';
import { VirtualizedList } from '../VirtualizedList.js';

type HeaderItem = { type: 'header'; key: string };
type MessageItem = { type: 'message'; message: MessageLineType };
type ListItem = HeaderItem | MessageItem;

const EMPTY_SESSIONS: SessionInfo[] = [];

export type FlexLayoutProps = {
  width: number;
  height: number;
  bottom?: ReactNode;
  chatRef?: React.RefObject<unknown>;
  messages?: MessageLineType[];
  sessions?: SessionInfo[] | null;
  headerKey?: number;
  busy?: boolean;
};

export function FlexLayout({
  width,
  height,
  bottom,
  messages = [],
  sessions,
  headerKey = 0,
  busy = false,
}: FlexLayoutProps): React.ReactElement {
  const { theme } = useTheme();
  const { altMode } = useAltMode();
  const mergeCacheRef = useRef<MergeCache>(new Map());
  const mergedMessages = useMemo(() => mergeToolCallsWithResultsCached(messages, mergeCacheRef.current), [messages]);

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const selectedMessage = useMemo(() => {
    if (!selectedMessageId) return null;
    return mergedMessages.find((m) => m.id === selectedMessageId) ?? null;
  }, [selectedMessageId, mergedMessages]);

  const handleItemClick = useCallback((item: ListItem, _index: number) => {
    if (item.type === 'message') {
      setSelectedMessageId((prev) => prev === item.message.id ? null : item.message.id);
    }
  }, []);

  const handleEmptyClick = useCallback(() => {
    setSelectedMessageId(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedMessageId(null);
  }, []);

  useInput((_input, key) => {
    if (key.escape) {
      setSelectedMessageId(null);
      return true;
    }
  }, { isActive: selectedMessageId !== null });

  // Dismiss modal on any click when it's open in alt mode
  useMouse(
    (event) => {
      if (event.type === 'click' && event.button === 0) {
        setSelectedMessageId(null);
        return true;
      }
    },
    { isActive: altMode && selectedMessageId !== null, priority: 100 },
  );

  // Clear selection when edit/retry actions fire
  useEffect(() => {
    const clearSelection = () => {
      setSelectedMessageId(null);
    };
    eventBus.on('ui:input:edit', clearSelection);
    eventBus.on('ui:input:retry', clearSelection);
    return () => {
      eventBus.off('ui:input:edit', clearSelection);
      eventBus.off('ui:input:retry', clearSelection);
    };
  }, []);

  // Combine header and messages into a single items array
  const listItems: ListItem[] = useMemo(() => {
    const header: HeaderItem = { type: 'header', key: `welcome-${headerKey}` };
    const messageItems: MessageItem[] = mergedMessages.map((message) => ({
      type: 'message' as const,
      message,
    }));
    return [header, ...messageItems];
  }, [headerKey, mergedMessages]);

  const renderItem = useCallback((item: ListItem, _index: number): ReactNode => {
    if (item.type === 'header') {
      return <WelcomeLogo recentSessions={sessions ?? EMPTY_SESSIONS} />;
    }
    return (
      <MessageLine
        key={item.message.id}
        message={item.message}
        isSelected={selectedMessageId === item.message.id}
      />
    );
  }, [selectedMessageId, sessions]);

  const keyExtractor = (item: ListItem): string => {
    if (item.type === 'header') {
      return item.key;
    }
    return item.message.id;
  };

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1} backgroundColor={theme.colors.background} position="relative">
      <Box flexGrow={1} flexShrink={1}>
        <VirtualizedList
          items={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          overscan={1}
          mousePriority={10}
          flexGrow={1}
          flexShrink={1}
          onItemClick={handleItemClick}
          onEmptyClick={handleEmptyClick}
          selectedItemKey={selectedMessageId}
        />
      </Box>
      {bottom && (
        <Box flexDirection="column" flexShrink={0}>
          {bottom}
        </Box>
      )}
      {altMode && (
        <Box position="absolute" top={0} left={0} width="100%" height="100%" zIndex={30}>
          <MessageActionModal
            visible={selectedMessageId !== null}
            message={selectedMessage}
            onClose={handleCloseModal}
            busy={busy}
          />
        </Box>
      )}
    </Box>
  );
}
