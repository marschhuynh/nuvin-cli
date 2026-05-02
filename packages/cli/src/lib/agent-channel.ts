import { EventEmitter } from "node:events";

import type {
  AgentEvent,
  ToolRuntimeDispatchDecision,
  ToolUseBlock,
} from "@nuvin/nuvin-core/shared";

/**
 * Optional context describing the delegated child agent that produced the
 * event/tool-call. Set by the delegation wrapping in `root.tsx` so the UI
 * can nest sub-agent activity under the originating `AssignTask`
 * tool call. Coordinator (root) callbacks omit it.
 */
export type DelegationScope = {
  agentId: string;
  parentToolCallId: string;
};

export type AgentEventPayload = {
  event: AgentEvent;
  scope?: DelegationScope;
};

export type ToolCallRequest = {
  agentId: string;
  parentToolCallId?: string;
  toolCall: ToolUseBlock;
};

export type AgentEventListener = (payload: AgentEventPayload) => void;

export type ToolCallDecider = (
  request: ToolCallRequest,
) => Promise<ToolRuntimeDispatchDecision> | ToolRuntimeDispatchDecision;

const NO_DECIDER_DECISION: ToolRuntimeDispatchDecision = {
  action: "reject",
  reason: "UI is not ready to handle tool calls.",
};

/**
 * In-process channel between the Agent (constructed in `main()`) and the
 * React UI (`<App />`). Two distinct shapes:
 *   - One-way agent → UI events: fire-and-forget, many subscribers.
 *   - Two-way agent → UI tool-call requests: exactly one decider, returns
 *     a {@link ToolRuntimeDispatchDecision} (or a Promise for it).
 *
 * This replaces the earlier mutable callback "bridge" container with a
 * typed, encapsulated, testable boundary.
 */
export class AgentChannel {
  private readonly emitter = new EventEmitter();
  private decider: ToolCallDecider | null = null;

  // ---------- Agent-side (publishers) ----------

  publishEvent(event: AgentEvent, scope?: DelegationScope): void {
    this.emitter.emit("event", { event, scope });
  }

  requestToolDecision(
    request: ToolCallRequest,
  ): Promise<ToolRuntimeDispatchDecision> | ToolRuntimeDispatchDecision {
    if (!this.decider) {
      return NO_DECIDER_DECISION;
    }
    return this.decider(request);
  }

  // ---------- UI-side (subscribers) ----------

  onEvent(listener: AgentEventListener): () => void {
    this.emitter.on("event", listener);
    return () => {
      this.emitter.off("event", listener);
    };
  }

  setToolDecider(decider: ToolCallDecider | null): void {
    this.decider = decider;
  }
}
