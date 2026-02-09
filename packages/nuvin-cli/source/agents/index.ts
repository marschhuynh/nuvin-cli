import { parse } from 'yaml';
import type { AgentTemplate } from '@nuvin/nuvin-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read markdown files at runtime (works in both dev and bundled)
function readAgentFile(filename: string): string {
  try {
    return readFileSync(join(__dirname, '../builtin-agents', filename), 'utf-8');
  } catch {
    // Fallback for bundled version - files are inlined
    return '';
  }
}

// Load built-in agent from the agents directory (for main nuvin agent)
function loadBuiltinAgent(filename: string): AgentTemplate {
  const content = readFileSync(join(__dirname, filename), 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    throw new Error(`Invalid agent file format: ${filename}`);
  }
  
  const frontmatter = parse(frontmatterMatch[1]) as Record<string, unknown>;
  const instructions = frontmatterMatch[2].trim();
  
  return {
    instructions,
    name: typeof frontmatter.name === 'string' ? frontmatter.name : undefined,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    allowed_tools: Array.isArray(frontmatter.allowed_tools)
      ? frontmatter.allowed_tools.filter((t): t is string => typeof t === 'string')
      : undefined,
    model: typeof frontmatter.model === 'string' ? frontmatter.model : undefined,
    disable_model_invocation:
      typeof frontmatter.disable_model_invocation === 'boolean' ? frontmatter.disable_model_invocation : undefined,
    user_invocable: typeof frontmatter.user_invocable === 'boolean' ? frontmatter.user_invocable : undefined,
    context: frontmatter.context === 'fork' ? 'fork' : undefined,
    agent: typeof frontmatter.agent === 'string' ? frontmatter.agent : undefined,
    hooks: typeof frontmatter.hooks === 'object' && frontmatter.hooks !== null ? (frontmatter.hooks as Record<string, unknown>) : undefined,
    argument_hint: typeof frontmatter.argument_hint === 'string' ? frontmatter.argument_hint : undefined,
    temperature: typeof frontmatter.temperature === 'number' ? frontmatter.temperature : undefined,
    top_p: typeof frontmatter.top_p === 'number' ? frontmatter.top_p : undefined,
    max_tokens: typeof frontmatter.max_tokens === 'number' ? frontmatter.max_tokens : undefined,
  };
}

const codeReviewerMd = readAgentFile('code-reviewer.md');
const integrationTestEngineerMd = readAgentFile('integration-test-engineer.md');
const softwareEngineerMd = readAgentFile('software-engineer.md');
const testCaseCounterMd = readAgentFile('test-case-counter.md');
const explorerMd = readAgentFile('explorer.md');

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
  loadBuiltinAgent('nuvin-agent.md'),
  parseAgent(codeReviewerMd as string),
  parseAgent(integrationTestEngineerMd as string),
  parseAgent(softwareEngineerMd as string),
  parseAgent(testCaseCounterMd as string),
  parseAgent(explorerMd as string),
];
