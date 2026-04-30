import type { ToolRuntimeDispatchDecision, ToolUseBlock } from "@nuvin/agent-core/shared";
import { describe, expect, it, vi } from "vitest";

import {
  createApprovalQueueState,
  dequeueActiveApproval,
  enqueueApproval,
  isAutoApprovedTool,
} from "#src/lib/approvals/queue.js";

function makeToolCall(id: string, name = "Bash"): ToolUseBlock {
  return {
    type: "tool_use",
    id,
    name,
    input: {
      command: `echo ${id}`,
    },
  };
}

describe("approvalQueue", () => {
  it("auto-approves non-mutating read and search tools", () => {
    expect(isAutoApprovedTool("FileRead")).toBe(true);
    expect(isAutoApprovedTool("Ls")).toBe(true);
    expect(isAutoApprovedTool("Grep")).toBe(true);
    expect(isAutoApprovedTool("Glob")).toBe(true);
  });

  it("does not auto-approve mutating or shell tools", () => {
    expect(isAutoApprovedTool("Bash")).toBe(false);
    expect(isAutoApprovedTool("FileEdit")).toBe(false);
    expect(isAutoApprovedTool("FileNew")).toBe(false);
    expect(isAutoApprovedTool("AssignTask")).toBe(false);
  });

  it("keeps the first approval active and queues later ones behind it", () => {
    const resolveFirst = vi.fn<(decision: ToolRuntimeDispatchDecision) => void>();
    const resolveSecond = vi.fn<(decision: ToolRuntimeDispatchDecision) => void>();

    const firstState = enqueueApproval(createApprovalQueueState(), {
      agentId: "coordinator",
      resolve: resolveFirst,
      toolCall: makeToolCall("tool-1"),
    });

    const secondState = enqueueApproval(firstState, {
      agentId: "coordinator",
      resolve: resolveSecond,
      toolCall: makeToolCall("tool-2"),
    });

    expect(secondState.active?.toolCall.id).toBe("tool-1");
    expect(secondState.pending.map((entry) => entry.toolCall.id)).toEqual(["tool-2"]);
  });

  it("promotes approvals from first to last after the current one is removed", () => {
    const resolveFirst = vi.fn<(decision: ToolRuntimeDispatchDecision) => void>();
    const resolveSecond = vi.fn<(decision: ToolRuntimeDispatchDecision) => void>();
    const resolveThird = vi.fn<(decision: ToolRuntimeDispatchDecision) => void>();

    const queuedState = enqueueApproval(
      enqueueApproval(createApprovalQueueState(), {
        agentId: "coordinator",
        resolve: resolveFirst,
        toolCall: makeToolCall("tool-1"),
      }),
      {
        agentId: "coder",
        resolve: resolveSecond,
        toolCall: makeToolCall("tool-2", "WriteFileTool"),
      },
    );
    const stackedState = enqueueApproval(queuedState, {
      agentId: "coder",
      resolve: resolveThird,
      toolCall: makeToolCall("tool-3", "ReadFileTool"),
    });

    expect(stackedState.active?.toolCall.id).toBe("tool-1");
    expect(stackedState.pending.map((entry) => entry.toolCall.id)).toEqual(["tool-2", "tool-3"]);

    const nextState = dequeueActiveApproval(stackedState);
    expect(nextState.active?.toolCall.id).toBe("tool-2");
    expect(nextState.pending.map((entry) => entry.toolCall.id)).toEqual(["tool-3"]);
  });
});
