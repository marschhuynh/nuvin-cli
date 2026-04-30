import * as path from 'node:path';
import * as os from 'node:os';

import type {
  ToolRegistry,
  ConversationContext,
  MemoryScope,
} from '@nuvin/nuvin-core';
import type { OrchestratorRuntime } from '../OrchestratorRuntime.js';
import type { ConfigManager } from '@/config/manager.js';
import type { MemorySettings } from '@/config/types.js';
import { MemoryService } from '../MemoryService.js';
import { getWorkspaceContext, type WorkspaceContext } from '../WorkspaceContextService.js';
import { resolveMemoryExtractionConfig, INTERNAL_MEMORY_EXTRACTOR_AGENT } from './constants.js';
import { messageContentToText } from './utils.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MemoryToolWiringDeps = {
  configManager: ConfigManager;
  getCurrentConfig: () => { config: { memory?: MemorySettings } };
  getRuntime: () => OrchestratorRuntime | null;
  getConversationContext: () => ConversationContext;
};

/**
 * Minimal subset of ToolRegistry used by wireHandlers().
 * Avoids coupling to the full ToolRegistry class in tests.
 */
type ToolRegistryWireable = Pick<
  ToolRegistry,
  'setMemoryHandler' | 'setMemoryQueryHandler' | 'setMemoryExtractionTaskBuilder'
>;

// ─── MemoryToolWiring ──────────────────────────────────────────────────────────

/**
 * Owns the MemoryService lifecycle and wires memory-related tool handlers
 * (`memory_save`, `memory_query`, `memory_extract`) onto a ToolRegistry.
 *
 * Extracted from OrchestratorManager to isolate memory concerns.
 *
 * State owned:
 * - `memoryService` — the underlying MemoryService instance
 * - `workspaceContext` — workspace root + ID (refreshed on init)
 * - `memoryQueryCountsByTurn` — rate-limiter map for memory_query per turn
 */
export class MemoryToolWiring {
  private memoryService: MemoryService | null = null;
  private workspaceContext: WorkspaceContext | null = null;
  private memoryQueryCountsByTurn = new Map<string, number>();

  constructor(private deps: MemoryToolWiringDeps) {}

  // ─── State accessors ───────────────────────────────────────────────────────

  getMemoryService(): MemoryService | null {
    return this.memoryService;
  }

  getWorkspaceContext(): WorkspaceContext {
    if (!this.workspaceContext) {
      this.workspaceContext = getWorkspaceContext();
    }
    return this.workspaceContext;
  }

  // ─── Initialization ────────────────────────────────────────────────────────

  /**
   * Creates a MemoryService with config-derived paths and options.
   * No-ops when memory is explicitly disabled.
   */
  initializeMemoryService(): void {
    const currentConfig = this.deps.getCurrentConfig();
    const memoryConfig = currentConfig.config.memory;
    if (memoryConfig?.enabled === false) return;

    this.workspaceContext = getWorkspaceContext();

    const currentProfile =
      typeof this.deps.configManager.getCurrentProfile === 'function'
        ? this.deps.configManager.getCurrentProfile()
        : undefined;
    const isDefaultProfile = !currentProfile || currentProfile === 'default';
    const profileSuffix = isDefaultProfile ? '' : `-${currentProfile}`;

    const globalDir = path.join(os.homedir(), `.nuvin${profileSuffix}`, 'memory');
    const projectDir = path.join(globalDir, 'workspace', this.workspaceContext.workspaceId);

    this.memoryService = new MemoryService({
      globalDir,
      projectDir,
      workspaceId: this.workspaceContext.workspaceId,
      maxInjectionTokens: memoryConfig?.retrieval?.injectTokenBudget ?? memoryConfig?.maxInjectionTokens,
      coreInjectionTokens: memoryConfig?.retrieval?.coreInjectTokenBudget,
      candidateLimit: memoryConfig?.retrieval?.candidateLimit,
      activeCandidateLimit: memoryConfig?.retrieval?.activeCandidateLimit,
      indexPersisted: memoryConfig?.index?.persisted,
      minScore: memoryConfig?.retrieval?.minScore,
      freshnessHalfLifeDays: memoryConfig?.retrieval?.freshnessHalfLifeDays,
      indexFlushIntervalMs: memoryConfig?.index?.flushIntervalMs,
    });
  }

  // ─── Rate limiting ─────────────────────────────────────────────────────────

  /**
   * Enforce per-turn rate limit for memory_query calls.
   * Throws when the limit is reached. Evicts oldest entry when map > 512.
   */
  enforceMemoryQueryTurnLimit(messageId: string | undefined, maxQueriesPerTurn: number): void {
    const turnKey = messageId ?? 'unknown-turn';
    const current = this.memoryQueryCountsByTurn.get(turnKey) ?? 0;
    if (current >= maxQueriesPerTurn) {
      throw new Error(`memory_query limit reached for this turn (${maxQueriesPerTurn}).`);
    }
    this.memoryQueryCountsByTurn.set(turnKey, current + 1);

    if (this.memoryQueryCountsByTurn.size > 512) {
      const oldestKey = this.memoryQueryCountsByTurn.keys().next().value;
      if (typeof oldestKey === 'string') {
        this.memoryQueryCountsByTurn.delete(oldestKey);
      }
    }
  }

  /**
   * Clear the turn-limit map. Called during cleanup and session reset.
   */
  clearTurnLimits(): void {
    this.memoryQueryCountsByTurn.clear();
  }

  // ─── Wire handlers ─────────────────────────────────────────────────────────

  /**
   * Consolidates the 3 inline closures that OrchestratorManager.init() used to
   * set on the ToolRegistry:
   *   - setMemoryHandler (memory_save)
   *   - setMemoryQueryHandler (memory_query)
   *   - setMemoryExtractionTaskBuilder (memory_extract)
   */
  wireHandlers(toolRegistry: ToolRegistryWireable): void {
    // ── memory_save ──────────────────────────────────────────────────────
    toolRegistry.setMemoryHandler(async (input) => {
      if (!this.memoryService) return 'Memory system is not enabled.';

      const scope = input.scope ?? 'project';
      const entry = await this.memoryService.upsertTopicMemory({
        content: input.content,
        type: input.type,
        scope,
        topic: input.topic,
        key: input.key,
        title: input.title,
        confidence: input.confidence,
        evidence: input.evidence,
        tags: input.tags ?? [],
        keywords: input.keywords ?? input.tags ?? [],
        updateMode: input.updateMode ?? 'merge',
        source: 'explicit',
        workspaceId: scope === 'project' ? this.getWorkspaceContext().workspaceId : undefined,
      });
      return `Memory saved: "${entry.topic}" [${entry.type}/${entry.scope}]`;
    });

    // ── memory_query ─────────────────────────────────────────────────────
    toolRegistry.setMemoryQueryHandler(async (input, context) => {
      if (!this.memoryService) {
        throw new Error('Memory system is not enabled.');
      }

      const memoryConfig = this.deps.getCurrentConfig().config.memory;
      const maxQueriesPerTurn = memoryConfig?.retrieval?.maxQueriesPerTurn ?? 2;
      this.enforceMemoryQueryTurnLimit(context?.messageId, maxQueriesPerTurn);

      const scope = input.scope ?? 'both';
      const scopes: MemoryScope[] =
        scope === 'both' ? ['global', 'project'] : scope === 'global' ? ['global'] : ['project'];

      const hits = await this.memoryService.queryStatements({
        query: input.query,
        key: input.key,
        scopes,
        workspaceId: this.getWorkspaceContext().workspaceId,
        candidateLimit: input.topK ?? memoryConfig?.retrieval?.activeCandidateLimit ?? 12,
        minScore: input.minScore,
      });

      return {
        query: input.query,
        key: input.key,
        scope,
        totalHits: hits.length,
        hits,
      };
    });

    // ── memory_extract ───────────────────────────────────────────────────
    toolRegistry.setMemoryExtractionTaskBuilder(
      async (input, context) => {
        const conversationStore = this.deps.getRuntime()?.conversationStore ?? null;
        if (!conversationStore) {
          throw new Error('Memory system is not enabled.');
        }

        const current = this.deps.getCurrentConfig();
        const extractionSettings = resolveMemoryExtractionConfig(current.config.memory);
        if (!extractionSettings.enabled) {
          throw new Error('memory_extract is disabled by config (memory.extraction.enabled=false).');
        }

        const scope = input.scope ?? 'project';
        const maxMessages = Math.max(1, Math.min(100, Math.floor(input.maxMessages ?? 12)));
        const minSimilarityScore =
          typeof input.minSimilarityScore === 'number'
            ? Math.max(0, Math.min(10, input.minSimilarityScore))
            : 0.35;
        const conversationId =
          context?.conversationId ?? this.deps.getConversationContext().getActiveConversationId();

        const conversation = await conversationStore.getConversation(conversationId);
        if (!conversation || conversation.messages.length < 2) {
          throw new Error('No conversation context available for memory extraction.');
        }

        const relevantMessages = conversation.messages
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .slice(-maxMessages);
        if (relevantMessages.length === 0) {
          throw new Error('No user/assistant messages available for memory extraction.');
        }

        const transcript = relevantMessages
          .map((message) => `${message.role}: ${messageContentToText(message.content)}`)
          .join('\n');

        const safetyRule = extractionSettings.sensitiveFilter
          ? 'Sensitive filter: ON — never save secrets, passwords, API keys, tokens, or private credentials.'
          : 'Sensitive filter: OFF — still avoid credentials unless user explicitly requests.';

        const task = [
          `## Extraction Parameters`,
          `- Scope: ${scope}`,
          `- Min similarity score for consolidation: ${minSimilarityScore}`,
          `- ${safetyRule}`,
          '',
          `## Conversation Transcript (${relevantMessages.length} messages)`,
          '',
          transcript,
        ].join('\n');

        return {
          description: 'Extract and consolidate memory from this conversation',
          task,
        };
      },
      { hiddenAgentName: INTERNAL_MEMORY_EXTRACTOR_AGENT },
    );
  }
}
