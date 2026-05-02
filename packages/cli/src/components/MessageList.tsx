import { Box, Text, useWindowSize } from "@nuvin/ink";
import { VirtualizedList, type VirtualizedListRef } from "@nuvin/ink-virtualized-list";
import { useEffect, useMemo, useRef } from "react";
import { ChildMessagesProvider } from "#src/components/ChildMessagesContext.js";
import { MessageRow } from "#src/components/MessageRow.js";
import {
  estimateFileEditDiffHeight,
  estimateToolHeaderHeight,
  getToolStatusTransitionMinHeight,
  INLINE_APPROVAL_HEIGHT,
} from "#src/components/tool-renders/transitionHeight.js";
import type { ApprovalDecision, PendingApproval } from "#src/lib/approvals/queue.js";
import { renderedMarkdownLineCount } from "#src/lib/markdown/render.js";
import type { ToolTuiMessage, TuiMessage } from "#src/lib/messages/state.js";
import type { Theme } from "#src/lib/theme/runtime.js";
import { getTheme, useTheme } from "#src/lib/theme/store.js";

function buildChildMap(messages: TuiMessage[]): Map<string, TuiMessage[]> {
  const map = new Map<string, TuiMessage[]>();
  for (const message of messages) {
    if (message.parentToolCallId) {
      const list = map.get(message.parentToolCallId) ?? [];
      list.push(message);
      map.set(message.parentToolCallId, list);
    }
  }
  return map;
}

function buildToolMessageIndex(messages: TuiMessage[]): Map<string, ToolTuiMessage> {
  const map = new Map<string, ToolTuiMessage>();
  for (const message of messages) {
    if (message.role === "tool") {
      map.set(message.toolCallId, message);
    }
  }
  return map;
}

function findRootAncestorToolCallId(
  toolMessages: ReadonlyMap<string, ToolTuiMessage>,
  toolCallId: string,
): string | undefined {
  let current = toolMessages.get(toolCallId);
  while (current?.parentToolCallId) {
    const next = toolMessages.get(current.parentToolCallId);
    if (!next) return current.toolCallId;
    current = next;
  }
  return current?.toolCallId;
}

type MessageListProps = {
  activeApproval?: PendingApproval | null;
  messages: TuiMessage[];
  onApprovalDecision?: (decision: ApprovalDecision, comment?: string) => void;
  queuedApprovalCount?: number;
};

const ROW_VERTICAL_PADDING = 2;
const RESULT_PREVIEW_MARGIN_TOP = 1;
const BASH_RUNNING_PREVIEW_LINES = 5;
const BASH_COMPLETED_PREVIEW_LINES = 6;
const DEFAULT_PREVIEW_LINES = 6;
export const MESSAGE_LIST_OVERSCAN = 2;
const BACKGROUNDLESS_TOOL_NAMES = new Set(["FileRead", "Glob", "Grep", "Ls"]);

function getTerminalColumns(): number {
  return process.stdout.columns ?? 80;
}

function markdownEstimateWidth(columns: number): number {
  // Available content width = columns - scrollbar(1) - padding(2).
  // Must match the width passed to <Markdown> in MessageRow.tsx — any drift
  // forces markdownProvider to reconfigure on every render, which is hot.
  return Math.max(20, columns - 4);
}

/**
 * Estimate how many terminal rows a block of plain text occupies when
 * rendered inside a row that consumes `chromeWidth` columns of horizontal
 * chrome (padding, accent bars, etc.). Each explicit line is wrapped at the
 * remaining content width.
 */
function wrappedLineCount(
  text: string,
  chromeWidth: number,
  columns: number = getTerminalColumns(),
): number {
  if (text.length === 0) return 1;
  const contentWidth = Math.max(1, columns - chromeWidth);
  let total = 0;
  for (const line of text.split("\n")) {
    total += line.length === 0 ? 1 : Math.ceil(line.length / contentWidth);
  }
  return total;
}

function outputPreviewHeight(text: string, maxLines: number): number {
  const trimmed = text.replace(/\s+$/, "");
  if (trimmed.length === 0) return 0;

  const lineCount = trimmed.split("\n").length;
  const hiddenIndicatorHeight = lineCount > maxLines ? 1 : 0;
  // ToolResultPreview renders with marginTop={1} so account for the spacer.
  return RESULT_PREVIEW_MARGIN_TOP + Math.min(lineCount, maxLines) + hiddenIndicatorHeight;
}

function isFileEditDiffMessage(message: ToolTuiMessage): boolean {
  return (
    typeof message.input?.filePath === "string" &&
    typeof message.input.oldText === "string" &&
    typeof message.input.newText === "string"
  );
}

function estimateToolOutputHeight(message: ToolTuiMessage): number {
  switch (message.toolName) {
    case "Bash":
      if (message.status === "pending" || message.status === "rejected") return 0;
      return outputPreviewHeight(
        message.text,
        message.status === "running" || message.status === "approved"
          ? BASH_RUNNING_PREVIEW_LINES
          : BASH_COMPLETED_PREVIEW_LINES,
      );

    case "FileRead":
    case "FileNew":
    case "Glob":
    case "Grep":
    case "Ls":
      return message.status === "error"
        ? outputPreviewHeight(message.text, DEFAULT_PREVIEW_LINES)
        : 0;

    case "FileEdit": {
      const diffHeight = isFileEditDiffMessage(message) ? estimateFileEditDiffHeight(message) : 0;
      const fallbackOutputHeight =
        !isFileEditDiffMessage(message) || message.status === "error"
          ? outputPreviewHeight(message.text, DEFAULT_PREVIEW_LINES)
          : 0;
      return diffHeight + fallbackOutputHeight;
    }

    case "AssignTask":
    case "delegate_to_agent": {
      const argsHeight = message.summary.trim().length > 0 ? 1 : 0;
      return (
        argsHeight +
        outputPreviewHeight(
          message.text,
          message.status === "running" ? BASH_RUNNING_PREVIEW_LINES : DEFAULT_PREVIEW_LINES,
        )
      );
    }

    default:
      if (message.status === "pending" || message.status === "rejected") return 0;
      return outputPreviewHeight(message.text, DEFAULT_PREVIEW_LINES);
  }
}

// Horizontal chrome (padding + accent bars) consumed by each text-message
// row. Used by the wrap-aware estimator. Numbers come from MessageRow's JSX:
//   user:  padding={1} on each side (2) + accent bar 1 + marginRight 1 = 4
//   error: padding={1} on each side (2) + "✗ error  " prefix isn't subtracted
//          per-line because it's only on the first line; the rough estimate is
//          good enough.
//   info / generic: padding={1} on each side = 2.
const TEXT_ROW_CHROME = {
  assistant: 2,
  error: 2,
  info: 2,
  reasoning: 2,
  user: 4,
} as const;

export function estimateMessageHeight(
  message: TuiMessage,
  activeApproval?: PendingApproval | null,
  childIndex?: ReadonlyMap<string, readonly TuiMessage[]>,
  columns: number = getTerminalColumns(),
): number {
  if (message.role !== "tool") {
    if (message.role === "assistant" || message.role === "reasoning") {
      return (
        renderedMarkdownLineCount(message.text, {
          reflowText: false,
          theme: getTheme(),
          width: markdownEstimateWidth(columns),
        }) + ROW_VERTICAL_PADDING
      );
    }

    return (
      wrappedLineCount(message.text, TEXT_ROW_CHROME[message.role], columns) + ROW_VERTICAL_PADDING
    );
  }

  // Backgroundless read/search tools (FileRead, Glob, Grep, Ls) render
  // without an outer padded Box, so they don't contribute ROW_VERTICAL_PADDING.
  const padding = BACKGROUNDLESS_TOOL_NAMES.has(message.toolName) ? 0 : ROW_VERTICAL_PADDING;
  const estimatedBaseHeight =
    padding + estimateToolHeaderHeight(message) + estimateToolOutputHeight(message);
  const transitionMinHeight = getToolStatusTransitionMinHeight(message);
  const baseHeight =
    transitionMinHeight === undefined
      ? estimatedBaseHeight
      : Math.max(estimatedBaseHeight, transitionMinHeight);

  // Delegation rows render their child agent's messages inline beneath the
  // tool header. Recurse so the parent height reflects the visible subtree.
  let childHeight = 0;
  if (
    (message.toolName === "AssignTask" || message.toolName === "delegate_to_agent") &&
    childIndex
  ) {
    const children = childIndex.get(message.toolCallId);
    if (children) {
      const nestedColumns = Math.max(20, columns - 2);
      for (const child of children) {
        childHeight += estimateMessageHeight(child, activeApproval, childIndex, nestedColumns);
      }
    }
  }

  const inlineApprovalHeight =
    activeApproval?.toolCall.id === message.toolCallId ? INLINE_APPROVAL_HEIGHT : 0;

  return baseHeight + childHeight + inlineApprovalHeight;
}

export function isBackgroundBlockMessage(message: TuiMessage, theme: Theme): boolean {
  if (message.role === "tool") {
    return !BACKGROUNDLESS_TOOL_NAMES.has(message.toolName);
  }

  return theme.message.surfaces[message.role] !== theme.tokens.transparent;
}

export function estimateMessageGapBefore(
  messages: readonly TuiMessage[],
  index: number,
  theme: Theme,
): number {
  const message = messages[index];
  if (index <= 0 || !message) return 0;
  return isBackgroundBlockMessage(message, theme) ? 1 : 0;
}

export function MessageList({
  activeApproval = null,
  messages,
  onApprovalDecision,
  queuedApprovalCount = 0,
}: MessageListProps) {
  const theme = useTheme();
  const { columns } = useWindowSize();
  const listRef = useRef<VirtualizedListRef>(null);
  const scrolledApprovalIdRef = useRef<string | null>(null);

  // Top-level virtualized list iterates only root-level messages; child
  // messages (tagged with parentToolCallId by delegated agents) are exposed
  // via context to the delegation renderer for nested rendering.
  const childIndex = useMemo(() => buildChildMap(messages), [messages]);
  const toolMessageById = useMemo(() => buildToolMessageIndex(messages), [messages]);
  const rootMessages = useMemo(
    () => messages.filter((message) => !message.parentToolCallId),
    [messages],
  );

  useEffect(() => {
    if (!activeApproval) {
      scrolledApprovalIdRef.current = null;
      return;
    }

    if (scrolledApprovalIdRef.current === activeApproval.toolCall.id) {
      return;
    }

    // Scroll to the closest root-level ancestor so the user sees the
    // delegation row that contains a nested approval prompt.
    const rootToolCallId = findRootAncestorToolCallId(toolMessageById, activeApproval.toolCall.id);
    if (!rootToolCallId) return;

    const activeIndex = rootMessages.findIndex(
      (message) => message.role === "tool" && message.toolCallId === rootToolCallId,
    );

    if (activeIndex >= 0) {
      listRef.current?.scrollToIndex(activeIndex, "start");
      scrolledApprovalIdRef.current = activeApproval.toolCall.id;
    }
  }, [activeApproval, rootMessages, toolMessageById]);

  if (rootMessages.length === 0) {
    return (
      <Box
        flexGrow={1}
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        paddingX={2}
      >
        <Text dimColor>Welcome to NUVIN</Text>
      </Box>
    );
  }

  return (
    <ChildMessagesProvider activeApproval={activeApproval} index={childIndex}>
      <VirtualizedList
        ref={listRef}
        items={rootMessages}
        renderItem={(message, index) => (
          <Box width="100%" paddingTop={estimateMessageGapBefore(rootMessages, index, theme)}>
            <MessageRow
              activeApproval={activeApproval}
              markdownWidth={markdownEstimateWidth(columns)}
              message={message}
              onApprovalDecision={onApprovalDecision}
              queuedApprovalCount={queuedApprovalCount}
            />
          </Box>
        )}
        keyExtractor={(message) => message.id}
        estimateItemHeight={(message, index) =>
          estimateMessageGapBefore(rootMessages, index, theme) +
          estimateMessageHeight(message, activeApproval, childIndex, columns)
        }
        autoFocus
        overscan={MESSAGE_LIST_OVERSCAN}
        showScrollbar
        scrollbarColor={theme.surfaces.scrollbarThumb}
        scrollbarTrackColor={theme.surfaces.scrollbarTrack}
        flexGrow={1}
        width="100%"
      />
    </ChildMessagesProvider>
  );
}
