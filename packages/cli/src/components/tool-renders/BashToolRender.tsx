import { Box } from "@nuvin/ink";

import { jsonObject, stringProp } from "./json.js";
import { ToolHeaderLine, ToolInlineApproval, ToolResultPreview } from "./parts.js";
import { getToolStatusColor } from "./toolStatus.js";
import type { ToolRendererProps } from "./types.js";

const BASH_RUNNING_PREVIEW_LINES = 5;
const BASH_COMPLETED_PREVIEW_LINES = 6;

function getStatusText(props: ToolRendererProps): string {
  const status = props.message.status;
  if (status === "pending") return "Waiting to run command";
  if (status === "approved") return "Approved command";
  if (status === "running") return "Running command";
  if (status === "rejected") return "Skipped command";
  if (status === "error") return "Command failed";
  return "Ran command";
}

export function BashToolRender(props: ToolRendererProps) {
  const input = jsonObject(props.message.input);
  const command = stringProp(input, "command") ?? props.message.summary;
  const cwd = stringProp(input, "cwd");
  const color = getToolStatusColor(props.theme, props.message.status);
  const showOutput = props.message.status !== "pending" && props.message.status !== "rejected";
  const maxLines =
    props.message.status === "running" || props.message.status === "approved"
      ? BASH_RUNNING_PREVIEW_LINES
      : BASH_COMPLETED_PREVIEW_LINES;

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
          mainArg={cwd ? `${command} at ${cwd}` : command}
          phrase={getStatusText(props)}
          status={props.message.status}
          surfaceColor={props.surfaceColor}
        />
        {showOutput ? (
          <ToolResultPreview
            accentColor={color}
            fromEnd={true}
            maxLines={maxLines}
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
