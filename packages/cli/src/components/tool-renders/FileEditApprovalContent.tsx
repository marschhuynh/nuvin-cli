import type { JsonObject, JsonValue, ToolUseBlock } from "@nuvin/agent-core/shared";
import { Box, Text } from "@nuvin/ink";
import { useMemo } from "react";

import { useTheme } from "#src/lib/theme/store.js";

import { FileDiffView } from "./FileDiffView.js";

export type FileEditDiffInput = JsonObject & {
  dryRun?: boolean;
  filePath?: string;
  newText: string;
  oldText: string;
};

function isJsonObject(input: JsonValue | undefined): input is JsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export function isFileEditDiffInput(input: JsonValue | undefined): input is FileEditDiffInput {
  if (!isJsonObject(input)) return false;
  return (
    typeof input.oldText === "string" &&
    typeof input.newText === "string" &&
    (input.filePath === undefined || typeof input.filePath === "string") &&
    (input.dryRun === undefined || typeof input.dryRun === "boolean")
  );
}

export function FileEditApprovalContent({ toolCall }: { toolCall: ToolUseBlock }) {
  const theme = useTheme();
  const input = toolCall.input;
  const blocks = useMemo(
    () => (isFileEditDiffInput(input) ? [{ search: input.oldText, replace: input.newText }] : []),
    [input],
  );

  if (!isFileEditDiffInput(input)) {
    return (
      <Box paddingLeft={2}>
        <Text color={theme.accent.danger}>Invalid FileEdit arguments</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <FileDiffView
        blocks={blocks}
        filePath={input.filePath}
        showPath={input.filePath !== undefined}
      />
      {input.dryRun ? <Text color={theme.text.dim}>dry run: true</Text> : null}
    </Box>
  );
}
