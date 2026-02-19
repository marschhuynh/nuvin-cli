import type { HookPort, HookContext, HookResult, HookEventType, HookDefinition } from './types.js';
import type { HookRegistry } from './hook-registry.js';
import { CommandHookExecutor } from './command-hook-executor.js';

const DEFAULT_TIMEOUT = 60;

/**
 * CompositeHookPort combines a HookRegistry with a CommandHookExecutor
 * to execute all matching hooks for an event.
 *
 * Hooks are executed in sequence. If any hook returns continue:false,
 * execution stops and that result is returned.
 */
export class CompositeHookPort implements HookPort {
  private executor: CommandHookExecutor;

  constructor(
    private registry: HookRegistry,
    executor?: CommandHookExecutor,
  ) {
    this.executor = executor ?? new CommandHookExecutor();
  }

  async executeHook(context: HookContext): Promise<HookResult> {
    const matchKey = this.getMatchKey(context);
    const hooks = this.registry.getMatchingHooks(context.hookEvent, matchKey);

    if (hooks.length === 0) {
      return { continue: true, exitCode: 0 };
    }

    // Filter out disabled hooks
    const enabledHooks = hooks.filter((hook) => hook.enabled !== false);

    let mergedResult: HookResult = { continue: true, exitCode: 0 };

    for (const hook of enabledHooks) {
      const result = await this.executeHookDefinition(hook, context);

      // Merge results - later hooks can override earlier ones
      mergedResult = this.mergeResults(mergedResult, result);

      // Stop if hook says not to continue
      if (!result.continue) {
        return mergedResult;
      }
    }

    return mergedResult;
  }

  hasHooks(event: HookEventType, matcher?: string): boolean {
    return this.registry.hasHooks(event, matcher);
  }

  private async executeHookDefinition(hook: HookDefinition, context: HookContext): Promise<HookResult> {
    if (hook.command) {
      const timeout = hook.command.timeout ?? DEFAULT_TIMEOUT;
      return this.executor.execute(hook.command.command, context, timeout);
    }

    // Prompt-based hooks are not yet implemented
    // For now, just continue
    if (hook.prompt) {
      return {
        continue: true,
        exitCode: 0,
        rawOutput: `Prompt hook: ${hook.prompt.prompt}`,
      };
    }

    // No command or prompt - just continue
    return { continue: true, exitCode: 0 };
  }

  private getMatchKey(context: HookContext): string {
    // For tool-related events, match by tool name
    if (context.toolName) {
      return context.toolName;
    }
    // For agent-related events, match by agent type
    if (context.agentType) {
      return context.agentType;
    }
    // Default - will match hooks with no matcher
    return '';
  }

  private mergeResults(base: HookResult, overlay: HookResult): HookResult {
    return {
      ...base,
      ...overlay,
      // Merge updatedInput if both exist
      updatedInput: overlay.updatedInput ?? base.updatedInput,
      // Keep the last raw output
      rawOutput: overlay.rawOutput ?? base.rawOutput,
      // Keep the highest exit code
      exitCode: Math.max(base.exitCode, overlay.exitCode),
      // Duration accumulates
      durationMs: (base.durationMs ?? 0) + (overlay.durationMs ?? 0),
    };
  }
}
