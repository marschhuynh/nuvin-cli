import type { AgentEvent, ToolUseBlock } from "@nuvin/nuvin-core/shared";
import { describe, expect, it, vi } from "vitest";

import { AgentChannel, type AgentEventPayload, type ToolCallRequest } from "./agent-channel.js";

function makeToolCall(id: string, name = "Bash"): ToolUseBlock {
  return {
    type: "tool_use",
    id,
    name,
    input: { command: `echo ${id}` },
  };
}

function makeEvent(toolCallId: string): AgentEvent {
  return {
    type: "tool_call",
    toolCall: makeToolCall(toolCallId),
  } as AgentEvent;
}

describe("AgentChannel", () => {
  describe("publishEvent / onEvent", () => {
    it("delivers events to all subscribers", () => {
      const channel = new AgentChannel();
      const a = vi.fn<(payload: AgentEventPayload) => void>();
      const b = vi.fn<(payload: AgentEventPayload) => void>();

      channel.onEvent(a);
      channel.onEvent(b);
      channel.publishEvent(makeEvent("t1"));

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      expect(a.mock.calls[0]?.[0]).toEqual({
        event: makeEvent("t1"),
        scope: undefined,
      });
    });

    it("forwards the delegation scope when provided", () => {
      const channel = new AgentChannel();
      const listener = vi.fn<(payload: AgentEventPayload) => void>();
      channel.onEvent(listener);

      const scope = { agentId: "researcher", parentToolCallId: "parent-1" };
      channel.publishEvent(makeEvent("t1"), scope);

      expect(listener.mock.calls[0]?.[0]?.scope).toEqual(scope);
    });

    it("stops delivering events after unsubscribe", () => {
      const channel = new AgentChannel();
      const listener = vi.fn<(payload: AgentEventPayload) => void>();
      const unsubscribe = channel.onEvent(listener);

      channel.publishEvent(makeEvent("t1"));
      unsubscribe();
      channel.publishEvent(makeEvent("t2"));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("drops events when no subscriber is registered", () => {
      const channel = new AgentChannel();
      expect(() => channel.publishEvent(makeEvent("t1"))).not.toThrow();
    });
  });

  describe("requestToolDecision / setToolDecider", () => {
    it("rejects with the no-decider reason when no decider is registered", () => {
      const channel = new AgentChannel();
      const decision = channel.requestToolDecision({
        toolCall: makeToolCall("t1"),
        agentId: "assistant",
      });
      expect(decision).toEqual({
        action: "reject",
        reason: "UI is not ready to handle tool calls.",
      });
    });

    it("routes tool-call requests through the registered decider", async () => {
      const channel = new AgentChannel();
      const decider = vi.fn<(request: ToolCallRequest) => Promise<{ action: "run" }>>(async () => ({
        action: "run",
      }));
      channel.setToolDecider(decider);

      const result = await channel.requestToolDecision({
        toolCall: makeToolCall("t1", "Bash"),
        agentId: "assistant",
        parentToolCallId: "parent-1",
      });

      expect(result).toEqual({ action: "run" });
      expect(decider).toHaveBeenCalledTimes(1);
      expect(decider.mock.calls[0]?.[0]).toEqual({
        toolCall: makeToolCall("t1", "Bash"),
        agentId: "assistant",
        parentToolCallId: "parent-1",
      });
    });

    it("replaces the decider when setToolDecider is called again", async () => {
      const channel = new AgentChannel();
      const first = vi.fn(async () => ({ action: "run" as const }));
      const second = vi.fn(async () => ({
        action: "reject" as const,
        reason: "second",
      }));

      channel.setToolDecider(first);
      channel.setToolDecider(second);

      const result = await channel.requestToolDecision({
        toolCall: makeToolCall("t1"),
        agentId: "assistant",
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ action: "reject", reason: "second" });
    });

    it("falls back to the no-decider rejection after clearing with null", () => {
      const channel = new AgentChannel();
      channel.setToolDecider(() => ({ action: "run" }));
      channel.setToolDecider(null);

      const decision = channel.requestToolDecision({
        toolCall: makeToolCall("t1"),
        agentId: "assistant",
      });
      expect(decision).toEqual({
        action: "reject",
        reason: "UI is not ready to handle tool calls.",
      });
    });

    it("supports synchronous deciders that return a decision directly", () => {
      const channel = new AgentChannel();
      channel.setToolDecider(() => ({ action: "reject", reason: "denied" }));

      const decision = channel.requestToolDecision({
        toolCall: makeToolCall("t1"),
        agentId: "assistant",
      });
      expect(decision).toEqual({ action: "reject", reason: "denied" });
    });
  });
});
