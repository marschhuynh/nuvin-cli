import { parse } from 'yaml';
import type { AgentTemplate } from '@nuvin/nuvin-core';

import nuvinAgentMd from './nuvin-agent.md';
import codeReviewerMd from '../builtin-agents/code-reviewer.md';
import softwareEngineerMd from '../builtin-agents/software-engineer.md';
import explorerMd from '../builtin-agents/explore.md';

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (frontmatterMatch) {
    const frontmatter = parse(frontmatterMatch[1]) || {};
    const body = frontmatterMatch[2].trim();
    return { frontmatter, body };
  }
  return { frontmatter: {}, body: content.trim() };
}

function parseAgent(content: string): AgentTemplate {
  const { frontmatter, body } = parseFrontmatter(content);
  const fm = frontmatter as Record<string, unknown>;

  return {
    instructions: body,
    name: typeof fm.name === 'string' ? fm.name : undefined,
    description: typeof fm.description === 'string' ? fm.description : undefined,
    allowed_tools: Array.isArray(fm.allowed_tools)
      ? fm.allowed_tools.filter((t): t is string => typeof t === 'string')
      : undefined,
    model: typeof fm.model === 'string' ? fm.model : undefined,
    disable_model_invocation:
      typeof fm.disable_model_invocation === 'boolean' ? fm.disable_model_invocation : undefined,
    user_invocable: typeof fm.user_invocable === 'boolean' ? fm.user_invocable : undefined,
    context: fm.context === 'fork' ? 'fork' : undefined,
    agent: typeof fm.agent === 'string' ? fm.agent : undefined,
    hooks: typeof fm.hooks === 'object' && fm.hooks !== null ? (fm.hooks as Record<string, unknown>) : undefined,
    argument_hint: typeof fm.argument_hint === 'string' ? fm.argument_hint : undefined,
    temperature: typeof fm.temperature === 'number' ? fm.temperature : undefined,
    top_p: typeof fm.top_p === 'number' ? fm.top_p : undefined,
    max_tokens: typeof fm.max_tokens === 'number' ? fm.max_tokens : undefined,
  };
}

export const builtinAgents: AgentTemplate[] = [
  parseAgent(nuvinAgentMd),
  parseAgent(codeReviewerMd),
  parseAgent(softwareEngineerMd),
  parseAgent(explorerMd),
];
