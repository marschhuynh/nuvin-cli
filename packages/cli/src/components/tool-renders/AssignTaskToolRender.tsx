import { Box } from "@nuvin/ink";
import { useActiveApproval, useChildMessages } from "#src/components/ChildMessagesContext.js";
import { MessageRow } from "#src/components/MessageRow.js";
import type { ToolMessageStatus } from "#src/lib/messages/state.js";

import { ToolArgsBlock, ToolHeaderLine, ToolInlineApproval, ToolResultPreview } from "./parts.js";
import { getToolStatusColor } from "./toolStatus.js";
import type { ToolRendererProps } from "./types.js";

type ToolInputSummary = Record<string, unknown>;

function parseInputSummary(summary: string): ToolInputSummary | null {
  const trimmed = summary.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as ToolInputSummary)
      : null;
  } catch {
    return null;
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getDelegateStatusPhrase(status: ToolMessageStatus): string {
  switch (status) {
    case "approved":
      return "Approved delegation";
    case "error":
      return "Delegation failed";
    case "ok":
      return "Delegated";
    case "pending":
      return "Waiting to delegate";
    case "rejected":
      return "Skipped delegation";
    case "running":
      return "Delegating";
  }
}

function getDelegationSummary(input: ToolInputSummary | null, fallback: string): string {
  if (!input) {
    return fallback;
  }

  const task = getString(input.task);
  return task ?? fallback;
}

export function AssignTaskToolRender(props: ToolRendererProps) {
  const input = parseInputSummary(props.message.summary);
  const statusPhrase = getDelegateStatusPhrase(props.message.status);
  const target = getString(input?.agentId) ?? "agent";
  const summary = getDelegationSummary(input, props.message.summary);
  const childMessages = useChildMessages(props.message.toolCallId);
  const activeApproval = useActiveApproval();
  const color = getToolStatusColor(props.theme, props.message.status);

  return (
    <Box flexDirection="column" width="100%">
      <Box
        backgroundColor={props.surfaceColor}
        flexDirection="column"
        width="100%"
        paddingX={1}
        paddingY={1}
      >
        <ToolHeaderLine
          color={color}
          mainArg={target}
          phrase={statusPhrase}
          status={props.message.status}
          surfaceColor={props.surfaceColor}
        />
        <ToolArgsBlock
          rows={summary ? [{ label: "Task", value: summary }] : []}
          surfaceColor={props.surfaceColor}
        />
        <ToolResultPreview
          accentColor={color}
          fromEnd={props.message.status === "running"}
          maxLines={props.message.status === "running" ? 5 : 6}
          surfaceColor={props.surfaceColor}
          text={props.message.text}
        />
      </Box>
      <ToolInlineApproval
        approval={props.inlineApproval}
        onDecision={props.onApprovalDecision}
        queuedCount={props.queuedApprovalCount}
      />
      {childMessages.length > 0 ? (
        <Box flexDirection="column" paddingLeft={2} width="100%">
          {childMessages.map((childMessage) => (
            <MessageRow
              key={childMessage.id}
              activeApproval={activeApproval}
              markdownWidth={Math.max(20, props.markdownWidth - 2)}
              message={childMessage}
              onApprovalDecision={props.onApprovalDecision}
              queuedApprovalCount={props.queuedApprovalCount}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
