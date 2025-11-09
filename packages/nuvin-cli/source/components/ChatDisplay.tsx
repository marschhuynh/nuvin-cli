import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Static } from 'ink';
import { MessageLine } from './MessageLine.js';
import { HeaderContent } from './Header.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { scanAvailableSessions } from '@/hooks/useSessionManagement.js';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';

type SessionInfo = {
  sessionId: string;
  timestamp: string;
  lastMessage: string;
  messageCount: number;
};

type ChatDisplayProps = {
  key: string;
  messages: MessageLineType[];
  selectedIndex?: number | null;
  expandedIds?: Set<string>;
  headerKey?: number;
};

/**
 * Merges tool calls with their corresponding tool results for display purposes only.
 * Does NOT modify the original messages array in memory.
 */
function mergeToolCallsWithResults(messages: MessageLineType[]): MessageLineType[] {
  const result: MessageLineType[] = [];
  const toolResultsById = new Map<string, MessageLineType>();

  // First pass: collect all tool results by their tool call ID
  for (const msg of messages) {
    if (msg.type === 'tool_result' && msg.metadata?.toolResult?.id) {
      toolResultsById.set(msg.metadata.toolResult.id, msg);
    }
  }

  // Second pass: merge tool calls with their results
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.type === 'tool') {
      // This is a tool call message - check if we have results for any of the calls
      const toolCalls = msg.metadata?.toolCalls || [];
      const mergedResults: MessageLineType[] = [];

      // Build a map of tool results by call ID for quick lookup
      const resultsByCallId = new Map<string, MessageLineType>();
      for (const toolCall of toolCalls) {
        const toolResult = toolResultsById.get(toolCall.id);
        if (toolResult) {
          mergedResults.push(toolResult);
          resultsByCallId.set(toolCall.id, toolResult);
        }
      }

      // Add the tool call message with enhanced metadata including results
      // Only create new object if resultsByCallId actually has entries
      if (resultsByCallId.size > 0) {
        result.push({
          ...msg,
          metadata: {
            ...msg.metadata,
            toolResultsByCallId: resultsByCallId,
          },
        });
      } else {
        // No results yet, push original message
        result.push(msg);
      }

      // Add all merged results immediately after
      result.push(...mergedResults);
    } else if (msg.type === 'tool_result') {
      // Skip standalone tool_result messages - they're already merged with their tool calls
      // Only add them if they don't have a matching tool call (orphaned results)
      const toolResultId = msg.metadata?.toolResult?.id;
      if (!toolResultId) {
        // No ID, add it as-is
        result.push(msg);
      } else {
        // Check if there's a matching tool call in our messages
        const hasMatchingToolCall = messages.some(
          (m) => m.type === 'tool' && m.metadata?.toolCalls?.some((tc) => tc.id === toolResultId),
        );

        if (!hasMatchingToolCall) {
          // Orphaned result, add it
          result.push(msg);
        }
        // Otherwise skip - it's already been merged
      }
    } else {
      // Not a tool call or result, pass through
      result.push(msg);
    }
  }

  return result;
}

/**
 * Check if a tool call message has any pending (incomplete) tool calls
 */
function hasAnyPendingToolCalls(msg: MessageLineType): boolean {
  if (msg.type !== 'tool') return false;

  const toolCalls = msg.metadata?.toolCalls || [];
  const toolResultsByCallId = msg.metadata?.toolResultsByCallId as Map<string, MessageLineType> | undefined;

  // If there are no tool calls, it's not pending
  if (toolCalls.length === 0) return false;

  // Check if any tool call doesn't have a result yet
  for (const toolCall of toolCalls) {
    const hasResult = toolResultsByCallId?.has(toolCall.id);
    if (!hasResult) {
      return true; // At least one tool call is pending
    }
  }

  return false; // All tool calls have results
}

const ChatDisplayComponent: React.FC<ChatDisplayProps> = ({ messages, headerKey }) => {
  const DYNAMIC_COUNT = 0;
  const [columns] = useStdoutDimensions();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [headerLoaded, setHeaderLoaded] = useState(false);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const result = await scanAvailableSessions();
        setSessions(result.slice(0, 5));
      } catch (_error) {
      } finally {
        setHeaderLoaded(true);
      }
    };

    loadSessions();
  }, []);

  // Merge tool calls with results for display only
  const mergedMessages = useMemo(() => mergeToolCallsWithResults(messages), [messages]);

  // Calculate static count, excluding pending tool calls and streaming messages
  const calculateStaticCount = useCallback((msgs: MessageLineType[]) => {
    // Start from the end and work backwards
    // Keep at least DYNAMIC_COUNT messages dynamic
    let dynamicCount = DYNAMIC_COUNT;

    // Check messages from the end, looking for pending tool calls or streaming messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];

      // If this message is actively streaming, keep it and everything after it dynamic
      if (msg.metadata?.isStreaming === true) {
        dynamicCount = msgs.length - i;
        break;
      }

      // If this message is a pending tool call, keep it and everything after it dynamic
      if (hasAnyPendingToolCalls(msg)) {
        dynamicCount = msgs.length - i;
        break;
      }

      // Stop checking once we've gone past the minimum dynamic count
      if (msgs.length - i > DYNAMIC_COUNT) {
        break;
      }
    }

    return Math.max(0, msgs.length - dynamicCount);
  }, []);

  const staticCount = useMemo(() => calculateStaticCount(mergedMessages), [mergedMessages, calculateStaticCount]);

  const [staticItems, setStaticItems] = useState<MessageLineType[]>([]);

  // Ensure we don't remove messages from visible before they're in static
  // This prevents flashing when messages transition from dynamic to static
  const safeStaticCount = useMemo(() => {
    return Math.min(staticCount, staticItems.length);
  }, [staticCount, staticItems.length]);

  const noopToggle = useCallback(() => {}, []);

  // Memoize message items with type to avoid recreating on every render
  const staticMessagesWithType = useMemo(
    () => staticItems.map((item) => ({ type: 'message' as const, ...item })),
    [staticItems],
  );

  const staticItemsWithHeader = useMemo(() => {
    if (!headerLoaded) return [];
    return [{ type: 'header' as const, id: `header-${headerKey}`, sessions, columns }, ...staticMessagesWithType];
  }, [headerLoaded, headerKey, sessions, columns, staticMessagesWithType]);

  useEffect(() => {
    setStaticItems((prev) => {
      if (staticCount === 0) {
        return prev.length === 0 ? prev : [];
      }

      const firstPrevId = prev[0]?.id;
      const firstCurrentId = mergedMessages[0]?.id;
      const currentStaticSlice = () => mergedMessages.slice(0, staticCount);

      if (prev.length === 0) {
        return currentStaticSlice();
      }

      // If first message changed or staticCount decreased, reset
      if (firstPrevId !== firstCurrentId || staticCount < prev.length) {
        return currentStaticSlice();
      }

      // If staticCount matches prev length, check if last message changed
      if (staticCount === prev.length) {
        const prevLastId = prev[prev.length - 1]?.id;
        const currentLastId = mergedMessages[staticCount - 1]?.id;
        if (prevLastId === currentLastId) {
          // IDs match, but check if content changed (e.g., toolResultsByCallId added)
          const prevLast = prev[prev.length - 1];
          const currentLast = mergedMessages[staticCount - 1];
          if (prevLast.metadata?.toolResultsByCallId !== currentLast.metadata?.toolResultsByCallId) {
            // Tool result was added, update the static item
            return currentStaticSlice();
          }
          return prev;
        }
        return currentStaticSlice();
      }

      const nextChunk = mergedMessages.slice(prev.length, staticCount);

      if (nextChunk.length === 0) {
        return prev;
      }

      return [...prev, ...nextChunk];
    });
  }, [mergedMessages, staticCount]);

  const visible = useMemo(() => mergedMessages.slice(safeStaticCount), [mergedMessages, safeStaticCount]);

  /* Render static items using Ink's Static so they don't update after being printed */
  return (
    <Box flexDirection="column" flexShrink={1} flexGrow={1} overflow="hidden">
      {staticItemsWithHeader.length > 0 && (
        <Static items={staticItemsWithHeader}>
          {(item) => {
            if (item.type === 'header') {
              return <HeaderContent key={item.id} sessions={item.sessions} columns={item.columns} />;
            }
            return <MessageLine key={item.id} message={item} onToggleExpansion={noopToggle} />;
          }}
        </Static>
      )}

      {visible.map((line) => (
        <MessageLine key={line.id} message={line} onToggleExpansion={noopToggle} />
      ))}
    </Box>
  );
};

export const ChatDisplay = React.memo(ChatDisplayComponent);
