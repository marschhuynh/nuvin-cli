import { stripAnsiAndControls } from '@/utils.js';
import type { ToolExecutionResult } from '@nuvin/nuvin-core';

export const parseDetailLines = ({ status, messageContent, toolResult }: { status: string; messageContent?: string; toolResult: ToolExecutionResult }) => {
  let result: string[] = [];

  if (status !== 'success') {
    const errorText = messageContent?.replace(/^error:\s*/i, '').trim();
    result = errorText ? errorText.split(/\r?\n/) : [];
  }

  if (typeof toolResult.result === 'string') {
    const cleaned = stripAnsiAndControls(toolResult.result);
    const trimmed = cleaned.trim();
    result = trimmed ? trimmed.split(/\r?\n/) : [];
  }

  if (toolResult.result && typeof toolResult.result === 'object') {
    result = JSON.stringify(toolResult.result, null, 2).split(/\r?\n/);
  }

  return result.filter((line) => line.trim().length > 0);
};
