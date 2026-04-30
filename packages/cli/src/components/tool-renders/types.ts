import type { ReactElement } from "react";

import type { ApprovalDecision, PendingApproval } from "#src/lib/approvals/queue.js";
import type { ToolTuiMessage } from "#src/lib/messages/state.js";
import type { Theme } from "#src/lib/theme/runtime.js";

export type ToolRendererProps = {
  inlineApproval: PendingApproval | null;
  /**
   * Width (terminal columns) available for markdown content rendered by
   * this tool renderer (or by nested MessageRows it includes). Threaded
   * from MessageList so estimator and renderer agree on wrap width.
   * Renderers that introduce horizontal chrome (padding, accent bars)
   * around nested Markdown MUST shrink this before forwarding.
   */
  markdownWidth: number;
  message: ToolTuiMessage;
  onApprovalDecision?: (decision: ApprovalDecision, comment?: string) => void;
  queuedApprovalCount: number;
  surfaceColor?: string;
  theme: Theme;
};

export type ToolRenderer = (props: ToolRendererProps) => ReactElement;
