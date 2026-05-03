import { Box } from "@nuvin/ink";

import { jsonObject, numberProp, stringProp } from "./json.js";
import { ToolHeaderLine, ToolInlineApproval, ToolResultPreview } from "./parts.js";
import { getToolStatusColor } from "./toolStatus.js";
import type { ToolRendererProps } from "./types.js";

function getStatusText(props: ToolRendererProps): string {
  const status = props.message.status;
  if (status === "pending") return "Waiting to list directory";
  if (status === "running" || status === "approved") return "Listing directory";
  if (status === "rejected") return "Skipped directory listing";
  if (status === "error") return "Listing failed";

  const structured = jsonObject(props.message.structured);
  const total = numberProp(structured, "total");
  const truncated = structured?.truncated === true;
  const text = total !== undefined ? `Listed ${total} entries` : "Listed";
  return truncated ? `${text} (truncated)` : text;
}

export function LsToolRender(props: ToolRendererProps) {
  const input = jsonObject(props.message.input);
  const directoryPath = stringProp(input, "path") ?? ".";
  const color = getToolStatusColor(props.theme, props.message.status);
  const showOutput = props.message.status === "error";

  return (
    <Box flexDirection="column" width="100%">
      <ToolHeaderLine
        color={color}
        mainArg={directoryPath}
        phrase={getStatusText(props)}
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
