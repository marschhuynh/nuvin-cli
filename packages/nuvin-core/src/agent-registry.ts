import type { AgentTemplate, CompleteAgent } from './agent-types.js';
import type { MemoryPort } from './ports.js';
import type { AgentFilePersistence } from './agent-file-persistence.js';

/**
 * Default specialist agents provided out-of-box
 */
const defaultAgents: AgentTemplate[] = [];

/**
 * Generate a kebab-case ID from a name
 */
function generateIdFromName(name?: string): string | null {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * AgentRegistry - manages registered specialist agent configurations
 */
export class AgentRegistry {
  private agents = new Map<string, CompleteAgent>();
  private defaultAgentIds = new Set<string>();
  private persistence?: MemoryPort<AgentTemplate>;
  private filePersistence?: AgentFilePersistence;

  private loadingPromise?: Promise<void>;

  constructor(options?: { persistence?: MemoryPort<AgentTemplate>; filePersistence?: AgentFilePersistence }) {
    this.persistence = options?.persistence;
    this.filePersistence = options?.filePersistence;

    for (const agent of defaultAgents) {
      const complete = this.applyDefaults(agent);
      if (complete.name) {
        this.agents.set(complete.name, complete);
        this.defaultAgentIds.add(complete.name);
      }
    }

    this.loadingPromise = this.loadAgents();
  }

  /**
   * Load agents from both persistence and files
   */
  private async loadAgents(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.persistence) {
      promises.push(this.loadFromPersistence());
    }

    if (this.filePersistence) {
      promises.push(this.loadFromFiles());
    }

    await Promise.all(promises);
  }

  /**
   * Wait for all agents to finish loading
   */
  async waitForLoad(): Promise<void> {
    await this.loadingPromise;
  }

  /**
   * Apply defaults to a partial agent template
   * Only instructions is required; all other fields get defaults
   */
  applyDefaults(partial: Partial<AgentTemplate> & { instructions: string }): CompleteAgent {
    const name = partial.name || generateIdFromName(partial.description) || `custom-agent`;
    const description = partial.description || 'Custom specialist agent';
    const allowed_tools = partial.allowed_tools || ['Read', 'WebSearch'];

    return {
      name,
      description,
      instructions: partial.instructions,
      allowed_tools,
      temperature: partial.temperature ?? 0.7,
      model: partial.model,
      disable_model_invocation: partial.disable_model_invocation,
      user_invocable: partial.user_invocable,
      context: partial.context,
      agent: partial.agent,
      provider: partial.provider,
      top_p: partial.top_p,
      timeout_ms: partial.timeout_ms,
      share_context: partial.share_context,
      metadata: partial.metadata,
    };
  }

  /**
   * Load agents from memory persistence
   */
  private async loadFromPersistence(): Promise<void> {
    if (!this.persistence) return;

    try {
      const keys = await this.persistence.keys();
      for (const key of keys) {
        const templates = await this.persistence.get(key);
        for (const template of templates) {
          if (this.validateTemplate(template)) {
            const complete = this.applyDefaults(template);
            if (!complete.name) {
              console.warn('Agent loaded from persistence has no name, skipping');
              continue;
            }
            this.agents.set(complete.name, complete);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load agents from persistence:', error);
    }
  }

  /**
   * Load agents from file system
   */
  private async loadFromFiles(): Promise<void> {
    if (!this.filePersistence) return;

    try {
      const loadedAgents = await this.filePersistence.loadAll();
      for (const agent of loadedAgents) {
        if (this.validateTemplate(agent)) {
          const complete = this.applyDefaults(agent);
          if (complete.name && !this.defaultAgentIds.has(complete.name)) {
            this.agents.set(complete.name, complete);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load agents from files:', error);
    }
  }

  /**
   * Save current agents to persistence
   */
  private async saveToPersistence(): Promise<void> {
    if (!this.persistence) return;

    try {
      const templates = Array.from(this.agents.values());
      await this.persistence.set('agents', templates);
    } catch (error) {
      console.warn('Failed to save agents to persistence:', error);
    }
  }

  /**
   * Validate agent template (only instructions required)
   */
  private validateTemplate(template: Partial<AgentTemplate>): boolean {
    if (!template.instructions || typeof template.instructions !== 'string') return false;
    return true;
  }

  /**
   * Register a new agent template
   */
  register(agent: Partial<AgentTemplate> & { instructions: string }): void {
    if (!this.validateTemplate(agent)) {
      throw new Error(`Invalid agent template: missing instructions`);
    }

    const complete = this.applyDefaults(agent);
    if (!complete.name) {
      throw new Error('Failed to generate agent name');
    }
    this.agents.set(complete.name, complete);
    void this.saveToPersistence();
  }

  /**
   * Save agent to file
   */
  async saveToFile(agent: CompleteAgent): Promise<void> {
    if (!this.filePersistence) {
      throw new Error('File persistence not configured');
    }

    if (this.defaultAgentIds.has(agent.name)) {
      throw new Error(`Cannot save default agent "${agent.name}" to file`);
    }

    await this.filePersistence.save(agent);
  }

  /**
   * Delete agent from file
   */
  async deleteFromFile(agentName: string): Promise<void> {
    if (!this.filePersistence) {
      throw new Error('File persistence not configured');
    }

    if (this.defaultAgentIds.has(agentName)) {
      throw new Error(`Cannot delete default agent "${agentName}"`);
    }

    await this.filePersistence.delete(agentName);
  }

  /**
   * Check if an agent is a default agent
   */
  isDefault(agentName: string): boolean {
    return this.defaultAgentIds.has(agentName);
  }

  /**
   * Unregister an agent template
   */
  unregister(agentName: string): void {
    if (this.defaultAgentIds.has(agentName)) {
      throw new Error(`Cannot unregister default agent "${agentName}"`);
    }

    this.agents.delete(agentName);
    void this.saveToPersistence();
  }

  /**
   * Get an agent template by ID
   */
  get(agentName: string): CompleteAgent | undefined {
    return this.agents.get(agentName);
  }

  /**
   * List all registered agent templates
   */
  list(): CompleteAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Check if an agent exists
   */
  exists(agentName: string): boolean {
    return this.agents.has(agentName);
  }
}
