import { Box, Text } from "@nuvin/ink";
import type { ReactNode } from "react";

import { ApprovalPrompt } from "#src/components/ApprovalModal.js";
import type { ApprovalDecision, PendingApproval } from "#src/lib/approvals/queue.js";
import type { ToolMessageStatus } from "#src/lib/messages/state.js";

import { previewLines } from "./format.js";

const RESULT_ACCENT = "▌";

export type ToolHeaderLineProps = {
  color: string;
  mainArg?: string;
  phrase: string;
  status: ToolMessageStatus;
  surfaceColor?: string;
};

export type ToolArgsBlockProps = {
  rows: Array<{ label: string; value: string }>;
  surfaceColor?: string;
};

export type ToolResultPreviewProps = {
  accentColor?: string;
  fromEnd: boolean;
  maxLines: number;
  surfaceColor?: string;
  text: string;
};

export type InlineApprovalBlockProps = {
  children: ReactNode;
};

export type ToolInlineApprovalProps = {
  approval: PendingApproval | null;
  onDecision?: (decision: ApprovalDecision, comment?: string) => void;
  queuedCount: number;
};

function getToolStatusGlyph(status: ToolMessageStatus): string {
  switch (status) {
    case "approved":
    case "running":
      return "⏵";
    case "ok":
      return "✓";
    case "error":
      return "✗";
    case "rejected":
      return "⊘";
    case "pending":
      return "◌";
  }
}

export function ToolHeaderLine({
  color,
  mainArg,
  phrase,
  status,
  surfaceColor,
}: ToolHeaderLineProps) {
  return (
    <Box backgroundColor={surfaceColor}>
      <Text backgroundColor={surfaceColor}>
        <Text backgroundColor={surfaceColor} bold color={color}>
          {`${getToolStatusGlyph(status)} ${phrase}`}
        </Text>
        {mainArg ? (
          <Text backgroundColor={surfaceColor} dimColor>
            {` · ${mainArg}`}
          </Text>
        ) : null}
      </Text>
    </Box>
  );
}

export function ToolArgsBlock({ rows, surfaceColor }: ToolArgsBlockProps) {
  if (rows.length === 0) return null;

  return (
    <Box backgroundColor={surfaceColor} flexDirection="column" marginLeft={surfaceColor ? 0 : 2}>
      {rows.map((row) => (
        <Text key={`${row.label}:${row.value}`} backgroundColor={surfaceColor} dimColor>
          {`${row.label}: ${row.value}`}
        </Text>
      ))}
    </Box>
  );
}

export function ToolResultPreview(props: ToolResultPreviewProps) {
  const { hidden, preview } = previewLines(props.text, props.maxLines, props.fromEnd);
  if (preview.length === 0) return null;

  return (
    <Box backgroundColor={props.surfaceColor} flexDirection="row" marginTop={1}>
      <Text backgroundColor={props.surfaceColor} color={props.accentColor ?? "gray"}>
        {RESULT_ACCENT}
      </Text>
      <Box backgroundColor={props.surfaceColor} flexDirection="column" paddingLeft={1}>
        {hidden > 0 && props.fromEnd ? (
          <Text backgroundColor={props.surfaceColor} dimColor>
            {`... ${hidden} earlier line${hidden === 1 ? "" : "s"}`}
          </Text>
        ) : null}
        <Text backgroundColor={props.surfaceColor} dimColor>
          {preview}
        </Text>
        {hidden > 0 && !props.fromEnd ? (
          <Text backgroundColor={props.surfaceColor} dimColor>
            {`... ${hidden} more line${hidden === 1 ? "" : "s"}`}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

export function ToolInlineApproval({ approval, onDecision, queuedCount }: ToolInlineApprovalProps) {
  if (!approval || !onDecision) return null;

  return (
    <ApprovalPrompt
      approval={approval}
      onDecision={onDecision}
      queuedCount={queuedCount}
      showHeader={true}
      showParameters={false}
    />
  );
}
