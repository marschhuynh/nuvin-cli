import type { AgentConfig } from './ports.js';
import type { CompleteAgent } from './agent-types.js';

export function mergeAgentConfig(mainConfig: AgentConfig, agentTemplate: CompleteAgent): AgentConfig {
  const hasNonEmptySubTools = Array.isArray(agentTemplate.allowed_tools) && agentTemplate.allowed_tools.length > 0;

  return {
    id: `swapped-${agentTemplate.name}`,
    systemPrompt: agentTemplate.instructions,
    enabledTools: hasNonEmptySubTools ? agentTemplate.allowed_tools : mainConfig.enabledTools,
    topP: agentTemplate.top_p ?? mainConfig.topP,
    model: agentTemplate.model ?? mainConfig.model,
    temperature: agentTemplate.temperature ?? mainConfig.temperature,
    maxTokens: agentTemplate.max_tokens ?? mainConfig.maxTokens,
    maxToolConcurrency: mainConfig.maxToolConcurrency,
    requireToolApproval: mainConfig.requireToolApproval,
    reasoningEffort: mainConfig.reasoningEffort,
    thinking: mainConfig.thinking,
  };
}
