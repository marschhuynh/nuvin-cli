import { Box } from "@nuvin/ink";

import { ToolHeaderLine, ToolInlineApproval, ToolResultPreview } from "./parts.js";
import { getToolStatusColor } from "./toolStatus.js";
import type { ToolRendererProps } from "./types.js";

function getStatusText(status: ToolRendererProps["message"]["status"]): string {
  switch (status) {
    case "approved":
    case "running":
      return "Running";
    case "error":
      return "Failed";
    case "ok":
      return "Completed";
    case "pending":
      return "Waiting";
    case "rejected":
      return "Denied";
  }
}

export function UnknownToolRender(props: ToolRendererProps) {
  const color = getToolStatusColor(props.theme, props.message.status);
  const showOutput = props.message.status !== "pending" && props.message.status !== "rejected";

  return (
    <Box
      backgroundColor={props.surfaceColor}
      flexDirection="column"
      width="100%"
      paddingX={1}
      paddingY={1}
    >
      <ToolHeaderLine
        color={color}
        mainArg={props.message.summary}
        phrase={getStatusText(props.message.status)}
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
      <ToolInlineApproval
        approval={props.inlineApproval}
        onDecision={props.onApprovalDecision}
        queuedCount={props.queuedApprovalCount}
      />
    </Box>
  );
}
