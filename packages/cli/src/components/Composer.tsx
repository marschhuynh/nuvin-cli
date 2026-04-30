import { Box, Text } from "@nuvin/ink";
import TextInput from "@nuvin/ink-text-input";
import Spinner from "ink-spinner";

import { useTheme } from "#src/lib/theme/store.js";

export type ComposerStatus = "approval" | "busy" | "idle";

type ComposerProps = {
  disabled: boolean;
  modelName: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  queuedApprovalCount?: number;
  status: ComposerStatus;
  value: string;
};

export function Composer(props: ComposerProps) {
  const { disabled, modelName, onChange, onSubmit, status, value } = props;

  const theme = useTheme();

  const promptColor = status === "idle" ? theme.composer.promptIdle : theme.composer.promptBusy;
  const composerBg = theme.surfaces.surface;

  return (
    <Box flexDirection="column" flexShrink={0} marginY={1}>
      <Box backgroundColor={composerBg} flexDirection="column" padding={1}>
        <Box>
          <Text bold color={promptColor} backgroundColor={composerBg}>
            {status === "busy" ? <Spinner type="dots" /> : "❯"}{" "}
          </Text>
          <TextInput
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            focus={status === "idle" && !disabled}
            placeholder={`Ask ${modelName} to inspect or change code`}
          />
        </Box>
      </Box>
    </Box>
  );
}
