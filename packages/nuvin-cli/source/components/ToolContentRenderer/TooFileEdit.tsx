import { useMemo } from 'react';
import type { ToolCall } from '@nuvin/nuvin-core';
import { Box, Text } from 'ink';
import { FileDiffView, type LineNumbers } from '@/components/FileDiffView.js';
import type { EnrichedToolCall } from '@/utils/enrichToolCalls.js';
import { useStdoutDimensions } from '@/hooks/index.js';

type FileEditArgs = {
  file_path: string;
  old_text: string;
  new_text: string;
  dry_run?: boolean;
};

function parseArgs(call: ToolCall): FileEditArgs | null {
  try {
    return call.function.arguments ? (JSON.parse(call.function.arguments) as FileEditArgs) : null;
  } catch {
    return null;
  }
}

export function FileEditToolContent({ call }: { call: ToolCall }) {
  const [width] = useStdoutDimensions();
  const args = useMemo(() => parseArgs(call), [call]);
  const lineNumbers = (call as EnrichedToolCall).metadata?.lineNumbers as LineNumbers | undefined;

  if (!args)
    return (
      <Box marginTop={1}>
        <Text color="red">Invalid arguments</Text>
      </Box>
    );

  return (
    <Box flexDirection="column" width={width - 10}>
      <FileDiffView
        blocks={[{ search: args.old_text, replace: args.new_text }]}
        filePath={args.file_path}
        lineNumbers={lineNumbers}
        showPath={false}
      />
    </Box>
  );
}
