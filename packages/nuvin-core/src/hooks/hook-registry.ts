import type { HookEventType, HookDefinition, HooksConfig } from './types.js';

/**
 * Registry for storing and matching hooks from multiple sources.
 *
 * The registry allows registering hook configurations from different sources
 * (e.g., different agents, plugins, or configuration files) and provides
 * methods to query and match hooks based on event type and tool name patterns.
 */
export class HookRegistry {
  private configs: Map<string, HooksConfig> = new Map();

  /**
   * Register hooks from a source.
   * @param sourceId - Unique identifier for the source (e.g., agent name)
   * @param config - Hook configuration to register
   */
  register(sourceId: string, config: HooksConfig): void {
    this.configs.set(sourceId, config);
  }

  /**
   * Unregister hooks from a source.
   * @param sourceId - Source identifier to unregister
   */
  unregister(sourceId: string): void {
    this.configs.delete(sourceId);
  }

  /**
   * Get all hooks for a specific event type.
   * @param event - The hook event type
   * @returns Array of all hook definitions for this event
   */
  getHooksForEvent(event: HookEventType): HookDefinition[] {
    const allHooks: HookDefinition[] = [];
    for (const config of this.configs.values()) {
      const eventConfig = config[event as keyof HooksConfig];
      if (eventConfig?.hooks) {
        allHooks.push(...eventConfig.hooks);
      }
    }
    return allHooks;
  }

  /**
   * Get hooks matching a specific tool name pattern.
   * Hooks without a matcher match all tools.
   * @param event - The hook event type
   * @param toolName - The tool name to match against
   * @returns Array of matching hook definitions
   */
  getMatchingHooks(event: HookEventType, toolName: string): HookDefinition[] {
    const hooks = this.getHooksForEvent(event);
    return hooks.filter((hook) => {
      if (!hook.matcher) return true;
      try {
        const regex = new RegExp(hook.matcher);
        return regex.test(toolName);
      } catch {
        return false;
      }
    });
  }

  /**
   * Check if there are any hooks for an event type.
   * @param event - The hook event type
   * @param matcher - Optional tool name to check for matching hooks
   * @returns True if hooks exist for this event (and optionally match the tool)
   */
  hasHooks(event: HookEventType, matcher?: string): boolean {
    if (matcher) {
      return this.getMatchingHooks(event, matcher).length > 0;
    }
    return this.getHooksForEvent(event).length > 0;
  }

  /**
   * Clear all registered hooks.
   */
  clear(): void {
    this.configs.clear();
  }
}
