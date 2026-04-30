import type { MessageLine } from '@/adapters/index.js';

export function estimateMessageHeight(message: MessageLine, width: number): number {
  const contentWidth = Math.max(width - 4, 20);

  switch (message.type) {
    case 'user':
      return estimateTextHeight(message.content, contentWidth) + 1;

    case 'assistant':
      return estimateTextHeight(message.content, contentWidth) + 1;

    case 'thinking':
      return estimateTextHeight(message.content, contentWidth) + 1;

    case 'tool': {
      const toolCalls = message.metadata?.toolCalls?.length || 1;
      return 2 + toolCalls;
    }

    case 'tool_result': {
      const resultContent = message.content;
      const baseHeight = 3;
      const contentHeight = estimateTextHeight(String(resultContent), contentWidth);
      return Math.min(baseHeight + contentHeight, 10);
    }

    case 'system':
    case 'info':
    case 'warning':
    case 'error':
      return estimateTextHeight(message.content, contentWidth) + 1;

    default:
      return 2;
  }
}

function estimateTextHeight(text: string, width: number): number {
  if (!text) return 1;

  const lines = text.split('\n');
  let totalHeight = 0;

  for (const line of lines) {
    const lineLength = stripAnsi(line).length;
    totalHeight += Math.max(1, Math.ceil(lineLength / width));
  }

  return Math.max(1, totalHeight);
}

function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence stripping
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function calculateTotalHeight(messages: MessageLine[], width: number): number {
  return messages.reduce((total, msg) => total + estimateMessageHeight(msg, width), 0);
}
