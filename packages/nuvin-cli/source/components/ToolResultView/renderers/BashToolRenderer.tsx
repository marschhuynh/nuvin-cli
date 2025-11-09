import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolExecutionResult } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';
import { parseDetailLines } from '@/components/ToolResultView/utils.js';
import { useStdoutDimensions } from '@/hooks/index.js';

type BashToolRendererProps = {
  toolResult: ToolExecutionResult;
  messageId?: string;
  messageContent?: string;
  messageColor?: string;
};

export const BashToolRenderer: React.FC<BashToolRendererProps> = ({
  toolResult,
  messageId,
  messageContent,
  messageColor,
}) => {
  const { theme } = useTheme();
  const [cols] = useStdoutDimensions();

  const statusColor = toolResult.status === 'success' ? theme.tokens.gray : theme.tokens.red;
  const detailColor = messageColor ?? statusColor;
  const linesToRender = parseDetailLines({ status: toolResult.status, messageContent, toolResult });
  const maxLines = 20;
  const maxLineLength = 200;

  if (linesToRender.length === 0) return null;

  const truncateLine = (line: string): string => {
    if (line.length <= maxLineLength) return line;
    return `${line.slice(0, maxLineLength)}... (${line.length - maxLineLength} more chars)`;
  };

  return (
    <Box flexDirection="column" width={cols - 10}>
      {linesToRender.slice(0, maxLines).map((line, idx) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: <have to use index as key>
          key={`${messageId}-tool-result-${line}-${idx}`}
          dimColor
          color={detailColor}
        >
          {truncateLine(line)}
        </Text>
      ))}
      {linesToRender.length > maxLines && (
        <Text dimColor color={theme.colors.muted}>
          ... ({linesToRender.length - maxLines} more lines)
        </Text>
      )}
    </Box>
  );
};
