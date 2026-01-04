import React, { useMemo, useRef } from 'react';
import { Box, Static } from 'ink';
import type { SessionInfo } from '@/types.js';
import { calculateStaticCount } from '@/utils/staticCount.js';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import { MessageLine } from './MessageLine.js';
import { WelcomeLogo } from './RecentSessions.js';

type ChatDisplayProps = {
  key: string;
  messages: MessageLineType[];
  selectedIndex?: number | null;
  expandedIds?: Set<string>;
  headerKey?: number;
  sessions?: SessionInfo[] | null;
};

export type MergeCacheEntry = {
  inputRef: MessageLineType;
  resultIds: string[];
  output: MessageLineType;
};

export type MergeCache = Map<string, MergeCacheEntry>;

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function mergeToolCallsWithResultsCached(messages: MessageLineType[], cache: MergeCache): MessageLineType[] {
  const result: MessageLineType[] = [];
  const runningToolCalls: MessageLineType[] = [];
  const toolResultsById = new Map<string, MessageLineType>();

  for (const msg of messages) {
    if (msg.type === 'tool_result' && msg.metadata?.toolResult?.id) {
      toolResultsById.set(msg.metadata.toolResult.id, msg);
    }
  }

  const seenIds = new Set<string>();

  for (const msg of messages) {
    seenIds.add(msg.id);

    if (msg.type === 'tool') {
      const toolCalls = msg.metadata?.toolCalls || [];
      const resultsByCallId = new Map<string, MessageLineType>();
      const resultIds: string[] = [];

      for (const toolCall of toolCalls) {
        const toolResult = toolResultsById.get(toolCall.id);
        if (toolResult) {
          resultsByCallId.set(toolCall.id, toolResult);
          resultIds.push(toolCall.id);
        }
      }

      if (resultsByCallId.size > 0) {
        const cached = cache.get(msg.id);

        if (cached && cached.inputRef === msg && arraysEqual(cached.resultIds, resultIds)) {
          result.push(cached.output);
        } else {
          const output: MessageLineType = {
            ...msg,
            metadata: { ...msg.metadata, toolResultsByCallId: resultsByCallId },
          };
          cache.set(msg.id, { inputRef: msg, resultIds, output });
          result.push(output);
        }

        for (const [, toolResult] of resultsByCallId) {
          result.push(toolResult);
        }
      } else {
        // Tool call without results yet - defer to end
        runningToolCalls.push(msg);
      }
    } else if (msg.type === 'tool_result') {
      const toolResultId = msg.metadata?.toolResult?.id;
      if (!toolResultId) {
        result.push(msg);
      } else {
        const hasMatchingToolCall = messages.some(
          (m) => m.type === 'tool' && m.metadata?.toolCalls?.some((tc) => tc.id === toolResultId),
        );
        if (!hasMatchingToolCall) {
          result.push(msg);
        }
      }
    } else {
      result.push(msg);
    }
  }

  // Append running tool calls at the end so they appear as the newest messages
  result.push(...runningToolCalls);

  for (const key of cache.keys()) {
    if (!seenIds.has(key)) {
      cache.delete(key);
    }
  }

  return result;
}

const ChatDisplayComponent: React.FC<ChatDisplayProps> = ({ messages, headerKey, sessions: sessionsProp }) => {
  const sessions = sessionsProp ?? null;

  const mergeCacheRef = useRef<MergeCache>(new Map());
  const mergedMessages = useMemo(() => mergeToolCallsWithResultsCached(messages, mergeCacheRef.current), [messages]);

  const staticCount = useMemo(() => calculateStaticCount(mergedMessages), [mergedMessages]);

  // Use a ref to maintain the stable list of static items to avoid re-rendering Static
  // when the prefix hasn't changed.
  const lastStaticItemsRef = React.useRef<MessageLineType[]>([]);

  const staticItems = useMemo(() => {
    const prevStatic = lastStaticItemsRef.current;
    const currentStaticSlice = mergedMessages.slice(0, staticCount);

    // Helper to update ref and return
    const update = (items: MessageLineType[]) => {
      lastStaticItemsRef.current = items;
      return items;
    };

    // 1. Initial load
    if (prevStatic.length === 0) {
      return update(currentStaticSlice);
    }

    // 2. Check for invalidation (shrinking or head change)
    // If staticCount decreased, we must have removed messages.
    if (staticCount < prevStatic.length) {
      return update(currentStaticSlice);
    }
    // If the first message ID changed, it's a different session/context.
    if (currentStaticSlice.length > 0 && prevStatic[0]?.id !== currentStaticSlice[0]?.id) {
      return update(currentStaticSlice);
    }

    // 3. Check for Append
    if (staticCount > prevStatic.length) {
      const newItems = currentStaticSlice.slice(prevStatic.length);
      return update([...prevStatic, ...newItems]);
    }

    // 4. Same length. Assume stable to prevent Static re-render.
    return prevStatic;
  }, [mergedMessages, staticCount]);

  // Stable refs for header items to prevent Static from re-rendering them
  type HeaderItem = { type: 'logo'; id: string; sessions: SessionInfo[] };
  const logoItemRef = useRef<HeaderItem | null>(null);
  const lastStaticItemsWithHeaderRef = useRef<Array<HeaderItem | MessageLineType>>([]);

  const staticItemsWithHeader = useMemo(() => {
    // Create or reuse stable logo item (only recreate when headerKey changes)
    const logoId = `logo-${headerKey}`;
    if (!logoItemRef.current || logoItemRef.current.id !== logoId) {
      logoItemRef.current = { type: 'logo' as const, id: logoId, sessions: sessions ?? [] };
    }

    // Build items array using stable references
    const items: Array<HeaderItem | MessageLineType> = [];
    items.push(logoItemRef.current);
    items.push(...staticItems);

    // Only return new array if content actually changed
    const prev = lastStaticItemsWithHeaderRef.current;
    if (prev.length === items.length && prev.every((item, i) => item === items[i])) {
      return prev;
    }

    lastStaticItemsWithHeaderRef.current = items;
    return items;
  }, [headerKey, sessions, staticItems]);

  const visible = useMemo(() => {
    return mergedMessages.slice(staticItems.length);
  }, [mergedMessages, staticItems]);

  return (
    <Box flexDirection="column" flexShrink={1} overflow="hidden">
      {staticItemsWithHeader.length > 0 && (
        <Box height={0} flexDirection="column">
          <Static items={staticItemsWithHeader}>
            {(item) => {
              if (item.type === 'logo') {
                return <WelcomeLogo key={item.id} recentSessions={item.sessions} />;
              }
              return <MessageLine key={item.id} message={item as MessageLineType} />;
            }}
          </Static>
        </Box>
      )}

      {visible.map((line) => (
        <MessageLine key={line.id} message={line} />
      ))}
    </Box>
  );
};

export const ChatDisplay = React.memo(ChatDisplayComponent);
