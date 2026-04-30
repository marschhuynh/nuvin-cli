import * as path from 'node:path';
import * as crypto from 'node:crypto';

import {
  AgentOrchestrator,
  SimpleContextBuilder,
  InMemoryMemory,
  SimpleId,
  SystemClock,
  SimpleCost,
  NoopReminders,
  ToolRegistry,
  AgentRegistry,
  type Message,
  type LLMPort,
  type MemoryPort,
  type ConversationContext,
  type UserMessagePayload,
  type SendMessageOptions,
} from '@nuvin/nuvin-core';

import type { OrchestratorRuntime } from '../OrchestratorRuntime.js';

import { sessionMetricsService } from '../SessionMetricsService.js';
import { modelLimitsCache } from '../ModelLimitsCache.js';
import { eventBus } from '../EventBus.js';
import { theme } from '@/theme.js';
import { messagesToText } from './utils.js';
import type { MemorySettings } from '@/config/types.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ContextWindowManagerDeps = {
  getRuntime: () => OrchestratorRuntime | null;
  getConversationContext: () => ConversationContext;
  getCurrentConfig: () => {
    config: { memory?: MemorySettings; session?: { persistHttpLog?: boolean } };
    provider: string;
    model: string;
    smallModel: string;
  };
  createLLM: (httpLogFile?: string) => LLMPort;
  send: (content: UserMessagePayload, opts: SendMessageOptions) => Promise<unknown>;
  createNewConversation: (config?: { memPersist?: boolean }) => Promise<{
    sessionId: string | null;
    sessionDir: string | null;
    memory: MemoryPort<Message>;
  }>;
};

// ─── Summary system prompt ─────────────────────────────────────────────────────

const SUMMARY_SYSTEM_PROMPT = `You are a session-continuity summarizer for a CLI coding assistant. The conversation you are summarizing is an in-progress coding session that was interrupted because the context window is full. Your summary will be injected into a fresh session so the assistant can resume work without losing progress.

Produce a structured summary using the following sections. Omit any section that has no relevant content.

### Session Goal
State the user's original request or objective in 1-2 sentences.

### Work Completed
List what has already been done, with specifics:
- Files created, modified, or deleted (include paths)
- Key implementation decisions made and their rationale
- Commands run and their outcomes (pass/fail)
- Tests written or executed and their results

### Current State
Describe where things stand right now:
- What was the assistant doing when the session ended?
- Any in-progress file edits or partially completed steps
- Error messages, failing tests, or blockers encountered
- The current branch, working directory, or environment state if mentioned

### Remaining Work
List what still needs to be done to complete the original goal:
- Specific next steps, in order if sequence matters
- Known issues or edge cases still unaddressed
- Any pending user decisions or questions that were unanswered

### Key Context
Preserve critical details that would be expensive to re-derive:
- Architecture or design patterns being followed
- Important variable names, function signatures, or API shapes
- File paths and line numbers referenced repeatedly
- Constraints or requirements the user specified
- Todo list items and their status (pending/in_progress/completed)

Rules:
- Be precise and specific. Use exact file paths, function names, and error messages — not vague references.
- Do NOT include conversational pleasantries, repeated back-and-forth, or exploratory dead ends that were abandoned.
- Do NOT summarize tool calls verbatim. Capture their outcomes and decisions, not the mechanics.
- Keep the total summary under 1500 tokens. Prioritize actionable state over narrative.
- Write for a coding agent that will read this summary and immediately resume work, not for a human reader.`;

// ─── ContextWindowManager ──────────────────────────────────────────────────────

export class ContextWindowManager {
  static readonly WARNING_THRESHOLD = 0.85;
  static readonly AUTO_SUMMARY_THRESHOLD = 0.95;

  constructor(private deps: ContextWindowManagerDeps) {}

  /**
   * Monitor context window usage. Emits warnings at 85%, triggers auto-summary at 95%.
   */
  async checkContextWindowUsage(
    provider: string,
    model: string,
    opts: { conversationId: string; signal?: AbortSignal },
  ): Promise<void> {
    const sessionId = this.deps.getRuntime()?.sessionId ?? null;
    if (!sessionId) return;

    const metrics = sessionMetricsService.getSnapshot(sessionId);
    const llm = this.deps.getRuntime()?.orchestrator?.getLLM();
    const limits = await modelLimitsCache.getLimit(provider, model, llm?.getModels?.bind(llm));

    if (!limits) return;

    const usage = metrics.currentPromptTokens ? metrics.currentPromptTokens / limits.contextWindow : 0;

    sessionMetricsService.setContextWindow(sessionId, limits.contextWindow, usage);

    if (!metrics.currentPromptTokens) return;

    if (usage >= ContextWindowManager.AUTO_SUMMARY_THRESHOLD) {
      eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'system',
        content: `⚠️ Context window at ${Math.round(usage * 100)}% (${metrics.currentPromptTokens.toLocaleString()}/${limits.contextWindow.toLocaleString()} tokens). Running auto-summary...`,
        metadata: { timestamp: new Date().toISOString() },
        color: theme.tokens.yellow,
      });

      try {
        await this.summarizeAndCreateNewSession();
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: '✓ Auto-summary completed. Context window has been reduced.',
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.green,
        });

        try {
          const continuationText =
            'Continue the task from where it left off. Do not ask me to repeat context unless required.';
          await this.deps.send(
            {
              text: continuationText,
              displayText: continuationText,
            },
            {
              conversationId: opts.conversationId,
              stream: true,
              signal: opts.signal,
              skipAutoSummaryCheck: true,
            },
          );
        } catch (error) {
          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'system',
            content: `⚠️ Auto-summary completed, but automatic continuation failed: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
            metadata: { timestamp: new Date().toISOString() },
            color: theme.tokens.yellow,
          });
        }
      } catch (error) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: `⚠️ Auto-summary failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.red,
        });
      }
    } else if (usage >= ContextWindowManager.WARNING_THRESHOLD) {
      eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'system',
        content: `⚠️ Context window at ${Math.round(usage * 100)}% (${metrics.currentPromptTokens.toLocaleString()}/${limits.contextWindow.toLocaleString()} tokens). Consider using /summary to reduce context.`,
        metadata: { timestamp: new Date().toISOString() },
        color: theme.tokens.yellow,
      });
    }
  }

  /**
   * Summarize current conversation and create a new session with the summary.
   * The original session history is preserved, and the new session links back via metadata.
   */
  async summarizeAndCreateNewSession(options: { skipEvents?: boolean } = {}): Promise<{
    summary: string;
    summaryPrompt: string;
    previousSessionId: string;
    newSessionId: string;
    newSessionDir: string;
  }> {
    const memory = this.deps.getRuntime()?.memory ?? null;
    if (!memory) {
      throw new Error('Memory not initialized');
    }

    const sessionId = this.deps.getRuntime()?.sessionId ?? null;
    if (!sessionId) {
      throw new Error('Session ID not set');
    }

    const previousSessionId = sessionId;

    const summary = await this.summarize();

    const result = await this.deps.createNewConversation({ memPersist: true });

    if (!result.sessionId || !result.sessionDir) {
      throw new Error('Failed to create new session');
    }

    const newSessionId = result.sessionId;
    const newSessionDir = result.sessionDir;

    const conversationId = this.deps.getConversationContext().getActiveConversationId();
    const conversationStore = this.deps.getRuntime()?.conversationStore ?? null;
    if (conversationStore) {
      await conversationStore.updateMetadata(conversationId, {
        summarizedFrom: previousSessionId,
        topic: `Summary of session ${previousSessionId}`,
      });
    }

    const summaryPrompt = `Previous conversation summary:\n\n${summary}`;
    const summaryMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: summaryPrompt,
      timestamp: new Date().toISOString(),
    };

    // Append to the current memory (which may have been swapped by createNewConversation)
    const currentMemory = this.deps.getRuntime()?.memory ?? null;
    await currentMemory?.append(conversationId, [summaryMessage]);

    if (!options.skipEvents) {
      eventBus.emit('ui:lines:clear');

      eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'user',
        content: summaryMessage.content as string,
        metadata: { timestamp: summaryMessage.timestamp },
      });

      eventBus.emit('ui:header:refresh');
    }

    sessionMetricsService.reset(newSessionId);

    eventBus.emit('conversation:created', { memPersist: true });

    return {
      summary,
      summaryPrompt,
      previousSessionId,
      newSessionId,
      newSessionDir,
    };
  }

  /**
   * Compress current conversation and create a new session with compressed messages.
   * The original session history is preserved, and the new session links back via metadata.
   */
  async compressAndCreateNewSession<TStats>(
    compressFn: (messages: Message[]) => { compressed: Message[]; stats: TStats },
  ): Promise<{
    previousSessionId: string;
    newSessionId: string;
    newSessionDir: string;
    stats: TStats;
  }> {
    const memory = this.deps.getRuntime()?.memory ?? null;
    if (!memory) {
      throw new Error('Memory not initialized');
    }

    const sessionId = this.deps.getRuntime()?.sessionId ?? null;
    if (!sessionId) {
      throw new Error('Session ID not set');
    }

    const previousSessionId = sessionId;

    const conversationId = this.deps.getConversationContext().getActiveConversationId();
    const history = await memory.get(conversationId);
    if (!history || history.length === 0) {
      throw new Error('No conversation history to compress');
    }

    const { compressed, stats } = compressFn(history);

    const result = await this.deps.createNewConversation({ memPersist: true });

    if (!result.sessionId || !result.sessionDir) {
      throw new Error('Failed to create new session');
    }

    const newSessionId = result.sessionId;
    const newSessionDir = result.sessionDir;

    const conversationStore = this.deps.getRuntime()?.conversationStore ?? null;
    if (conversationStore) {
      await conversationStore.updateMetadata(conversationId, {
        summarizedFrom: previousSessionId,
        topic: `Compressed from session ${previousSessionId}`,
      });
    }

    // Set compressed messages in the new memory
    const currentMemory = this.deps.getRuntime()?.memory ?? null;
    await currentMemory?.set(conversationId, compressed);

    sessionMetricsService.reset(newSessionId);

    eventBus.emit('conversation:created', { memPersist: true });

    return {
      previousSessionId,
      newSessionId,
      newSessionDir,
      stats,
    };
  }

  /**
   * Get the model's context window limit from the cache.
   */
  async getModelContextLimit(): Promise<number | null> {
    const currentConfig = this.deps.getCurrentConfig();
    const llm = this.deps.getRuntime()?.orchestrator?.getLLM();
    const limits = await modelLimitsCache.getLimit(currentConfig.provider, currentConfig.model, llm?.getModels);
    return limits?.contextWindow ?? null;
  }

  /**
   * Ensure the orchestrator's metrics have the context window limit set.
   */
  async ensureContextWindowLimitSet(provider: string, model: string): Promise<void> {
    const orchestrator = this.deps.getRuntime()?.orchestrator ?? null;
    const metrics = orchestrator?.getMetrics?.();
    if (!metrics) return;

    const llm = orchestrator?.getLLM();
    const limits = await modelLimitsCache.getLimit(provider, model, llm?.getModels?.bind(llm));

    if (limits) {
      const currentSnapshot = metrics.getSnapshot();
      metrics.setContextWindow(limits.contextWindow, currentSnapshot.contextWindowUsage ?? 0);
    }
  }

  /**
   * Standalone LLM summarization call. Creates its own AgentOrchestrator
   * with summary-specific configuration.
   */
  async summarize(): Promise<string> {
    const memory = this.deps.getRuntime()?.memory ?? null;
    if (!memory) {
      throw new Error('Memory not initialized');
    }

    const conversationId = this.deps.getConversationContext().getActiveConversationId();
    const history = await memory.get(conversationId);
    if (!history || history.length === 0) {
      return 'No conversation history to summarize.';
    }

    const conversationText = messagesToText(history);

    const currentConfig = this.deps.getCurrentConfig();
    const runtime = this.deps.getRuntime();
    const sessionDir = runtime?.sessionDir ?? null;
    const memPersist = !!sessionDir;
    const httpLogFile = memPersist && sessionDir ? path.join(sessionDir, 'http-log.json') : undefined;
    const llm = this.deps.createLLM(httpLogFile);

    const summaryMemory = new InMemoryMemory<Message>();
    const summaryTools = new ToolRegistry({
      agentRegistry: new AgentRegistry({ localFilePersistence: undefined }),
    });

    const summaryConfig = {
      id: 'summary-agent',
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      temperature: 0.7,
      topP: 1,
      model: currentConfig.model,
      enabledTools: [],
      maxToolConcurrency: 0,
      reasoningEffort: undefined,
    };

    const summaryDeps = {
      memory: summaryMemory,
      llm,
      tools: summaryTools,
      context: new SimpleContextBuilder(),
      ids: new SimpleId(),
      clock: new SystemClock(),
      cost: new SimpleCost(),
      reminders: new NoopReminders(),
    };

    const summaryOrchestrator = new AgentOrchestrator(summaryConfig, summaryDeps);

    const response = await summaryOrchestrator.send(conversationText);

    return response.content;
  }
}
