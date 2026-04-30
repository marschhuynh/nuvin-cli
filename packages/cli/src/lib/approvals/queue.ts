import type { ToolRuntimeDispatchDecision, ToolUseBlock } from "@nuvin/agent-core/shared";

/**
 * Decision the user makes on a pending tool approval.
 *   - 'y' → approve this call
 *   - 'n' → deny this call
 *   - 'a' → approve and remember (always-allow this tool for the agent)
 *   - 'o' → "other" → submit a deny-with-reason from the note input
 */
export type ApprovalDecision = "a" | "n" | "o" | "y";

export type PendingApproval = {
  agentId: string;
  resolve: (decision: ToolRuntimeDispatchDecision) => void;
  toolCall: ToolUseBlock;
};

export type ApprovalQueueState = {
  active: PendingApproval | null;
  pending: PendingApproval[];
};

const AUTO_APPROVED_TOOLS = new Set(["FileRead", "Ls", "Grep", "Glob"]);

export function isAutoApprovedTool(toolName: string): boolean {
  return AUTO_APPROVED_TOOLS.has(toolName);
}

export function createApprovalQueueState(): ApprovalQueueState {
  return {
    active: null,
    pending: [],
  };
}

export function enqueueApproval(
  state: ApprovalQueueState,
  approval: PendingApproval,
): ApprovalQueueState {
  if (!state.active) {
    return {
      ...state,
      active: approval,
    };
  }

  return {
    ...state,
    pending: [...state.pending, approval],
  };
}

export function dequeueActiveApproval(state: ApprovalQueueState): ApprovalQueueState {
  const [nextApproval, ...remainingApprovals] = state.pending;

  return {
    active: nextApproval ?? null,
    pending: remainingApprovals,
  };
}
