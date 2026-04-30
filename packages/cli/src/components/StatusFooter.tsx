import { Box, Text } from "@nuvin/ink";
import { useEffect, useState } from "react";

type StatusFooterProps = {
  hint?: string;
};

const DEFAULT_HINT = "↑↓ history · / commands · esc abort · ctrl+c exit · ⇧drag=select";
const MEBIBYTE = 1024 * 1024;
const MEMORY_REFRESH_INTERVAL_MS = 1000;

function formatMegabytes(bytes: number): string {
  return `${(bytes / MEBIBYTE).toFixed(1)} MB`;
}

function getAppMemoryUsage(): string {
  const mem = process.memoryUsage();
  return `App ${formatMegabytes(mem.rss)} RSS · ${formatMegabytes(mem.heapUsed)} heap`;
}

export function StatusFooter({ hint = DEFAULT_HINT }: StatusFooterProps) {
  const [memoryUsage, setMemoryUsage] = useState(() => getAppMemoryUsage());

  useEffect(() => {
    const interval = setInterval(() => {
      setMemoryUsage(getAppMemoryUsage());
    }, MEMORY_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <Box flexShrink={0} paddingX={2}>
      <Text dimColor>{hint}</Text>
      <Text dimColor>{" · "}</Text>
      <Text dimColor>{memoryUsage}</Text>
    </Box>
  );
}
