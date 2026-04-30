import type { MessageLine } from '@/adapters/index.js';
import type { ToolExecutionResult } from '@nuvin/nuvin-core';

/**
 * Extracts copyable plain text content from a MessageLine.
 */
export function extractMessageContent(message: MessageLine): string {
  switch (message.type) {
    case 'user':
    case 'assistant':
    case 'thinking':
    case 'error':
    case 'warning':
    case 'info':
    case 'system':
      return message.content;

    case 'tool': {
      const parts: string[] = [];
      const toolCalls = message.metadata?.toolCalls ?? [];
      const toolResultsByCallId = message.metadata?.toolResultsByCallId;

      for (const toolCall of toolCalls) {
        parts.push(`## ${toolCall.function.name}`);

        // Add arguments summary
        try {
          const args = JSON.parse(toolCall.function.arguments);
          parts.push(JSON.stringify(args, null, 2));
        } catch {
          if (toolCall.function.arguments) {
            parts.push(toolCall.function.arguments);
          }
        }

        // Add result if available
        const resultMsg = toolResultsByCallId?.get(toolCall.id);
        const toolResult: ToolExecutionResult | undefined = resultMsg?.metadata?.toolResult;
        if (toolResult?.result) {
          const resultText =
            typeof toolResult.result === 'string'
              ? toolResult.result
              : JSON.stringify(toolResult.result, null, 2);
          parts.push(resultText);
        }
      }

      return parts.join('\n\n');
    }

    case 'tool_result':
      return message.content;

    default:
      return message.content;
  }
}
