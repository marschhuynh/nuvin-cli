import { useMemo } from 'react';
import type { ToolCall } from '@nuvin/nuvin-core';
import { Box, Text } from 'ink';
import { useStdoutDimensions } from '@/hooks';
import { Markdown } from '@/components/Markdown.js';

type FileNewArgs = {
  file_path: string;
  content: string;
};

function parseArgs(call: ToolCall): FileNewArgs | null {
  try {
    return call.function.arguments ? (JSON.parse(call.function.arguments) as FileNewArgs) : null;
  } catch {
    return null;
  }
}

export function FileNewToolContent({ call }: { call: ToolCall }) {
  const args = useMemo(() => parseArgs(call), [call]);
  const [width] = useStdoutDimensions();

  if (!args)
    return (
      <Box marginTop={1}>
        <Text color="red">Invalid arguments</Text>
      </Box>
    );

  return (
    <Box flexDirection="column" marginTop={1} width={width - 10}>
      <Markdown>{args.content}</Markdown>
    </Box>
  );
}
