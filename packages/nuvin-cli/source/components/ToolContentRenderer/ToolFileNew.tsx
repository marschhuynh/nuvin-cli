import { useMemo } from 'react';
import type { ToolCall } from '@nuvin/nuvin-core';
import { Box, Text } from 'ink';
import { useStdoutDimensions } from '@/hooks';

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

  const lines = args.content.split('\n');
  const maxLineNumberWidth = String(lines.length).length;

  return (
    <Box flexDirection="column" marginTop={1} width={width - 10}>
      {lines.map((line, index) => (
        <Box key={`line-${index}-${line}`} flexDirection="row">
          <Text dimColor>{String(index + 1).padStart(maxLineNumberWidth, ' ')}│ </Text>
          <Text>{line}</Text>
        </Box>
      ))}
    </Box>
  );
}
