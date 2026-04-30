import * as path from 'node:path';
import * as os from 'node:os';

import {
  AgentOrchestrator,
  InMemoryMemory,
  ConversationStore,
  renderTemplate,
  buildInjectedSystem,
  mergeAgentConfig,
  type ToolPort,
  type LLMPort,
  type MemoryPort,
  type Message,
  type AgentAwareToolPort,
  type AgentConfig,
  type ConversationContext,
} from '@nuvin/nuvin-core';

import type { OrchestratorRuntime } from '../OrchestratorRuntime.js';

import { getGitContextInfo } from '@/utils/git-context.js';
import { skillsService } from '../SkillsService.js';
import { eventBus } from '../EventBus.js';
import { SessionBoundMetricsPort } from './utils.js';
import { sessionMetricsService } from '../SessionMetricsService.js';
import { getEnabledTools } from './constants.js';
import type { UIEventAdapter } from '@/adapters/index.js';
import type { MemorySettings, ThinkingLevel } from '@/config/types.js';
import type { UIHandlers } from './types.js';

// ─── Deps Interface ────────────────────────────────────────────────────────────

export type AgentSwapManagerDeps = {
  getRuntime: () => OrchestratorRuntime | null;
  patchRuntime: (updates: Partial<OrchestratorRuntime>) => OrchestratorRuntime;
  getHandlers: () => UIHandlers | null;
  getConversationContext: () => ConversationContext;
  getCurrentConfig: () => {
    config: {
      session?: { persistEventLog?: boolean };
      memory?: MemorySettings;
    };
    model: string;
    requireToolApproval: boolean | undefined;
    reasoningEffort: string | undefined;
    thinking: ThinkingLevel | undefined;
  };
  getEnableSkills: () => boolean;
  getStreamingChunks: () => boolean;
  createLLM: (httpLogFile?: string) => LLMPort;
  createMemory: (sessionDir: string, agentId: string) => MemoryPort<Message>;
  createEventAdapter: (
    sessionDir: string,
    handlers: UIHandlers,
    persist: boolean,
    streaming: boolean,
  ) => UIEventAdapter;
};

// ─── AgentSwapManager ──────────────────────────────────────────────────────────

export class AgentSwapManager {
  private previousOrchestrator: AgentOrchestrator | null = null;

  constructor(private deps: AgentSwapManagerDeps) {}

  // ── Public accessors ───────────────────────────────────────────────────

  getPreviousOrchestrator(): AgentOrchestrator | null {
    return this.previousOrchestrator;
  }

  // ── swapToAgent ────────────────────────────────────────────────────────

  /**
   * Swap to a different agent by creating a new AgentOrchestrator with the agent's config.
   * Preserves conversation history by copying it to the new orchestrator's memory.
   */
  async swapToAgent(agentId: string): Promise<void> {
    const runtime = this.deps.getRuntime();
    const orchestrator = runtime?.orchestrator ?? null;
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    const handlers = this.deps.getHandlers();
    if (!handlers) {
      throw new Error('Handlers not initialized');
    }

    // Get agent registry from tools
    const tools = orchestrator.getTools();
    const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
    const agentRegistry = agentAwareTools?.getAgentRegistry?.();

    if (!agentRegistry) {
      throw new Error('Agent registry not available');
    }

    // Validate agent exists
    const agent = agentRegistry.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const currentConfig = this.deps.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    // Capture current conversation history for preservation
    const conversationId = this.deps.getConversationContext().getActiveConversationId();
    const memory = runtime?.memory ?? null;
    const history = memory ? await memory.get(conversationId) : [];

    // Build injected system context with git info
    const injectedSystem = await this.buildInjectedSystem();

    // Render the agent's instructions template with injected system
    const renderedInstructions = renderTemplate(agent.instructions, { injectedSystem });

    // Create agent with rendered instructions
    const agentWithRenderedInstructions = {
      ...agent,
      instructions: renderedInstructions,
    };

    // Merge the main config with the agent's config
    const mainConfig = orchestrator.getConfig();
    const mergedConfig = mergeAgentConfig(mainConfig, agentWithRenderedInstructions);

    // Create new memory for the swapped agent
    const sessionDir = runtime?.sessionDir ?? null;
    const newMemory: MemoryPort<Message> = sessionDir
      ? this.deps.createMemory(sessionDir, `swapped-${agentId}`)
      : new InMemoryMemory<Message>();

    // Copy conversation history to new memory
    if (history.length > 0) {
      await newMemory.set(conversationId, history);
    }

    // Create new LLM for the agent's model
    const httpLogFile = this.resolveHttpLogFile(runtime);
    const newLLM = this.deps.createLLM(httpLogFile);

    // Create new event adapter
    const streamingChunks = this.deps.getStreamingChunks();
    const newEventAdapter = this.deps.createEventAdapter(
      sessionDir || '',
      handlers,
      persistEventLog,
      streamingChunks,
    );

    // Create new metrics port
    const newMetrics = new SessionBoundMetricsPort(`swapped-${agentId}`, sessionMetricsService);

    // Create new orchestrator with merged config
    const newOrchestrator = new AgentOrchestrator(mergedConfig, {
      memory: newMemory,
      tools,
      events: newEventAdapter,
      metrics: newMetrics,
    });

    // Set LLM before storing
    newOrchestrator.setLLM(newLLM);

    // Track previous agent for event emission
    const previousAgentId = runtime?.activeAgentId ?? 'main';

    // Store previous orchestrator for potential restore
    this.previousOrchestrator = orchestrator;

    // Update runtime atomically — orchestrator, memory, conversationStore, activeAgentId
    this.deps.patchRuntime({
      orchestrator: newOrchestrator,
      memory: newMemory,
      conversationStore: new ConversationStore(newMemory),
      activeAgentId: agentId,
    });

    // Emit swap event
    eventBus.emit('agent:swapped', {
      type: 'agent:swapped',
      previousAgentId,
      agentId,
      agentName: agent.name as string,
      timestamp: new Date().toISOString(),
    });
  }

  // ── swapToMain ─────────────────────────────────────────────────────────

  /**
   * Swap back to the main (nuvin-agent) agent.
   * Preserves conversation history by copying it to the new orchestrator's memory.
   */
  async swapToMain(): Promise<void> {
    const runtime = this.deps.getRuntime();
    const orchestrator = runtime?.orchestrator ?? null;
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    const handlers = this.deps.getHandlers();
    if (!handlers) {
      throw new Error('Handlers not initialized');
    }

    // Early return if already on main agent
    const activeAgentId = runtime?.activeAgentId ?? 'main';
    if (activeAgentId === 'main') {
      return;
    }

    const currentConfig = this.deps.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    // Capture current conversation history for preservation
    const conversationId = this.deps.getConversationContext().getActiveConversationId();
    const memory = runtime?.memory ?? null;
    const history = memory ? await memory.get(conversationId) : [];

    // Build injected system context
    const injectedSystem = await this.buildInjectedSystem();

    // Get main agent prompt from registry (allows user override)
    const tools = orchestrator.getTools();
    const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
    const agentRegistry = agentAwareTools?.getAgentRegistry?.();
    const mainAgentTemplate = agentRegistry?.get('nuvin');
    const mainPrompt = mainAgentTemplate?.instructions as string;

    const mainConfig: AgentConfig = {
      id: 'nuvin-agent',
      systemPrompt: renderTemplate(mainPrompt, { injectedSystem }),
      ...(mainAgentTemplate?.temperature !== undefined && { temperature: mainAgentTemplate.temperature }),
      ...(mainAgentTemplate?.top_p !== undefined && { topP: mainAgentTemplate.top_p }),
      maxTokens: mainAgentTemplate?.max_tokens,
      model: currentConfig.model,
      enabledTools: getEnabledTools(currentConfig.config.memory),
      maxToolConcurrency: 10,
      requireToolApproval: currentConfig.requireToolApproval,
      reasoningEffort: currentConfig.reasoningEffort,
      thinking: currentConfig.thinking,
    };

    // Create new memory for the main agent
    const sessionDir = runtime?.sessionDir ?? null;
    const newMemory: MemoryPort<Message> = sessionDir
      ? this.deps.createMemory(sessionDir, 'cli')
      : new InMemoryMemory<Message>();

    // Copy conversation history to new memory
    if (history.length > 0) {
      await newMemory.set(conversationId, history);
    }

    // Create new LLM for the main agent's model
    const httpLogFile = this.resolveHttpLogFile(runtime);
    const newLLM = this.deps.createLLM(httpLogFile);

    // Create new event adapter
    const streamingChunks = this.deps.getStreamingChunks();
    const newEventAdapter = this.deps.createEventAdapter(
      sessionDir || '',
      handlers,
      persistEventLog,
      streamingChunks,
    );

    // Create new metrics port
    const newMetrics = new SessionBoundMetricsPort('main', sessionMetricsService);

    // Create new orchestrator with main config
    const newOrchestrator = new AgentOrchestrator(mainConfig, {
      memory: newMemory,
      tools,
      events: newEventAdapter,
      metrics: newMetrics,
    });

    // Set LLM before storing
    newOrchestrator.setLLM(newLLM);

    // Store previous orchestrator for potential restore
    this.previousOrchestrator = orchestrator;

    // Reset active agent ID
    const previousAgentId = orchestrator.getConfig?.()?.id || 'unknown';

    // Update runtime atomically — orchestrator, memory, conversationStore, activeAgentId
    this.deps.patchRuntime({
      orchestrator: newOrchestrator,
      memory: newMemory,
      conversationStore: new ConversationStore(newMemory),
      activeAgentId: 'main',
    });

    // Emit swap event
    eventBus.emit('agent:swapped', {
      type: 'agent:swapped',
      previousAgentId,
      agentId: 'main',
      agentName: 'Main Agent',
      timestamp: new Date().toISOString(),
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Build the injected system context shared by both swap methods.
   */
  private async buildInjectedSystem(): Promise<string> {
    const { shell, gitBranch, gitRepo, recentCommits } = await getGitContextInfo();

    const enableSkills = this.deps.getEnableSkills();
    const availableSkills = enableSkills
      ? skillsService.list().map((s) => ({ name: s.name, description: s.description }))
      : [];

    return buildInjectedSystem(
      {
        today: new Date().toLocaleString(),
        platform: process.platform,
        arch: process.arch,
        tempDir: os.tmpdir?.() ?? '',
        workspaceDir: process.cwd(),
        availableAgents: [],
        folderTree: undefined, // Skip folder tree for swap to keep it fast
        shell,
        gitBranch,
        gitRepo,
        recentCommits,
        availableSkills,
      },
      { withSubAgent: true },
    );
  }

  /**
   * Resolve HTTP log file path based on session dir from the runtime.
   */
  private resolveHttpLogFile(runtime: OrchestratorRuntime | null): string | undefined {
    const sessionDir = runtime?.sessionDir ?? null;

    return sessionDir && sessionDir.length > 0
      ? path.join(sessionDir, 'http-log.json')
      : undefined;
  }
}
