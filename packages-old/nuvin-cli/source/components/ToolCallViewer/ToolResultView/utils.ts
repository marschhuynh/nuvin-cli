import { stripAnsiAndControls, type ToolExecutionResult } from '@nuvin/nuvin-core';

const stripSystemReminder = (text: string): string => {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
};

/**
 * Normalize tab characters to spaces for consistent rendering in Ink/Yoga.
 * Tabs have variable display width which can cause layout miscalculations.
 */
const normalizeTabs = (text: string, tabWidth = 4): string => {
  return text.replace(/\t/g, ' '.repeat(tabWidth));
};

export const parseDetailLines = ({
  status,
  messageContent,
  toolResult,
}: {
  status: string;
  messageContent?: string;
  toolResult: ToolExecutionResult;
}) => {
  let result: string[] = [];

  if (status !== 'success') {
    const errorText = messageContent?.replace(/^error:\s*/i, '').trim();
    result = errorText ? errorText.split(/\r?\n/) : [];
  }

  if (toolResult.type === 'text') {
    const textResult = toolResult.result as string;
    const cleaned = stripAnsiAndControls(textResult);
    const withoutReminder = stripSystemReminder(cleaned);
    const normalized = normalizeTabs(withoutReminder);
    const trimmed = normalized.trim();
    result = trimmed ? trimmed.split(/\r?\n/) : [];
  } else if (toolResult.type === 'json') {
    result = JSON.stringify(toolResult.result, null, 2).split(/\r?\n/);
  }

  return result.filter((line) => line.trim().length > 0);
};
