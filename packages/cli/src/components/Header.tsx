import os from "node:os";
import path from "node:path";
import { Box, Text } from "@nuvin/ink";

import { useTheme } from "#src/lib/theme/store.js";

type HeaderProps = {
  approvalMode: string;
  cwd: string;
  modelName: string;
};

function shortenCwd(cwd: string): string {
  const home = os.homedir();
  if (cwd === home) {
    return "~";
  }
  if (cwd.startsWith(`${home}${path.sep}`)) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

export function Header({ approvalMode, cwd, modelName }: HeaderProps) {
  const theme = useTheme();
  const badgeBg = theme.accent.brand;
  return (
    <Box
      borderBottom
      borderBottomColor={theme.accent.brand}
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      borderTop={false}
      flexShrink={0}
      paddingX={1}
      paddingBottom={0}
    >
      <Text bold color={theme.text.inverse} backgroundColor={badgeBg}>
        {" NUVIN "}
      </Text>
      <Text color={theme.accent.brand}>{" ─ "}</Text>
      <Text color={theme.text.default}>{shortenCwd(cwd)}</Text>
      <Text color={theme.text.dim}>{"  /  "}</Text>
      <Text color={theme.accent.modelName}>{modelName}</Text>
      <Text color={theme.text.dim}>{"  /  "}</Text>
      <Text color={theme.accent.approvalMode}>{approvalMode}</Text>
    </Box>
  );
}
