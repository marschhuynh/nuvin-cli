import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { ToolCall } from '@nuvin/nuvin-core';
import { FileDiffView, type LineNumbers } from '@/components/FileDiffView.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { EnrichedToolCall } from '@/utils/enrichToolCalls.js';

type FileEditArgs = {
  file_path: string;
  old_text: string;
  new_text: string;
  dry_run?: boolean;
};

function parseArgs(call: ToolCall): FileEditArgs | null {
  try {
    if (!call.function.arguments) return null;
    const parsed = JSON.parse(call.function.arguments) as Partial<FileEditArgs>;
    // Validate required fields - old_text and new_text must be strings (can be empty)
    if (typeof parsed.old_text !== 'string' || typeof parsed.new_text !== 'string') {
      return null;
    }
    return parsed as FileEditArgs;
  } catch {
    return null;
  }
}

export function FileEditToolContent({ call }: { call: ToolCall }) {
  const { theme } = useTheme();
  const args = useMemo(() => parseArgs(call), [call]);
  const lineNumbers = (call as EnrichedToolCall).metadata?.lineNumbers as LineNumbers | undefined;
  const blocks = useMemo(
    () => (args ? [{ search: args.old_text, replace: args.new_text }] : []),
    [args],
  );

  if (!args)
    return (
      <Box marginTop={1}>
        <Text color={theme.colors.error}>Invalid arguments</Text>
      </Box>
    );

  return (
    <FileDiffView
      blocks={blocks}
      filePath={args.file_path}
      lineNumbers={lineNumbers}
    />
  );
}
