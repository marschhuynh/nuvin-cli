import { Box } from "@nuvin/ink";

import { jsonObject, numberProp, stringProp } from "./json.js";
import { ToolHeaderLine, ToolInlineApproval, ToolResultPreview } from "./parts.js";
import { getToolStatusColor } from "./toolStatus.js";
import type { ToolRendererProps } from "./types.js";

function getMainArg(props: ToolRendererProps): string {
  const input = jsonObject(props.message.input);
  const pattern = stringProp(input, "pattern") ?? "";
  const searchPath = stringProp(input, "path");
  if (pattern.length === 0) return searchPath ?? props.message.summary;
  return searchPath ? `${pattern} at ${searchPath}` : pattern;
}

function getStatusText(props: ToolRendererProps): string {
  const status = props.message.status;
  if (status === "pending") return "Waiting to search";
  if (status === "running" || status === "approved") return "Searching";
  if (status === "rejected") return "Skipped search";
  if (status === "error") return "Search failed";

  const structured = jsonObject(props.message.structured);
  const matchCount = numberProp(structured, "matchCount");
  const fileCount = numberProp(structured, "fileCount");
  const truncated = structured?.truncated === true;

  if (matchCount === 0) return "Not found";
  if (matchCount === undefined) return "Search complete";

  let text = `Found ${matchCount} match${matchCount === 1 ? "" : "es"}`;
  if (fileCount !== undefined) text += ` in ${fileCount} file${fileCount === 1 ? "" : "s"}`;
  if (truncated) text += " (truncated)";
  return text;
}

export function GrepToolRender(props: ToolRendererProps) {
  const color = getToolStatusColor(props.theme, props.message.status);
  const showOutput = props.message.status === "error";

  return (
    <Box flexDirection="column" width="100%">
      <ToolHeaderLine
        color={color}
        mainArg={getMainArg(props)}
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
