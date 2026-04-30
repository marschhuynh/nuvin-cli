import type {
  AnthropicThinkingConfig,
  AutoReasoningEffort,
  OpenAiReasoningConfig,
  ReasoningConfig,
} from "./types.ts";

const ANTHROPIC_AUTO_BUDGET_TOKENS: Record<AutoReasoningEffort, number> = {
  low: 1024,
  medium: 2048,
  high: 4096,
};

export function mapAutoReasoningEffortToBudgetTokens(effort: AutoReasoningEffort): number {
  return ANTHROPIC_AUTO_BUDGET_TOKENS[effort];
}

export function resolveAnthropicThinkingConfig(
  reasoning: ReasoningConfig | undefined,
): AnthropicThinkingConfig | undefined {
  if (!reasoning) {
    return undefined;
  }

  if (reasoning.anthropic) {
    return structuredClone(reasoning.anthropic);
  }

  if (!reasoning.auto) {
    return undefined;
  }

  return {
    type: "enabled",
    budgetTokens: mapAutoReasoningEffortToBudgetTokens(reasoning.auto.effort),
  };
}

export function resolveOpenAiReasoningConfig(
  reasoning: ReasoningConfig | undefined,
): OpenAiReasoningConfig | undefined {
  if (!reasoning) {
    return undefined;
  }

  const autoConfig = reasoning.auto ? { effort: reasoning.auto.effort } : undefined;

  if (!reasoning.openai) {
    return autoConfig;
  }

  return {
    ...(autoConfig ?? {}),
    ...structuredClone(reasoning.openai),
  };
}
