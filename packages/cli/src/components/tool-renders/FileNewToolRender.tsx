import { Box } from "@nuvin/ink";

import { jsonObject, numberProp, stringProp } from "./json.js";
import { ToolHeaderLine, ToolInlineApproval, ToolResultPreview } from "./parts.js";
import { getToolStatusColor } from "./toolStatus.js";
import type { ToolRendererProps } from "./types.js";

function getStatusText(props: ToolRendererProps): string {
  const status = props.message.status;
  if (status === "pending") return "Waiting to create file";
  if (status === "running" || status === "approved") return "Creating file";
  if (status === "rejected") return "Skipped file creation";
  if (status === "error") return "File creation failed";

  const structured = jsonObject(props.message.structured);
  const lines = numberProp(structured, "lines");
  const bytes = numberProp(structured, "bytes");
  if (lines !== undefined && bytes !== undefined)
    return `Created file (${lines} lines, ${bytes} bytes)`;
  if (lines !== undefined) return `Created file (${lines} lines)`;
  if (bytes !== undefined) return `Created file (${bytes} bytes)`;
  return "Created file";
}

export function FileNewToolRender(props: ToolRendererProps) {
  const input = jsonObject(props.message.input);
  const structured = jsonObject(props.message.structured);
  const filePath =
    stringProp(structured, "filePath") ?? stringProp(input, "filePath") ?? props.message.summary;
  const color = getToolStatusColor(props.theme, props.message.status);
  const showOutput = props.message.status === "error";

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
          mainArg={filePath}
          phrase={getStatusText(props)}
          status={props.message.status}
          surfaceColor={props.surfaceColor}
        />
        {showOutput ? (
          <ToolResultPreview
            accentColor={color}
            fromEnd={false}
            maxLines={6}
            surfaceColor={props.surfaceColor}
            text={props.message.text}
          />
        ) : null}
      </Box>
      <ToolInlineApproval
        approval={props.inlineApproval}
        onDecision={props.onApprovalDecision}
        queuedCount={props.queuedApprovalCount}
      />
    </Box>
  );
}
