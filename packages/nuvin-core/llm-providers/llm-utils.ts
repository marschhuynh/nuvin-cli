import type { ProviderContentPart, ToolCall, UsageData } from '../ports.js';

// Merge provider choices into a single content string and combined tool_calls
export function mergeChoices(
  choices:
    | Array<{ message?: { content?: string | null | ProviderContentPart[]; tool_calls?: ToolCall[] } } | undefined>
    | undefined,
): { content: string; tool_calls?: ToolCall[] } {
  const contentParts: string[] = [];
  const mergedToolCalls: ToolCall[] = [];

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
  }

  const content = contentParts.join('\n\n');
  const tool_calls = mergedToolCalls.length ? mergedToolCalls : undefined;
  return { content, ...(tool_calls ? { tool_calls } : {}) } as { content: string; tool_calls?: ToolCall[] };
}

// Normalize usage data across providers (e.g., input/output vs prompt/completion)
export function normalizeUsage(
  usage?: (Partial<UsageData> & { input_tokens?: number; output_tokens?: number }) | null,
): UsageData | undefined {
  if (!usage) return undefined;
  const usageObj = usage as Record<string, unknown>;
  const prompt_tokens =
    usage.prompt_tokens ?? (typeof usageObj.input_tokens === 'number' ? usageObj.input_tokens : undefined);
  const completion_tokens =
    usage.completion_tokens ?? (typeof usageObj.output_tokens === 'number' ? usageObj.output_tokens : undefined);
  const total_tokens =
    usage.total_tokens ??
    (prompt_tokens != null && completion_tokens != null ? prompt_tokens + completion_tokens : undefined);

  return {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    ...(usage.reasoning_tokens !== undefined && { reasoning_tokens: usage.reasoning_tokens }),
    ...(usage.prompt_tokens_details && { prompt_tokens_details: usage.prompt_tokens_details }),
    ...(usage.completion_tokens_details && { completion_tokens_details: usage.completion_tokens_details }),
    ...(usage.cost !== undefined && { cost: usage.cost }),
    ...(usage.cost_details && { cost_details: usage.cost_details }),
  };
}
