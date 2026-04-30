import type { Agent } from "@nuvin/agent-core/agent";
import {
  type AgentEvent,
  isAbortError,
  type ToolRuntimeDispatchDecision,
  type ToolUseBlock,
} from "@nuvin/agent-core/shared";
import { Box, useApp, useWindowSize } from "@nuvin/ink";
import { InputSetup, useInput } from "@nuvin/ink-input";
import { useCallback, useEffect, useRef, useState } from "react";

import { Composer } from "#src/components/Composer.js";
import { Header } from "#src/components/Header.js";
import { MessageList } from "#src/components/MessageList.js";
import { StatusFooter } from "#src/components/StatusFooter.js";
import type { AgentChannel, DelegationScope } from "#src/lib/agent-channel.js";
import {
  type ApprovalDecision,
  type ApprovalQueueState,
  createApprovalQueueState,
  dequeueActiveApproval,
  enqueueApproval,
  isAutoApprovedTool,
} from "#src/lib/approvals/queue.js";
import {
  appendErrorMessage,
  appendUserMessage,
  applyAgentEvent,
  createMessageState,
  type MessageState,
  setToolMessageStatus,
} from "#src/lib/messages/state.js";

type SessionState = {
  approval: ApprovalQueueState;
  busy: boolean;
  messages: MessageState;
};

function createInitialState(): SessionState {
  return {
    approval: createApprovalQueueState(),
    busy: false,
    messages: createMessageState(),
  };
}

export type AppProps = {
  agent: Agent;
  channel: AgentChannel;
  modelName: string;
};

export function App(props: AppProps) {
  const { exit } = useApp();
  const handleCtrlC = useCallback(() => exit(), [exit]);

  return (
    <InputSetup onCtrlC={handleCtrlC}>
      <AppContent {...props} />
    </InputSetup>
  );
}

function AppContent({ agent, channel, modelName }: AppProps) {
  const { columns, rows } = useWindowSize();

  const [state, setState] = useState<SessionState>(createInitialState);

  // Mirror the latest state on a ref so the imperative submit/abort handlers
  // (which run between React renders) can synchronously read busy + approval.
  const stateRef = useRef(state);
  stateRef.current = state;

  const alwaysApproved = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  // ---------- Agent callbacks ----------

  const onAgentEvent = useCallback((event: AgentEvent, scope?: DelegationScope): void => {
    setState((current) => ({
      ...current,
      messages: applyAgentEvent(current.messages, event, scope?.parentToolCallId),
    }));
  }, []);

  const onToolCall = useCallback(
    (
      toolCall: ToolUseBlock,
      agentId: string,
      parentToolCallId?: string,
    ): Promise<ToolRuntimeDispatchDecision> | ToolRuntimeDispatchDecision => {
      const approvalKey = `${agentId}:${toolCall.name}`;
      const initialStatus =
        alwaysApproved.current.has(approvalKey) || isAutoApprovedTool(toolCall.name)
          ? "approved"
          : "pending";

      setState((current) => ({
        ...current,
        messages: setToolMessageStatus(
          applyAgentEvent(current.messages, { type: "tool_call", toolCall }, parentToolCallId),
          toolCall.id,
          initialStatus,
        ),
      }));

      if (initialStatus === "approved") {
        return { action: "run" };
      }

      return new Promise<ToolRuntimeDispatchDecision>((resolve) => {
        setState((current) => ({
          ...current,
          approval: enqueueApproval(current.approval, {
            agentId,
            resolve,
            toolCall,
          }),
        }));
      });
    },
    [],
  );

  // Subscribe to agent events from the channel.
  useEffect(
    () => channel.onEvent(({ event, scope }) => onAgentEvent(event, scope)),
    [channel, onAgentEvent],
  );

  // Register the tool-call decider with the channel. While unmounted, the
  // channel falls back to rejecting tool calls (defined in AgentChannel).
  useEffect(() => {
    channel.setToolDecider((request) =>
      onToolCall(request.toolCall, request.agentId, request.parentToolCallId),
    );
    return () => {
      channel.setToolDecider(null);
    };
  }, [channel, onToolCall]);

  // ---------- Approval decisions ----------

  const decideApproval = useCallback((decision: ApprovalDecision, comment?: string): void => {
    setState((current) => {
      const active = current.approval.active;
      if (!active) {
        return current;
      }

      if (decision === "a") {
        alwaysApproved.current.add(`${active.agentId}:${active.toolCall.name}`);
      }

      const rejected = decision === "n" || decision === "o";
      const newStatus = rejected ? "rejected" : "approved";

      if (rejected) {
        const baseReason = `User rejected tool execution (${active.toolCall.name})`;
        active.resolve({
          action: "reject",
          reason: comment ? `${baseReason}: ${comment}` : baseReason,
        });
      } else {
        active.resolve({ action: "run" });
      }

      return {
        ...current,
        messages: setToolMessageStatus(current.messages, active.toolCall.id, newStatus),
        approval: dequeueActiveApproval(current.approval),
      };
    });
  }, []);

  // ---------- Turn lifecycle ----------

  const finalizeTurn = useCallback((reason: string): void => {
    setState((current) => {
      const pendingApprovals = [current.approval.active, ...current.approval.pending].filter(
        (approval): approval is NonNullable<typeof approval> => approval !== null,
      );

      for (const approval of pendingApprovals) {
        approval.resolve({ action: "reject", reason });
      }

      return {
        ...current,
        busy: false,
        approval: createApprovalQueueState(),
        messages: pendingApprovals.reduce(
          (messages, approval) => setToolMessageStatus(messages, approval.toolCall.id, "rejected"),
          current.messages,
        ),
      };
    });
  }, []);

  const abort = useCallback((): void => {
    abortControllerRef.current?.abort(new Error("User aborted the current turn."));
  }, []);

  const submit = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed || stateRef.current.busy) {
        return;
      }

      setState((current) => ({
        ...current,
        messages: appendUserMessage(current.messages, trimmed),
        busy: true,
      }));

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await agent.send(trimmed, {
          streaming: true,
          signal: controller.signal,
        });
      } catch (error) {
        if (!isAbortError(error)) {
          const message = error instanceof Error ? error.message : String(error);
          setState((current) => ({
            ...current,
            messages: appendErrorMessage(current.messages, `Turn failed: ${message}`),
          }));
        }
      } finally {
        abortControllerRef.current = null;
        finalizeTurn("Turn ended before approval could be resolved.");
      }
    },
    [agent, finalizeTurn],
  );

  // ---------- UI ----------

  const [draft, setDraft] = useState("");

  useInput(
    (_input, key) => {
      if (key.escape && state.busy) {
        abort();
      }
    },
    { isActive: true },
  );

  const activeApproval = state.approval.active;
  const inputStatus = activeApproval ? "approval" : state.busy ? "busy" : "idle";
  const approvalMode = "ask before tools";
  const cwd = process.cwd();

  const onSubmit = useCallback(
    async (text: string) => {
      setDraft("");
      await submit(text);
    },
    [submit],
  );

  return (
    <Box
      position="relative"
      flexDirection="column"
      width={Math.max(20, columns - 2)}
      height={Math.max(10, rows - 2)}
      margin={1}
    >
      <Header approvalMode={approvalMode} cwd={cwd} modelName={modelName} />

      <Box flexGrow={1} flexShrink={1} overflow="hidden" marginTop={1}>
        <MessageList
          activeApproval={activeApproval}
          messages={state.messages.messages}
          onApprovalDecision={decideApproval}
          queuedApprovalCount={state.approval.pending.length}
        />
      </Box>

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={onSubmit}
        disabled={state.busy || activeApproval !== null}
        modelName={modelName}
        queuedApprovalCount={state.approval.pending.length}
        status={inputStatus}
      />

      <StatusFooter />
    </Box>
  );
}
