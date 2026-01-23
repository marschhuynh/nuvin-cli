import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse, stringify } from 'yaml';
import type { AgentTemplate, AgentFrontmatter } from './agent-types.js';

export interface AgentFilePersistenceOptions {
  agentsDir: string;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (frontmatterMatch) {
    const frontmatter = parse(frontmatterMatch[1]) || {};
    const body = frontmatterMatch[2].trim();
    return { frontmatter, body };
  }
  return { frontmatter: {}, body: content.trim() };
}

function buildSkillContent(frontmatter: Record<string, unknown>, instructions: string): string {
  const yamlPart = stringify(frontmatter, { lineWidth: 0, indent: 2 });
  return `---\n${yamlPart}---\n\n${instructions}`;
}

export class AgentFilePersistence {
  private agentsDir: string;

  constructor(options: AgentFilePersistenceOptions) {
    this.agentsDir = options.agentsDir;
  }

  private ensureAgentsDir(): void {
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
    }
  }

  async loadAll(): Promise<AgentTemplate[]> {
    const agents: AgentTemplate[] = [];

    try {
      this.ensureAgentsDir();

      if (!fs.existsSync(this.agentsDir)) {
        return agents;
      }

      const files = fs.readdirSync(this.agentsDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      for (const file of mdFiles) {
        try {
          const agent = await this.load(file);
          if (agent) {
            agents.push(agent);
          }
        } catch (error) {
          console.warn(`Failed to load agent from ${file}:`, error);
        }
      }
    } catch (_error) {}

    return agents;
  }

  async load(filename: string): Promise<AgentTemplate | null> {
    try {
      const filePath = path.join(this.agentsDir, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(content);

      const fm = frontmatter as Record<string, unknown>;

      if (!body || typeof body !== 'string') {
        console.warn(`Invalid agent template in ${filename}: missing instructions`);
        return null;
      }

      const template: AgentTemplate = {
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
      };

      return template;
    } catch (error) {
      console.warn(`Failed to load agent from ${filename}:`, error);
      return null;
    }
  }

  async save(agent: AgentTemplate): Promise<void> {
    this.ensureAgentsDir();

    if (!agent.instructions) {
      throw new Error('Cannot save agent: instructions are required');
    }

    const id = agent.name || `agent-${Date.now()}`;
    const filename = `${this.sanitizeFilename(id)}.md`;
    const filePath = path.join(this.agentsDir, filename);

    const frontmatter: AgentFrontmatter = {
      name: agent.name,
      description: agent.description,
      allowed_tools: agent.allowed_tools,
      model: agent.model,
      disable_model_invocation: agent.disable_model_invocation,
      user_invocable: agent.user_invocable,
      context: agent.context,
      agent: agent.agent,
      hooks: agent.hooks,
      argument_hint: agent.argument_hint,
    };

    Object.keys(frontmatter).forEach((key) => {
      const k = key as keyof AgentFrontmatter;
      if (frontmatter[k] === undefined) {
        delete frontmatter[k];
      }
    });

    const content = buildSkillContent(frontmatter as Record<string, unknown>, agent.instructions);

    fs.writeFileSync(filePath, content, 'utf8');
  }

  async delete(agentId: string): Promise<void> {
    const filename = `${this.sanitizeFilename(agentId)}.md`;
    const filePath = path.join(this.agentsDir, filename);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      throw new Error(`Failed to delete agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  exists(agentId: string): boolean {
    const filename = `${this.sanitizeFilename(agentId)}.md`;
    const filePath = path.join(this.agentsDir, filename);
    return fs.existsSync(filePath);
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  getAgentsDir(): string {
    return this.agentsDir;
  }
}
