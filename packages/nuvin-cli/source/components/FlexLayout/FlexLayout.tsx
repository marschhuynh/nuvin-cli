import type React from 'react';
import { useRef, useMemo, type ReactNode } from 'react';
import { Box, type BoxRef } from 'ink';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import type { SessionInfo } from '@/types.js';
import { theme } from '@/theme.js';
import { MessageLine } from '../MessageLine.js';
import { WelcomeLogo } from '../RecentSessions.js';
import { mergeToolCallsWithResultsCached, type MergeCache } from '../ChatDisplay.js';
import { VirtualizedList } from '../VirtualizedList.js';
import { useMeasureHeight } from '@/hooks/useHeight.js';

type HeaderItem = { type: 'header'; key: string };
type MessageItem = { type: 'message'; message: MessageLineType };
type ListItem = HeaderItem | MessageItem;

export type FlexLayoutProps = {
  width: number;
  height: number;
  bottom?: ReactNode;
  chatRef?: React.RefObject<unknown>;
  messages?: MessageLineType[];
  sessions?: SessionInfo[] | null;
  headerKey?: number;
};

export function FlexLayout({
  width,
  height,
  bottom,
  messages = [],
  sessions,
  headerKey = 0,
}: FlexLayoutProps): React.ReactElement {
  const bottomRef = useRef<BoxRef>(null);
  const { height: bottomHeight } = useMeasureHeight(bottomRef);
  const mergeCacheRef = useRef<MergeCache>(new Map());
  const mergedMessages = useMemo(() => mergeToolCallsWithResultsCached(messages, mergeCacheRef.current), [messages]);

  // Combine header and messages into a single items array
  const listItems: ListItem[] = useMemo(() => {
    const header: HeaderItem = { type: 'header', key: `welcome-${headerKey}` };
    const messageItems: MessageItem[] = mergedMessages.map((message) => ({
      type: 'message' as const,
      message,
    }));
    return [header, ...messageItems];
  }, [headerKey, mergedMessages]);

  const renderItem = (item: ListItem): ReactNode => {
    if (item.type === 'header') {
      return <WelcomeLogo recentSessions={sessions ?? []} />;
    }
    return <MessageLine key={item.message.id} message={item.message} />;
  };

  const keyExtractor = (item: ListItem): string => {
    if (item.type === 'header') {
      return item.key;
    }
    return item.message.id;
  };

  const listHeight = height - bottomHeight;

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1} backgroundColor={theme.colors.background}>
      <Box flexDirection="column" height={listHeight > 0 ? listHeight : undefined} overflow="hidden" flexGrow={1}>
        <VirtualizedList
          items={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          overscan={1}
          mousePriority={10}
          height={listHeight > 0 ? listHeight : undefined}
        />
      </Box>
      {bottom && (
        <Box ref={bottomRef} flexDirection="column" flexShrink={0}>
          {bottom}
        </Box>
      )}
    </Box>
  );
}
