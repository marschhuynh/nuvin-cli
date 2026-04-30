import { Box, Text } from "@nuvin/ink";
import React from "react";

import { Markdown } from "#src/components/Markdown.js";
import { ToolMessageRow } from "#src/components/ToolMessageRow.js";
import type { ApprovalDecision, PendingApproval } from "#src/lib/approvals/queue.js";
import type { TuiMessage } from "#src/lib/messages/state.js";
import { useTheme } from "#src/lib/theme/store.js";

type MessageRowProps = {
  activeApproval?: PendingApproval | null;
  /**
   * Width (terminal columns) available for markdown content inside this
   * row. Computed by the parent (MessageList for top-level rows,
   * AssignTaskToolRender for nested rows) so the height estimator and the
   * marked-terminal renderer use the same value — drift causes wrap
   * artefacts and broken virtualization heights.
   */
  markdownWidth: number;
  message: TuiMessage;
  onApprovalDecision?: (decision: ApprovalDecision, comment?: string) => void;
  queuedApprovalCount?: number;
};

// Same glyph as the VirtualizedList scrollbar thumb so message-side accents
// feel visually consistent with the chrome.
const VERTICAL_BAR = "▌";

function countLines(text: string): number {
  if (text.length === 0) return 1;
  return text.split("\n").length;
}

function MessageRowInner({
  activeApproval = null,
  markdownWidth,
  message,
  onApprovalDecision,
  queuedApprovalCount = 0,
}: MessageRowProps) {
  const theme = useTheme();

  switch (message.role) {
    case "user": {
      const bg = theme.message.surfaces.user;
      const accent = theme.message.userPrompt;
      const lines = countLines(message.text);
      return (
        <Box flexDirection="row" width="100%" backgroundColor={bg} padding={1}>
          <Box flexDirection="column" marginRight={1}>
            {Array.from({ length: lines }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative array
              <Text key={i} backgroundColor={bg} color={accent}>
                {VERTICAL_BAR}
              </Text>
            ))}
          </Box>
          <Box flexGrow={1}>
            <Text backgroundColor={bg} color={theme.text.default}>
              {message.text}
            </Text>
          </Box>
        </Box>
      );
    }

    case "assistant": {
      const bg = theme.message.surfaces.assistant;
      return (
        <Box flexDirection="column" width="100%" backgroundColor={bg} padding={1}>
          <Text backgroundColor={bg} color={theme.message.assistantText}>
            <Markdown
              backgroundColor={bg}
              color={theme.message.assistantText}
              maxWidth={markdownWidth}
            >
              {message.text}
            </Markdown>
          </Text>
        </Box>
      );
    }

    case "reasoning": {
      const bg = theme.message.surfaces.reasoning;
      return (
        <Box flexDirection="column" width="100%" backgroundColor={bg} padding={1}>
          <Text backgroundColor={bg} color={theme.message.reasoningText} wrap="hard">
            {message.text}
          </Text>
        </Box>
      );
    }

    case "error": {
      const bg = theme.message.surfaces.error;
      return (
        <Box flexDirection="column" width="100%" backgroundColor={bg} padding={1}>
          <Box>
            <Text bold backgroundColor={bg} color={theme.message.error}>
              {"✗ error  "}
            </Text>
            <Text backgroundColor={bg} color={theme.message.error}>
              {message.text}
            </Text>
          </Box>
        </Box>
      );
    }

    case "info": {
      const bg = theme.message.surfaces.info;
      return (
        <Box flexDirection="column" width="100%" backgroundColor={bg} padding={1}>
          <Text backgroundColor={bg} color={theme.message.info}>
            {message.text}
          </Text>
        </Box>
      );
    }

    case "tool": {
      return (
        <ToolMessageRow
          activeApproval={activeApproval}
          markdownWidth={markdownWidth}
          message={message}
          onApprovalDecision={onApprovalDecision}
          queuedApprovalCount={queuedApprovalCount}
        />
      );
    }
  }
}

export const MessageRow = React.memo(MessageRowInner);
