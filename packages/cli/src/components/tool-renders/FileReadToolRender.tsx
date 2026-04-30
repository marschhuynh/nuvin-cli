import { Box } from "@nuvin/ink";

import { jsonObject, numberProp, stringProp } from "./json.js";
import { ToolHeaderLine, ToolInlineApproval, ToolResultPreview } from "./parts.js";
import { getToolStatusColor } from "./toolStatus.js";
import type { ToolRendererProps } from "./types.js";

function getMainArg(props: ToolRendererProps): string {
  const input = jsonObject(props.message.input);
  const filePath = stringProp(input, "path") ?? props.message.summary;
  const lineStart = numberProp(input, "lineStart");
  const lineEnd = numberProp(input, "lineEnd");

  if (lineStart !== undefined && lineEnd !== undefined) {
    return `${filePath}:${lineStart}-${lineEnd}`;
  }

  if (lineStart !== undefined) {
    return `${filePath}:${lineStart}`;
  }

  return filePath;
}

function getAction(status: ToolRendererProps["message"]["status"]): string {
  if (status === "pending") return "Waiting to read file";
  if (status === "running" || status === "approved") return "Reading file";
  if (status === "error") return "File read failed";
  if (status === "rejected") return "Skipped file read";
  return "Read file";
}

export function FileReadToolRender(props: ToolRendererProps) {
  const color = getToolStatusColor(props.theme, props.message.status);
  const showOutput = props.message.status === "error";

  return (
    <Box flexDirection="column" width="100%">
      <ToolHeaderLine
        color={color}
        mainArg={getMainArg(props)}
        phrase={getAction(props.message.status)}
        status={props.message.status}
      />
      {showOutput ? (
        <ToolResultPreview
          accentColor={color}
          fromEnd={false}
          maxLines={6}
          text={props.message.text}
        />
      ) : null}
      <ToolInlineApproval
        approval={props.inlineApproval}
        onDecision={props.onApprovalDecision}
        queuedCount={props.queuedApprovalCount}
      />
    </Box>
  );
}
