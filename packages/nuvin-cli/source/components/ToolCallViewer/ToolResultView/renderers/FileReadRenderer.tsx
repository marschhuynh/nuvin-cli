import type React from 'react';
import { Box, Text } from 'ink';
import { type ToolExecutionResult, isFileReadSuccess } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';
import { LAYOUT } from './constants.js';

type FileReadRendererProps = {
  toolResult: ToolExecutionResult;
  messageId?: string;
  messageContent?: string;
  messageColor?: string;
  fullMode?: boolean;
  cols: number;
};

export const FileReadRenderer: React.FC<FileReadRendererProps> = ({
  toolResult,
  messageId,
  messageColor,
  fullMode = false,
  cols,
}) => {
  const { theme } = useTheme();

  const statusColor = toolResult.status === 'success' ? theme.tokens.gray : theme.tokens.red;
  const detailColor = messageColor ?? statusColor;

  if (isFileReadSuccess(toolResult)) {
    if (!fullMode) {
      return null;
    }

    const linesToRender = toolResult.result.split(/\r?\n/);
    return (
      <Box flexDirection="column" width={cols - LAYOUT.CONTENT_MARGIN}>
        {linesToRender.map((line, idx) => (
          <Text key={`${messageId}-line-${idx}`} dimColor color={detailColor}>
            {line}
          </Text>
        ))}
      </Box>
    );
  }

  return null;
};
