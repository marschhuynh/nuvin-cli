import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolExecutionResult, ToolCall } from '@nuvin/nuvin-core';
import { LAYOUT } from './constants.js';

type FileNewRendererProps = {
  toolResult: ToolExecutionResult;
  toolCall?: ToolCall;
  messageId?: string;
  messageContent?: string;
  messageColor?: string;
  fullMode?: boolean;
  cols: number;
};

function addLineNumbers(content: string): Array<{ lineNumber: string; content: string }> {
  if (!content) return [];

  const lines = content.split('\n');
  const maxLineNumber = lines.length;
  const lineNumberWidth = maxLineNumber.toString().length;

  return lines.map((line, index) => {
    const lineNumber = (index + 1).toString().padStart(lineNumberWidth, ' ');
    return {
      lineNumber: `${lineNumber} | `,
      content: line.replace(/\t/g, '  '),
    };
  });
}

export const FileNewRenderer: React.FC<FileNewRendererProps> = ({ toolResult, toolCall, fullMode = false, cols }) => {
  if (!fullMode || toolResult.status !== 'success') {
    return null;
  }

  let args: {
    content?: string;
  } | null = null;

  try {
    args = toolCall?.function.arguments ? JSON.parse(toolCall.function.arguments) : null;
  } catch {
    args = null;
  }

  const fileContent = args?.content || '';

  if (!fileContent) {
    return null;
  }

  const linesWithNumbers = addLineNumbers(fileContent);

  return (
    <Box flexDirection="column" width={cols - LAYOUT.CONTENT_MARGIN}>
      {linesWithNumbers.map((line, idx) => (
        <Box key={`${idx}-${line.content.slice(0, 20)}`}>
          <Text dimColor>{line.lineNumber}</Text>
          <Text>{line.content}</Text>
        </Box>
      ))}
    </Box>
  );
};
