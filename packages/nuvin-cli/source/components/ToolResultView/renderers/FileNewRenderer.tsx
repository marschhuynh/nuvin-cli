import type React from 'react';
import { Box } from 'ink';
import type { ToolExecutionResult, ToolCall } from '@nuvin/nuvin-core';
import { Markdown } from '@/components/Markdown.js';
import { useStdoutDimensions } from '@/hooks/index.js';

type FileNewRendererProps = {
  toolResult: ToolExecutionResult;
  toolCall?: ToolCall;
  messageId?: string;
  messageContent?: string;
  messageColor?: string;
  fullMode?: boolean;
};

export const FileNewRenderer: React.FC<FileNewRendererProps> = ({ toolResult, toolCall, fullMode = false }) => {
  const [cols] = useStdoutDimensions();

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

  return (
    <Box flexDirection="column" width={cols - 10}>
      <Markdown>{fileContent}</Markdown>
    </Box>
  );
};
