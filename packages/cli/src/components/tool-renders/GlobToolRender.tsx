import { Box } from "@nuvin/ink";

import { jsonObject, numberProp, stringProp } from "./json.js";
import { ToolHeaderLine, ToolInlineApproval, ToolResultPreview } from "./parts.js";
import { getToolStatusColor } from "./toolStatus.js";
import type { ToolRendererProps } from "./types.js";

function getStatusText(props: ToolRendererProps): string {
  const status = props.message.status;
  if (status === "pending") return "Waiting to find files";
  if (status === "running" || status === "approved") return "Finding files";
  if (status === "rejected") return "Skipped file search";
  if (status === "error") return "Search failed";

  const structured = jsonObject(props.message.structured);
  const count = numberProp(structured, "count");
  const truncated = structured?.truncated === true;
  const text =
    count !== undefined ? `Found ${count} file${count === 1 ? "" : "s"}` : "Search complete";
  return truncated ? `${text} (truncated)` : text;
}

export function GlobToolRender(props: ToolRendererProps) {
  const input = jsonObject(props.message.input);
  const pattern = stringProp(input, "pattern") ?? props.message.summary;
  const color = getToolStatusColor(props.theme, props.message.status);
  const showOutput = props.message.status === "error";

  return (
    <Box flexDirection="column" width="100%">
      <ToolHeaderLine
        color={color}
        mainArg={pattern}
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
