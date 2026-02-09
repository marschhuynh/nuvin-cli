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
  private localFilePersistence?: AgentFilePersistence;
  private profileFilePersistence?: AgentFilePersistence;
  private globalFilePersistence?: AgentFilePersistence;

  private loadingPromise?: Promise<void>;

  constructor(options?: { 
    persistence?: MemoryPort<AgentTemplate>; 
    localFilePersistence?: AgentFilePersistence;
    profileFilePersistence?: AgentFilePersistence;
    globalFilePersistence?: AgentFilePersistence;
  }) {
    this.persistence = options?.persistence;
    this.localFilePersistence = options?.localFilePersistence;
    this.profileFilePersistence = options?.profileFilePersistence;
    this.globalFilePersistence = options?.globalFilePersistence;

    for (const agent of defaultAgents) {
      const complete = this.applyDefaults(agent);
      if (complete.name) {
        complete.location = 'built-in';
        this.agents.set(complete.name, complete);
        this.defaultAgentIds.add(complete.name);
      }
    }

    this.loadingPromise = this.loadAgents();
  }

  /**
   * Load agents from both persistence and files
   * Load order matters: global → profile → local (later loads can override)
   */
  private async loadAgents(): Promise<void> {
    // Load from memory persistence first
    if (this.persistence) {
      await this.loadFromPersistence();
    }

    // Load global agents first (lowest priority)
    if (this.globalFilePersistence) {
      await this.loadFromFiles(this.globalFilePersistence, 'global');
    }

    // Load profile agents next (can override global)
    if (this.profileFilePersistence) {
      await this.loadFromFiles(this.profileFilePersistence, 'profile');
    }

    // Load local project agents last (highest priority, can override both)
    if (this.localFilePersistence) {
      await this.loadFromFiles(this.localFilePersistence, 'local');
    }
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
      max_tokens: partial.max_tokens,
      timeout_ms: partial.timeout_ms,
      share_context: partial.share_context,
      metadata: partial.metadata,
      location: partial.location,
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
  private async loadFromFiles(persistence: AgentFilePersistence, location: 'global' | 'profile' | 'local'): Promise<void> {
    try {
      const loadedAgents = await persistence.loadAll();
      for (const agent of loadedAgents) {
        if (this.validateTemplate(agent)) {
          const complete = this.applyDefaults(agent);
          if (complete.name && !this.defaultAgentIds.has(complete.name)) {
            // Later loads override earlier ones (local > profile > global)
            complete.location = location;
            this.agents.set(complete.name, complete);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load agents from files:', error);
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
    
    // Preserve existing location only if the new agent doesn't explicitly set one
    const existing = this.agents.get(complete.name);
    if (!complete.location && existing?.location) {
      complete.location = existing.location;
    } else if (!complete.location && !this.defaultAgentIds.has(complete.name)) {
      // If not already set and not a default agent, mark as local
      complete.location = 'local';
    }
    
    this.agents.set(complete.name, complete);
  }

  /**
   * Get the appropriate persistence layer for a given location
   */
  private getPersistenceForLocation(location: 'built-in' | 'global' | 'profile' | 'local' | undefined): AgentFilePersistence | undefined {
    switch (location) {
      case 'local':
        return this.localFilePersistence;
      case 'profile':
        return this.profileFilePersistence;
      case 'global':
        return this.globalFilePersistence;
      case 'built-in':
        throw new Error('Cannot perform file operations on built-in agents');
      default:
        // Fallback to local if location not set or unknown
        return this.localFilePersistence;
    }
  }

  /**
   * Save agent to file
   */
  async saveToFile(agent: CompleteAgent): Promise<void> {
    if (this.defaultAgentIds.has(agent.name)) {
      throw new Error(`Cannot save default agent "${agent.name}" to file`);
    }

    const persistence = this.getPersistenceForLocation(agent.location);
    if (!persistence) {
      throw new Error(`File persistence not configured for location: ${agent.location || 'local'}`);
    }

    await persistence.save(agent);
  }

  /**
   * Delete agent from file.
   * Location is required — callers must know where the agent lives.
   * Directory placement is the single source of truth for location.
   */
  async deleteFromFile(agentName: string, location: 'local' | 'profile' | 'global'): Promise<void> {
    if (this.defaultAgentIds.has(agentName)) {
      throw new Error(`Cannot delete default agent "${agentName}"`);
    }

    const persistence = this.getPersistenceForLocation(location);
    if (!persistence) {
      throw new Error(`File persistence not configured for location: ${location}`);
    }
    await persistence.delete(agentName);
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

  /**
   * Reload all agents from disk.
   * Clears non-default agents and re-reads from all file persistence layers.
   * Similar to commands' registry.reload() pattern.
   */
  async reload(): Promise<void> {
    // Clear non-default agents
    for (const [name] of this.agents) {
      if (!this.defaultAgentIds.has(name)) {
        this.agents.delete(name);
      }
    }
    // Re-load from files
    await this.loadAgents();
  }
}
