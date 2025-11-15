import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse, stringify } from 'yaml';
import type { AgentTemplate } from './agent-types.js';

export interface AgentFilePersistenceOptions {
  agentsDir: string; // Directory where agent YAML files are stored
}

/**
 * AgentFilePersistence - handles loading and saving agents to YAML files
 */
export class AgentFilePersistence {
  private agentsDir: string;

  constructor(options: AgentFilePersistenceOptions) {
    this.agentsDir = options.agentsDir;
  }

  /**
   * Ensure agents directory exists
   */
  private ensureAgentsDir(): void {
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
    }
  }

  /**
   * Load all agents from the agents directory
   */
  async loadAll(): Promise<AgentTemplate[]> {
    this.ensureAgentsDir();

    const agents: AgentTemplate[] = [];

    try {
      const files = fs.readdirSync(this.agentsDir);
      const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

      for (const file of yamlFiles) {
        try {
          const agent = await this.load(file);
          if (agent) {
            agents.push(agent);
          }
        } catch (error) {
          console.warn(`Failed to load agent from ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to read agents directory:', error);
    }

    return agents;
  }

  /**
   * Load a single agent from a YAML file
   */
  async load(filename: string): Promise<AgentTemplate | null> {
    try {
      const filePath = path.join(this.agentsDir, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = parse(content);

      // Validate that data is an object and systemPrompt exists (only required field)
      if (!data || typeof data !== 'object' || typeof data.systemPrompt !== 'string') {
        console.warn(`Invalid agent template in ${filename}: missing or invalid systemPrompt`);
        return null;
      }

      // Additional validation for optional fields if present
      const template = data as Record<string, unknown>;
      if (template.tools !== undefined && !Array.isArray(template.tools)) {
        console.warn(`Invalid agent template in ${filename}: tools must be an array`);
        return null;
      }

      return data as AgentTemplate;
    } catch (error) {
      console.warn(`Failed to load agent from ${filename}:`, error);
      return null;
    }
  }

  /**
   * Save an agent to a YAML file
   */
  async save(agent: AgentTemplate): Promise<void> {
    this.ensureAgentsDir();

    // Validate systemPrompt is present
    if (!agent.systemPrompt) {
      throw new Error('Cannot save agent: systemPrompt is required');
    }

    // Generate filename from agent ID (or use timestamp if no ID)
    const id = agent.id || `agent-${Date.now()}`;
    const filename = `${this.sanitizeFilename(id)}.yaml`;
    const filePath = path.join(this.agentsDir, filename);

    try {
      const yamlContent = stringify(agent, {
        lineWidth: 0, // Disable line wrapping
        indent: 2,
      });
      fs.writeFileSync(filePath, yamlContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save agent to ${filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete an agent file
   */
  async delete(agentId: string): Promise<void> {
    const filename = `${this.sanitizeFilename(agentId)}.yaml`;
    const filePath = path.join(this.agentsDir, filename);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      throw new Error(`Failed to delete agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if an agent file exists
   */
  exists(agentId: string): boolean {
    const filename = `${this.sanitizeFilename(agentId)}.yaml`;
    const filePath = path.join(this.agentsDir, filename);
    return fs.existsSync(filePath);
  }

  /**
   * Sanitize filename to kebab-case and remove invalid characters
   */
  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Get the agents directory path
   */
  getAgentsDir(): string {
    return this.agentsDir;
  }
}
