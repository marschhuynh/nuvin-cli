import type {
  AgentOrchestrator,
  MemoryPort,
  Message,
  ConversationStore,
  ToolRegistry,
} from '@nuvin/nuvin-core';

// ─── OrchestratorRuntime ───────────────────────────────────────────────────────

/**
 * Immutable snapshot of all objects that get swapped atomically when the
 * session changes or the user switches to a different agent.
 *
 * Config, handlers, and feature flags are *not* part of the runtime —
 * they change independently and live on ConfigManager / OrchestratorManager.
 */
export type OrchestratorRuntime = {
  readonly orchestrator: AgentOrchestrator;
  readonly memory: MemoryPort<Message>;
  readonly conversationStore: ConversationStore;
  readonly toolRegistry: ToolRegistry;
  readonly sessionId: string | null;
  readonly sessionDir: string | null;
  readonly activeAgentId: string;
};

// ─── OrchestratorRuntimeStore ──────────────────────────────────────────────────

/**
 * Single source of truth for the current orchestrator runtime.
 *
 * Every module that previously reached into OrchestratorManager via
 * `getOrchestrator()` / `getMemory()` / `getConversationStore()` etc.
 * now reads from this store through a single `getRuntime()` callback.
 *
 * No observability / events / subscriptions — the TUI already re-renders
 * on message events, so a second reactivity system is not needed.
 */
export class OrchestratorRuntimeStore {
  private current: OrchestratorRuntime | null = null;

  get(): OrchestratorRuntime | null {
    return this.current;
  }

  set(runtime: OrchestratorRuntime): void {
    this.current = runtime;
  }

  /**
   * Swap a single field and return the new runtime.
   * Avoids callers having to spread + reassemble.
   */
  patch(updates: Partial<OrchestratorRuntime>): OrchestratorRuntime {
    const current = this.current;
    if (!current) {
      throw new Error('Cannot patch: no runtime set');
    }
    const next = { ...current, ...updates };
    this.current = next;
    return next;
  }

  clear(): void {
    this.current = null;
  }
}
