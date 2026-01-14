import { useMemo } from 'react';
import type { ToolCall } from '@nuvin/nuvin-core';
import { Box, Text } from 'ink';
import { useStdoutDimensions } from '@/hooks';
import { useTheme } from '@/contexts/ThemeContext';
import type { EnrichedToolCall } from '@/utils/enrichToolCalls.js';

type SkillArgs = {
  name: string;
};

function parseArgs(call: ToolCall): SkillArgs | null {
  try {
    return call.function.arguments ? (JSON.parse(call.function.arguments) as SkillArgs) : null;
  } catch {
    return null;
  }
}

function addLineNumbers(content: string): {
  lines: Array<{ lineNumber: string; content: string }>;
  lineNumberWidth: number;
} {
  if (!content) return { lines: [], lineNumberWidth: 0 };

  const lines = content.split('\n');
  const maxLineNumber = lines.length;
  const lineNumberWidth = maxLineNumber.toString().length;

  return {
    lines: lines.map((line, index) => {
      const lineNumber = (index + 1).toString().padStart(lineNumberWidth, ' ');
      return {
        lineNumber: lineNumber,
        content: line.replace(/\t/g, '  '),
      };
    }),
    lineNumberWidth,
  };
}

export function SkillToolContent({ call }: { call: ToolCall }) {
  const { theme } = useTheme();
  const args = useMemo(() => parseArgs(call), [call]);
  const { cols: width } = useStdoutDimensions();

  const enrichedCall = call as EnrichedToolCall;
  const skillMetadata = enrichedCall.metadata?.skill;

  if (!args) {
    return (
      <Box marginTop={1}>
        <Text color="red">Invalid arguments</Text>
      </Box>
    );
  }

  if (!skillMetadata) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.colors.warning}>Skill not found: {args.name}</Text>
      </Box>
    );
  }

  const { lines, lineNumberWidth } = addLineNumbers(skillMetadata.content);

  return (
    <Box flexDirection="column" marginTop={1} width={width - 8} overflow="hidden">
      {lines.map((line) => (
        <Box key={`${line.lineNumber}-${line.content.slice(0, 20)}`}>
          <Box flexWrap="nowrap" width={lineNumberWidth + 1}>
            <Text dimColor>{line.lineNumber}</Text>
          </Box>
          <Box
            borderStyle={'single'}
            borderDimColor
            backgroundColor={theme.modal.background}
            borderBottom={false}
            borderTop={false}
            borderRight={false}
            marginRight={1}
            paddingLeft={1}
          >
            <Text>{line.content}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
