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

    // Register default agents
    for (const agent of defaultAgents) {
      const complete = this.applyDefaults(agent);
      if (complete.id) {
        this.agents.set(complete.id, complete);
        this.defaultAgentIds.add(complete.id);
      }
    }

    // Start loading agents asynchronously
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
   * Only systemPrompt is required; all other fields get defaults
   */
  applyDefaults(partial: Partial<AgentTemplate> & { systemPrompt: string }): CompleteAgent {
    const id = partial.id || generateIdFromName(partial.name) || `agent-${Date.now()}`;
    const name = partial.name || 'Custom Agent';
    const description = partial.description || 'Custom specialist agent';
    const tools = partial.tools || ['file_read', 'web_search'];

    return {
      id,
      name,
      description,
      systemPrompt: partial.systemPrompt,
      tools,
      temperature: partial.temperature ?? 0.7,
      maxTokens: partial.maxTokens ?? 4000,
      provider: partial.provider,
      model: partial.model,
      topP: partial.topP,
      timeoutMs: partial.timeoutMs,
      shareContext: partial.shareContext,
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
            if (!complete.id) {
              console.warn('Agent loaded from persistence has no ID, skipping');
              continue;
            }
            this.agents.set(complete.id, complete);
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
          // Don't overwrite default agents with file versions
          if (complete.id && !this.defaultAgentIds.has(complete.id)) {
            this.agents.set(complete.id, complete);
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
   * Validate agent template (only systemPrompt required)
   */
  private validateTemplate(template: Partial<AgentTemplate>): boolean {
    if (!template.systemPrompt || typeof template.systemPrompt !== 'string') return false;
    return true;
  }

  /**
   * Register a new agent template
   */
  register(agent: Partial<AgentTemplate> & { systemPrompt: string }): void {
    if (!this.validateTemplate(agent)) {
      throw new Error(`Invalid agent template: missing systemPrompt`);
    }

    const complete = this.applyDefaults(agent);
    // ID is always generated in applyDefaults, but check for safety
    if (!complete.id) {
      throw new Error('Failed to generate agent ID');
    }
    this.agents.set(complete.id, complete);
    void this.saveToPersistence();
  }

  /**
   * Save agent to file
   */
  async saveToFile(agent: CompleteAgent): Promise<void> {
    if (!this.filePersistence) {
      throw new Error('File persistence not configured');
    }

    if (this.defaultAgentIds.has(agent.id)) {
      throw new Error(`Cannot save default agent "${agent.id}" to file`);
    }

    await this.filePersistence.save(agent);
  }

  /**
   * Delete agent from file
   */
  async deleteFromFile(agentId: string): Promise<void> {
    if (!this.filePersistence) {
      throw new Error('File persistence not configured');
    }

    if (this.defaultAgentIds.has(agentId)) {
      throw new Error(`Cannot delete default agent "${agentId}"`);
    }

    await this.filePersistence.delete(agentId);
  }

  /**
   * Check if an agent is a default agent
   */
  isDefault(agentId: string): boolean {
    return this.defaultAgentIds.has(agentId);
  }

  /**
   * Unregister an agent template
   */
  unregister(agentId: string): void {
    // Cannot unregister default agents
    if (this.defaultAgentIds.has(agentId)) {
      throw new Error(`Cannot unregister default agent "${agentId}"`);
    }

    this.agents.delete(agentId);
    void this.saveToPersistence();
  }

  /**
   * Get an agent template by ID
   */
  get(agentId: string): CompleteAgent | undefined {
    return this.agents.get(agentId);
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
  exists(agentId: string): boolean {
    return this.agents.has(agentId);
  }
}
