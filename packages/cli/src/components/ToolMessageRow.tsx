import { Box } from "@nuvin/ink";
import React from "react";
import { getToolRenderer } from "#src/components/tool-renders/index.js";
import { getToolStatusTransitionMinHeight } from "#src/components/tool-renders/transitionHeight.js";
import type { ApprovalDecision, PendingApproval } from "#src/lib/approvals/queue.js";
import type { ToolTuiMessage } from "#src/lib/messages/state.js";
import type { Theme } from "#src/lib/theme/runtime.js";
import { useTheme } from "#src/lib/theme/store.js";

type ToolMessageRowProps = {
  activeApproval?: PendingApproval | null;
  markdownWidth: number;
  message: ToolTuiMessage;
  onApprovalDecision?: (decision: ApprovalDecision, comment?: string) => void;
  queuedApprovalCount?: number;
};

function getToolBlockBackground(theme: Theme): string {
  return theme.message.surfaces.tool === theme.tokens.transparent
    ? theme.surfaces.surface
    : theme.message.surfaces.tool;
}

function ToolMessageRowInner({
  activeApproval = null,
  markdownWidth,
  message,
  onApprovalDecision,
  queuedApprovalCount = 0,
}: ToolMessageRowProps) {
  const theme = useTheme();
  const inlineApproval = activeApproval?.toolCall.id === message.toolCallId ? activeApproval : null;
  const Renderer = getToolRenderer(message.toolName);
  const minHeight = getToolStatusTransitionMinHeight(message);

  return (
    <Box flexDirection="column" minHeight={minHeight} width="100%">
      <Renderer
        inlineApproval={inlineApproval}
        markdownWidth={markdownWidth}
        message={message}
        onApprovalDecision={onApprovalDecision}
        queuedApprovalCount={queuedApprovalCount}
        surfaceColor={getToolBlockBackground(theme)}
        theme={theme}
      />
    </Box>
  );
}

export const ToolMessageRow = React.memo(ToolMessageRowInner);
