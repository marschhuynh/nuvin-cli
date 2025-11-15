import type { Message, ToolCall } from '@nuvin/nuvin-core';
import type { BashOperation } from './types.js';

export function extractBashCommand(toolCall: ToolCall): string | null {
  try {
    const args = JSON.parse(toolCall.function.arguments) as { cmd?: string };
    return args.cmd || null;
  } catch {
    return null;
  }
}

export function analyzeBashOperations(messages: Message[]): BashOperation[] {
  const bashOps: BashOperation[] = [];

  messages.forEach((msg) => {
    if (msg.tool_calls) {
      msg.tool_calls.forEach((tc) => {
        if (tc.function.name !== 'bash_tool') return;

        const command = extractBashCommand(tc);
        if (!command) return;

        const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
        const toolResultMsg = messages.find((m) => m.role === 'tool' && m.tool_call_id === tc.id);

        bashOps.push({
          command,
          timestamp,
          message: msg,
          toolResultMessage: toolResultMsg || null,
        });
      });
    }
  });

  return bashOps;
}

export function isStaleBashCommand(bashOp: BashOperation, allBashOps: BashOperation[]): boolean {
  const laterSameCommand = allBashOps.filter((op) => op.command === bashOp.command && op.timestamp > bashOp.timestamp);

  return laterSameCommand.length > 0;
}

export function hasErrors(toolResult: Message): boolean {
  const content = typeof toolResult.content === 'string' ? toolResult.content : '';
  const contentLower = content.toLowerCase();

  const errorPatterns = [
    /error:/i,
    /failed/i,
    /exception/i,
    /command not found/i,
    /permission denied/i,
    /no such file/i,
    /cannot/i,
    /fatal:/i,
  ];

  return errorPatterns.some((pattern) => pattern.test(contentLower));
}
