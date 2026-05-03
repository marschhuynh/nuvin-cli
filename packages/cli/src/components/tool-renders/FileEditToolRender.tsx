import { Box } from "@nuvin/ink";
import type { JsonObject, JsonValue } from "@nuvin/nuvin-core/shared";

import { FileDiffView, type LineNumbers } from "./FileDiffView.js";
import { isFileEditDiffInput } from "./FileEditApprovalContent.js";
import { numberProp } from "./json.js";
import { ToolHeaderLine, ToolInlineApproval, ToolResultPreview } from "./parts.js";
import { getToolStatusColor } from "./toolStatus.js";
import type { ToolRendererProps } from "./types.js";

type FileEditStructured = JsonObject & {
  bytesWritten?: number;
  dryRun?: boolean;
  filePath?: string;
  lineNumbers?: LineNumbers;
  noChange?: boolean;
  resolvedPath?: string;
};

function isJsonObject(input: JsonValue | undefined): input is JsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isLineNumbers(value: JsonValue | undefined): value is LineNumbers {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.oldStartLine === "number" &&
    typeof value.oldEndLine === "number" &&
    typeof value.newStartLine === "number" &&
    typeof value.newEndLine === "number" &&
    typeof value.oldLineCount === "number" &&
    typeof value.newLineCount === "number"
  );
}

function isFileEditStructured(value: JsonObject | undefined): value is FileEditStructured {
  if (!value) return false;
  return (
    (value.filePath === undefined || typeof value.filePath === "string") &&
    (value.resolvedPath === undefined || typeof value.resolvedPath === "string") &&
    (value.lineNumbers === undefined || isLineNumbers(value.lineNumbers)) &&
    (value.bytesWritten === undefined || typeof value.bytesWritten === "number") &&
    (value.dryRun === undefined || typeof value.dryRun === "boolean") &&
    (value.noChange === undefined || typeof value.noChange === "boolean")
  );
}

function getStatusPhrase(status: ToolRendererProps["message"]["status"]): string {
  switch (status) {
    case "error":
      return "Edit failed";
    case "ok":
      return "Edited file";
    case "rejected":
      return "Skipped file edit";
    case "pending":
      return "Waiting to edit file";
    case "approved":
    case "running":
      return "Editing file";
  }
}

function getCompletedPhrase(structured: FileEditStructured | undefined): string {
  const bytesWritten = numberProp(structured, "bytesWritten");
  return bytesWritten !== undefined ? `Edited file (${bytesWritten} bytes)` : "Edited file";
}

function getHeaderPhrase(
  props: ToolRendererProps,
  structured: FileEditStructured | undefined,
): string {
  return props.message.status === "ok"
    ? getCompletedPhrase(structured)
    : getStatusPhrase(props.message.status);
}

export function FileEditToolRender(props: ToolRendererProps) {
  const input = props.message.input;
  const structured = isFileEditStructured(props.message.structured)
    ? props.message.structured
    : undefined;
  const color = getToolStatusColor(props.theme, props.message.status);

  if (!isFileEditDiffInput(input)) {
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
            mainArg={props.message.summary}
            phrase={getHeaderPhrase(props, structured)}
            status={props.message.status}
            surfaceColor={props.surfaceColor}
          />
          <ToolResultPreview
            accentColor={color}
            fromEnd={false}
            maxLines={6}
            surfaceColor={props.surfaceColor}
            text={props.message.text}
          />
        </Box>
        <ToolInlineApproval
          approval={props.inlineApproval}
          onDecision={props.onApprovalDecision}
          queuedCount={props.queuedApprovalCount}
        />
      </Box>
    );
  }

  const lineNumbers = isLineNumbers(structured?.lineNumbers) ? structured.lineNumbers : undefined;
  const filePath = structured?.filePath ?? input.filePath;

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
          phrase={getHeaderPhrase(props, structured)}
          status={props.message.status}
          surfaceColor={props.surfaceColor}
        />
        <Box backgroundColor={props.surfaceColor} flexDirection="column">
          <FileDiffView
            blocks={[{ search: input.oldText, replace: input.newText }]}
            filePath={filePath}
            lineNumbers={lineNumbers}
            showPath={false}
          />
        </Box>
        {props.message.status === "error" ? (
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
