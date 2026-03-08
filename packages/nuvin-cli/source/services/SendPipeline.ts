import * as path from 'node:path';
import type {
  AgentOrchestrator,
  AgentConfig,
  UserMessagePayload,
  SendMessageOptions,
  ConversationContext,
} from '@nuvin/nuvin-core';
import type { LLMPort } from '@nuvin/nuvin-core';
import type { OrchestratorRuntime } from './OrchestratorRuntime.js';
import type { MemoryToolWiring } from './orchestrator-modules/MemoryToolWiring.js';
import type { ContextWindowManager } from './orchestrator-modules/ContextWindowManager.js';
import type { SessionManager } from './orchestrator-modules/SessionManager.js';
import { buildSystemPromptWithMemory, stripInjectedMemorySection } from './memory-prompt-builder.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface SendContext {
  orchestrator: AgentOrchestrator;
  content: UserMessagePayload;
  opts: SendMessageOptions;
  agentConfigOverrides: Partial<AgentConfig>;

  // Mutable state accumulated by middleware
  agentConfig: Partial<AgentConfig>;
  conversationId: string;
  currentConfig: CurrentConfigSlice;

  // Set after core send
  result?: unknown;
}

/** Minimal config shape needed by the pipeline (avoids importing full config types). */
interface CurrentConfigSlice {
  config: {
    session?: { persistHttpLog?: boolean };
    memory?: {
      retrieval?: {
        coreInjectTokenBudget?: number;
        injectTokenBudget?: number;
        candidateLimit?: number;
        activeCandidateLimit?: number;
      };
      maxInjectionTokens?: number;
    };
  };
  provider: string;
  model: string;
  reasoningEffort?: string;
  thinking?: string;
}

export interface SendPipelineDeps {
  getRuntime: () => OrchestratorRuntime | null;
  getConversationContext: () => ConversationContext;
  getCurrentConfig: () => CurrentConfigSlice;
  createLLM: (httpLogFile?: string) => LLMPort;
  setModel: (model: string) => void;
  sessionManager: SessionManager;
  memoryToolWiring: MemoryToolWiring;
  contextWindowManager: ContextWindowManager;
}

type PreSendHook = (ctx: SendContext) => Promise<void>;
type PostSendHook = (ctx: SendContext) => Promise<void>;

// ── Pipeline ───────────────────────────────────────────────────────────

export class SendPipeline {
  private preSendHooks: PreSendHook[] = [];
  private postSendHooks: PostSendHook[] = [];

  constructor(private deps: SendPipelineDeps) {
    // Register default hooks in order
    this.preSendHooks = [
      (ctx) => this.lazySessionInit(ctx),
      (ctx) => this.refreshLLM(ctx),
      (ctx) => this.injectMemory(ctx),
      (ctx) => this.applyConfig(ctx),
      (ctx) => this.ensureContextWindowLimit(ctx),
    ];

    this.postSendHooks = [
      (ctx) => this.updateMetadata(ctx),
      (ctx) => this.checkContextWindow(ctx),
    ];
  }

  async execute(
    content: UserMessagePayload,
    opts: SendMessageOptions = {},
    agentConfigOverrides: Partial<AgentConfig> = {},
  ) {
    const orchestrator = this.deps.getRuntime()?.orchestrator ?? null;
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized, wait a moment');
    }

    const currentConfig = this.deps.getCurrentConfig();
    const conversationId = opts.conversationId ?? this.deps.getConversationContext().getActiveConversationId();

    const ctx: SendContext = {
      orchestrator,
      content,
      opts,
      agentConfigOverrides,
      agentConfig: {
        model: currentConfig.model,
        reasoningEffort: currentConfig.reasoningEffort,
        thinking: currentConfig.thinking,
        ...agentConfigOverrides,
      },
      conversationId,
      currentConfig,
    };

    // Pre-send hooks
    for (const hook of this.preSendHooks) {
      await hook(ctx);
    }

    // Core send
    ctx.result = await orchestrator.send(content, {
      ...opts,
      conversationId: ctx.conversationId,
    });

    // Post-send hooks
    for (const hook of this.postSendHooks) {
      await hook(ctx);
    }

    return ctx.result;
  }

  // ── Pre-send hooks ─────────────────────────────────────────────────

  private async lazySessionInit(_ctx: SendContext): Promise<void> {
    if (this.deps.sessionManager.getMemPersist() && !this.deps.sessionManager.isSessionInitialized()) {
      await this.deps.sessionManager.initializePersistedSession(this.deps.getRuntime()?.memory ?? null);
    }
  }

  private async refreshLLM(ctx: SendContext): Promise<void> {
    const persistHttpLog = ctx.currentConfig.config.session?.persistHttpLog ?? false;
    const sessionDir = this.deps.getRuntime()?.sessionDir ?? null;
    const httpLogFile = persistHttpLog && sessionDir ? path.join(sessionDir, 'http-log.json') : undefined;
    const newLLM = this.deps.createLLM(httpLogFile);
    ctx.orchestrator.setLLM(newLLM);
  }

  private async injectMemory(ctx: SendContext): Promise<void> {
    const memoryService = this.deps.memoryToolWiring.getMemoryService();
    if (!memoryService) return;

    const memoryConfig = ctx.currentConfig.config.memory;
    const memoryBlock = await memoryService.buildCoreMemoryInjection({
      workspaceId: this.deps.memoryToolWiring.getWorkspaceContext().workspaceId,
      injectTokenBudget:
        memoryConfig?.retrieval?.coreInjectTokenBudget ??
        memoryConfig?.retrieval?.injectTokenBudget ??
        memoryConfig?.maxInjectionTokens,
      candidateLimit:
        memoryConfig?.retrieval?.activeCandidateLimit ??
        memoryConfig?.retrieval?.candidateLimit,
    });

    const currentSystemPrompt = ctx.orchestrator.getConfig().systemPrompt ?? '';
    const cleanSystemPrompt = stripInjectedMemorySection(currentSystemPrompt);
    const memorySection = [
      '## Long-Term Memory',
      '',
      'You have a long-term memory system that persists across sessions.',
      'Use the `memory_query` tool for targeted recall when needed:',
      '- Before answering preference/convention/history questions',
      '- When uncertain and prior user/project memory could disambiguate choices',
      '- After tool results that may change project facts or conventions',
      '',
      'Use the `memory_extract` tool when this turn produced durable new memory:',
      '- Run it explicitly after major clarifications, decisions, or preference changes',
      '- The specialist queries existing memories first and only saves genuinely new or updated facts',
      '- Do NOT call memory_save for the same facts before or after calling memory_extract — the specialist handles it',
      '- Use scope `project` unless the memory clearly applies across all projects (e.g. user coding style)',
      '',
      'Use the `memory_save` tool to explicitly save important information:',
      '- User preferences (coding style, tool choices, naming conventions)',
      '- Project facts (tech stack, architecture decisions, team conventions)',
      '- Lessons learned (debugging approaches that worked, common pitfalls)',
      '',
      'Prefer memory_query for retrieval, memory_extract for post-turn consolidation, and memory_save for explicit persistence.',
      'Save when the user states a preference, when you discover a project pattern, or when the user corrects your behavior.',
      'Do NOT save transient task details, information already in project docs, or duplicate facts.',
    ];
    if (memoryBlock) {
      memorySection.push('', 'Remembered from previous sessions:', '', memoryBlock);
    }
    ctx.agentConfig.systemPrompt = buildSystemPromptWithMemory(cleanSystemPrompt, memorySection.join('\n'));
  }

  private async applyConfig(ctx: SendContext): Promise<void> {
    if (Object.keys(ctx.agentConfig).length > 0) {
      ctx.orchestrator.updateConfig(ctx.agentConfig);

      if (ctx.agentConfig.model) {
        this.deps.setModel(ctx.agentConfig.model);
      }
    }
  }

  private async ensureContextWindowLimit(ctx: SendContext): Promise<void> {
    await this.deps.contextWindowManager.ensureContextWindowLimitSet(
      ctx.currentConfig.provider,
      ctx.currentConfig.model,
    );
  }

  // ── Post-send hooks ────────────────────────────────────────────────

  private async updateMetadata(ctx: SendContext): Promise<void> {
    const result = ctx.result as { metadata?: Record<string, unknown> } | undefined;
    const runtime = this.deps.getRuntime();
    const conversationStore = runtime?.conversationStore ?? null;
    if (!result || !conversationStore) return;

    await this.deps.sessionManager.updateConversationMetadataAfterSend(
      conversationStore,
      runtime?.memory ?? null,
      ctx.conversationId,
      {
        promptTokens: result.metadata?.promptTokens as number | undefined,
        completionTokens: result.metadata?.completionTokens as number | undefined,
        totalTokens: result.metadata?.totalTokens as number | undefined,
        toolCalls: result.metadata?.toolCalls as number | undefined,
        responseTimeMs: result.metadata?.responseTime as number | undefined,
        cost: (result.metadata?.estimatedCost as number | undefined) ?? undefined,
      },
    );
  }

  private async checkContextWindow(ctx: SendContext): Promise<void> {
    const result = ctx.result;
    const conversationStore = this.deps.getRuntime()?.conversationStore ?? null;
    if (!result || !conversationStore) return;

    if (!ctx.opts.skipAutoSummaryCheck) {
      await this.deps.contextWindowManager.checkContextWindowUsage(
        ctx.currentConfig.provider,
        ctx.currentConfig.model,
        {
          conversationId: ctx.conversationId,
          signal: ctx.opts.signal,
        },
      );
    }
  }
}
