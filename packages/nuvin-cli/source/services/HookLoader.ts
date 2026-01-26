import {
  HookRegistry,
  CompositeHookPort,
  type HooksConfig,
  type HookDefinition,
  type HookEventConfig,
} from '@nuvin/nuvin-core';

/**
 * Hook configuration format as it appears in ~/.nuvin/config.yaml
 *
 * Example:
 * ```yaml
 * hooks:
 *   pre_stop:
 *     - command:
 *         command: |
 *           #!/bin/bash
 *           open -g "raycast://..."
 *           echo '{"continue": true}'
 *           exit 0
 *         timeout: 30
 *       matcher: ".*"
 *       enabled: true
 * ```
 */
export interface ConfigHookDefinition {
  /** Pattern to match (regex for tool names, etc.) */
  matcher?: string;
  /** Command hook configuration */
  command?: {
    /** The command to run (can be multi-line bash script) */
    command: string;
    /** Timeout in seconds (default: 60) */
    timeout?: number;
  };
  /** Whether this hook is enabled (default: true) */
  enabled?: boolean;
}

export interface ConfigHooks {
  [eventType: string]: ConfigHookDefinition[];
}

/**
 * Validates if a hook event type is a known type
 */
const VALID_EVENT_TYPES = new Set([
  'pre_user_prompt',
  'pre_tool_use',
  'permission_request',
  'post_tool_use',
  'pre_sub_agent',
  'post_sub_agent',
  'pre_stop',
  'session_start',
  'session_end',
]);

function isValidEventType(eventType: string): boolean {
  return VALID_EVENT_TYPES.has(eventType);
}

/**
 * Converts a config hook definition to the core HookDefinition format
 */
function toHookDefinition(configHook: ConfigHookDefinition): HookDefinition {
  return {
    matcher: configHook.matcher,
    command: configHook.command
      ? {
          command: configHook.command.command,
          timeout: configHook.command.timeout,
        }
      : undefined,
    enabled: configHook.enabled,
  };
}

/**
 * Loads hooks from CLI config and creates a CompositeHookPort
 *
 * @param configHooks - The hooks configuration from ~/.nuvin/config.yaml
 * @returns A CompositeHookPort if hooks are configured, undefined otherwise
 *
 * @example
 * ```typescript
 * const config = configManager.getConfig();
 * const hookPort = createHookPortFromConfig(config.hooks);
 * if (hookPort) {
 *   orchestrator.setHookPort(hookPort);
 * }
 * ```
 */
export function createHookPortFromConfig(configHooks?: ConfigHooks): CompositeHookPort | undefined {
  if (!configHooks || Object.keys(configHooks).length === 0) {
    return undefined;
  }

  const registry = new HookRegistry();
  const hooksConfig: HooksConfig = {};

  for (const [eventType, hooks] of Object.entries(configHooks)) {
    // Skip invalid event types with a warning
    if (!isValidEventType(eventType)) {
      console.warn(`[HookLoader] Unknown hook event type: "${eventType}". Skipping.`);
      continue;
    }

    // Skip if hooks array is empty or not an array
    if (!Array.isArray(hooks) || hooks.length === 0) {
      continue;
    }

    // Convert config hooks to core HookDefinition format
    const hookDefs: HookDefinition[] = hooks
      .filter((h): h is ConfigHookDefinition => h != null && typeof h === 'object')
      .map(toHookDefinition);

    if (hookDefs.length > 0) {
      const eventConfig: HookEventConfig = { hooks: hookDefs };
      // Cast to satisfy TypeScript - we've already validated the event type
      (hooksConfig as Record<string, HookEventConfig>)[eventType] = eventConfig;
    }
  }

  // Only create hook port if we have valid hooks
  if (Object.keys(hooksConfig).length === 0) {
    return undefined;
  }

  registry.register('global', hooksConfig);
  return new CompositeHookPort(registry);
}

/**
 * Checks if hooks configuration has any hooks defined
 */
export function hasHooksConfigured(configHooks?: ConfigHooks): boolean {
  if (!configHooks || typeof configHooks !== 'object') {
    return false;
  }

  return Object.entries(configHooks).some(([eventType, hooks]) => {
    return isValidEventType(eventType) && Array.isArray(hooks) && hooks.length > 0;
  });
}
