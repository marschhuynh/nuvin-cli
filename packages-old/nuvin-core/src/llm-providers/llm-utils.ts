import type { ProviderContentPart, ToolCall } from '../ports.js';

export function mergeChoices(
  choices:
    | Array<
        | {
            message?: {
              content?: string | null | ProviderContentPart[];
              tool_calls?: ToolCall[];
              [key: string]: unknown;
            };
          }
        | undefined
      >
    | undefined,
): { content: string; tool_calls?: ToolCall[]; [key: string]: unknown } {
  const contentParts: string[] = [];
  const mergedToolCalls: ToolCall[] = [];
  const extraFields: Record<string, unknown> = {};

  const collectText = (value: string | null | ProviderContentPart[] | undefined) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) contentParts.push(trimmed);
      return;
    }

    if (Array.isArray(value)) {
      for (const part of value) {
        if (part?.type === 'text') {
          const trimmed = part.text.trim();
          if (trimmed) contentParts.push(trimmed);
        }
      }
    }
  };

  for (const ch of choices || []) {
    const msg = ch?.message;
    if (!msg) continue;
    collectText(msg.content);
    if (Array.isArray(msg.tool_calls)) mergedToolCalls.push(...msg.tool_calls);

    const knownKeys = ['content', 'tool_calls', 'role'];
    for (const key of Object.keys(msg)) {
      if (!knownKeys.includes(key)) {
        extraFields[key] = msg[key];
      }
    }
  }

  const content = contentParts.join('\n\n');
  const tool_calls = mergedToolCalls.length ? mergedToolCalls : undefined;

  return {
    content,
    ...(tool_calls ? { tool_calls } : {}),
    ...extraFields,
  };
}
