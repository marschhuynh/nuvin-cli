import type { AgentConfig } from './ports.js';
import type { CompleteAgent } from './agent-types.js';

/**
 * Merges a main agent configuration with a sub-agent configuration.
 *
 * Merging rules:
 * - `systemPrompt`: Always from sub-agent (even if empty string)
 * - `enabledTools`: Sub-agent tools if specified and non-empty, otherwise main config
 * - `id`: Prefixed with 'swapped-'
 * - All other fields: Use nullish coalescing (??) to fallback to main config values
 *
 * @param mainConfig - The primary agent configuration
 * @param agentTemplate - The sub-agent configuration to merge in (optional)
 * @returns Merged configuration with sub-agent values taking precedence
 */
export function mergeAgentConfig(
  mainConfig: AgentConfig,
  agentTemplate: CompleteAgent,
): AgentConfig {
  // agentTemplate has 'tools' not 'enabledTools'
  const hasNonEmptySubTools = Array.isArray(agentTemplate.tools) && agentTemplate.tools.length > 0;

  return {
    // id is prefixed with 'swapped-'
    id: `swapped-${agentTemplate.id}`,

    // systemPrompt always comes from sub-agent (even if empty string)
    systemPrompt: agentTemplate.systemPrompt,

    // enabledTools: sub-agent tools if specified and non-empty, otherwise main config
    enabledTools: hasNonEmptySubTools ? agentTemplate.tools : mainConfig.enabledTools,

    // All other fields use nullish coalescing to fallback to main config
    // CompleteAgent doesn't have maxToolConcurrency, requireToolApproval, etc.
    // Those are AgentConfig-specific fields that come from mainConfig
    topP: agentTemplate.topP ?? mainConfig.topP,
    model: agentTemplate.model ?? mainConfig.model,
    temperature: agentTemplate.temperature ?? mainConfig.temperature,
    maxTokens: agentTemplate.maxTokens ?? mainConfig.maxTokens,
    maxToolConcurrency: mainConfig.maxToolConcurrency,
    requireToolApproval: mainConfig.requireToolApproval,
    reasoningEffort: mainConfig.reasoningEffort,
    thinking: mainConfig.thinking,
  };
}
