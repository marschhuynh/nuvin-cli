import type React from 'react';
import { Box, Text } from 'ink';
import { type ToolExecutionResult, ErrorReason } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';
import { parseDetailLines } from '@/components/ToolResultView/utils.js';
import { LAYOUT, TRUNCATION } from './constants.js';

export type TruncationMode = 'head' | 'tail';

// Error reasons that should use warning (yellow) color instead of error (red)
const warningReasons = new Set([
  ErrorReason.Aborted,
  ErrorReason.Denied,
  ErrorReason.Edited,
  ErrorReason.Timeout,
  ErrorReason.RateLimit,
  ErrorReason.ValidationFailed,
]);

export type BaseRendererProps = {
  toolResult: ToolExecutionResult;
  messageId?: string;
  messageContent?: string;
  messageColor?: string;
  fullMode?: boolean;
  cols: number;
  maxLines?: number;
  maxLineLength?: number;
  truncationMode?: TruncationMode;
};

const truncateLine = (line: string, maxLength: number, fullMode: boolean): string => {
  if (fullMode || line.length <= maxLength) return line;
  return `${line.slice(0, maxLength)}... (${line.length - maxLength} more chars)`;
};

export const BaseRenderer: React.FC<BaseRendererProps> = ({
  toolResult,
  messageId,
  messageContent,
  messageColor,
  fullMode = false,
  cols,
  maxLines = TRUNCATION.DEFAULT_MAX_LINES,
  maxLineLength = TRUNCATION.DEFAULT_MAX_LINE_LENGTH,
  truncationMode = 'head',
}) => {
  const { theme } = useTheme();

  const errorReason = (toolResult.metadata as { errorReason?: ErrorReason } | undefined)?.errorReason;
  const isWarning = errorReason && warningReasons.has(errorReason);
  const statusColor =
    toolResult.status === 'success' ? theme.tokens.gray : isWarning ? theme.colors.warning : theme.tokens.red;
  const detailColor = messageColor ?? statusColor;
  const linesToRender = parseDetailLines({ status: toolResult.status, messageContent, toolResult });

  if (linesToRender.length === 0) return null;

  const effectiveMaxLines = fullMode ? Number.POSITIVE_INFINITY : maxLines;
  const effectiveMaxLineLength = fullMode ? Number.POSITIVE_INFINITY : maxLineLength;

  const linesToShow =
    truncationMode === 'tail' ? linesToRender.slice(-effectiveMaxLines) : linesToRender.slice(0, effectiveMaxLines);

  const skippedLines = fullMode ? 0 : linesToRender.length - linesToShow.length;
  const showSkippedAtTop = truncationMode === 'tail' && skippedLines > 0;
  const showSkippedAtBottom = truncationMode === 'head' && skippedLines > 0;

  return (
    <Box flexDirection="column" width={cols - LAYOUT.CONTENT_MARGIN}>
      {showSkippedAtTop && (
        <Text dimColor color={theme.colors.muted}>
          ... ({skippedLines} more lines)
        </Text>
      )}
      {linesToShow.map((line, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: no other choice
        <Text key={`${messageId}-line-${idx}`} dimColor color={detailColor}>
          {truncateLine(line, effectiveMaxLineLength, fullMode)}
        </Text>
      ))}
      {showSkippedAtBottom && (
        <Text dimColor color={theme.colors.muted}>
          ... ({skippedLines} more lines)
        </Text>
      )}
    </Box>
  );
};
