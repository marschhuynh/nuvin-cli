import type React from 'react';
import { Box } from 'ink';
import { type ToolExecutionResult, type ToolCall, isFileEditSuccess } from '@nuvin/nuvin-core';
import { FileDiffView, type LineNumbers } from '@/components/FileDiffView.js';

type FileEditRendererProps = {
  toolResult: ToolExecutionResult;
  toolCall?: ToolCall;
  messageId?: string;
  fullMode?: boolean;
};

type FileEditMetadata = {
  path?: string;
  oldTextLength?: number;
  newTextLength?: number;
  bytesWritten?: number;
  lineNumbers?: LineNumbers;
};

export const FileEditRenderer: React.FC<FileEditRendererProps> = ({ toolResult, toolCall }) => {
  // Parse tool call arguments
  let args: {
    file_path?: string;
    old_text?: string;
    new_text?: string;
  } | null = null;

  try {
    args = toolCall?.function.arguments ? JSON.parse(toolCall.function.arguments) : null;
  } catch {
    args = null;
  }

  if (!isFileEditSuccess(toolResult)) {
    return null;
  }

  const resultMetadata = toolResult.metadata as FileEditMetadata | undefined;

  // Check if we have the necessary data (allow empty strings for new_text - it could be a deletion)
  if (!args || args.old_text === undefined || args.new_text === undefined) {
    return null;
  }

  const lineNumbers = resultMetadata?.lineNumbers;

  return (
    <Box flexDirection="column">
      <FileDiffView
        blocks={[{ search: args.old_text, replace: args.new_text }]}
        filePath={resultMetadata?.path || args.file_path}
        showPath={false}
        lineNumbers={lineNumbers}
      />
    </Box>
  );
};
