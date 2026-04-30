import * as path from 'node:path';
import * as os from 'node:os';

import {
  ConversationContext,
  type AgentConfig,
  type Message,
  type ToolPort,
  type LLMPort,
  type MemoryPort,
  type UserMessagePayload,
  type SendMessageOptions,
  type ConversationMetadata,
  type AgentAwareToolPort,
  type ToolApprovalDecision,
} from '@nuvin/nuvin-core';
import type { ProviderKey } from '@/config/providers.js';
import type { MCPServerManager, MCPServerInfo } from './MCPServerManager.js';
import { ConfigManager } from '@/config/manager.js';
import { getProviderAuth } from '@/config/utils.js';
import { LLMFactory } from './LLMFactory.js';
import { OrchestratorStatus } from '@/types/orchestrator.js';
import { LSP } from './lsp/index.js';
import type { MemoryService } from './MemoryService.js';
import {
  defaultModels,
  defaultSmallModels,
} from './orchestrator-modules/constants.js';
import { TopicAnalyzer } from './orchestrator-modules/TopicAnalyzer.js';
import { ContextWindowManager } from './orchestrator-modules/ContextWindowManager.js';
import { MCPToolsManager } from './orchestrator-modules/MCPToolsManager.js';
import { MemoryToolWiring } from './orchestrator-modules/MemoryToolWiring.js';
import { SessionManager } from './orchestrator-modules/SessionManager.js';
import { AgentSwapManager } from './orchestrator-modules/AgentSwapManager.js';
import type { UIHandlers } from './orchestrator-modules/types.js';
import type { IOrchestratorManager, OrchestratorConfig } from './IOrchestratorManager.js';
import { OrchestratorBuilder } from './OrchestratorBuilder.js';
import { SendPipeline } from './SendPipeline.js';
import { OrchestratorRuntimeStore } from './OrchestratorRuntime.js';
import type { OrchestratorRuntime } from './OrchestratorRuntime.js';

export type { IOrchestratorManager, OrchestratorConfig } from './IOrchestratorManager.js';
export type { UIHandlers } from './orchestrator-modules/types.js';

export type { ProviderKey } from '@/config/providers.js';
export { OrchestratorStatus } from '@/types/orchestrator.js';
export { resolveMemoryExtractionConfig, type ResolvedMemoryExtractionConfig } from './orchestrator-modules/constants.js';

export class OrchestratorManager implements IOrchestratorManager {
  private runtimeStore = new OrchestratorRuntimeStore();
  private conversationContext: ConversationContext;
  private model: string = 'demo-echo';
  private status: OrchestratorStatus = OrchestratorStatus.INITIALIZING;
  private handlers: UIHandlers | null = null;
  private streamingChunks: boolean = true;
  private configManager: ConfigManager;
  private llmFactory: LLMFactory;
  private enableSkills: boolean = true;

  // Composed modules
  private topicAnalyzer: TopicAnalyzer;
  private contextWindowManager: ContextWindowManager;
  private mcpToolsManager: MCPToolsManager;
  private memoryToolWiring: MemoryToolWiring;
  private sessionManager: SessionManager;
  private agentSwapManager: AgentSwapManager;
  private sendPipeline: SendPipeline;

  // Delegated session state — primary source of truth is the runtime store;
  // SessionManager keeps a local copy for lifecycle flags.
  private get sessionId(): string | null { return this.runtimeStore.get()?.sessionId ?? null; }
  private get sessionDir(): string | null { return this.runtimeStore.get()?.sessionDir ?? null; }

  constructor() {
    this.configManager = ConfigManager.getInstance();
    this.conversationContext = new ConversationContext();
    this.llmFactory = new LLMFactory(this.configManager);

    const getRuntime = () => this.runtimeStore.get();
    const patchRuntime = (updates: Partial<OrchestratorRuntime>) => this.runtimeStore.patch(updates);

    this.mcpToolsManager = new MCPToolsManager({
      getRuntime,
      getMemoryConfig: () => this.getCurrentConfig().config.memory,
    });

    this.memoryToolWiring = new MemoryToolWiring({
      configManager: this.configManager,
      getCurrentConfig: () => this.getCurrentConfig(),
      getRuntime,
      getConversationContext: () => this.conversationContext,
    });

    this.sessionManager = new SessionManager({
      getRuntime,
      patchRuntime,
      getHandlers: () => this.handlers,
      getProfilePaths: () => this.getProfilePaths(),
      getCurrentConfig: () => this.getCurrentConfig(),
      getConversationContext: () => this.conversationContext,
      getToolRegistry: () => this.runtimeStore.get()?.toolRegistry ?? null,
      getStreamingChunks: () => this.streamingChunks,
    });

    this.agentSwapManager = new AgentSwapManager({
      getRuntime,
      patchRuntime,
      getHandlers: () => this.handlers,
      getConversationContext: () => this.conversationContext,
      getCurrentConfig: () => this.getCurrentConfig(),
      getEnableSkills: () => this.enableSkills,
      getStreamingChunks: () => this.streamingChunks,
      createLLM: (httpLogFile) => this.createLLM(httpLogFile),
      createMemory: (sessionDir, agentId) => this.sessionManager.createMemory(sessionDir, agentId),
      createEventAdapter: (sessionDir, handlers, persist, streaming) =>
        this.sessionManager.createEventAdapter(sessionDir, handlers, persist, streaming),
    });

    this.contextWindowManager = new ContextWindowManager({
      getRuntime,
      getConversationContext: () => this.conversationContext,
      getCurrentConfig: () => this.getCurrentConfig(),
      createLLM: (httpLogFile?: string) => this.createLLM(httpLogFile),
      send: (content, opts) => this.send(content, opts),
      createNewConversation: (config) => this.createNewConversation(config),
    });

    this.topicAnalyzer = new TopicAnalyzer({
      getRuntime,
      getConversationContext: () => this.conversationContext,
      createLLM: () => this.createLLM(),
      getCurrentConfig: () => this.getCurrentConfig(),
    });

    this.sendPipeline = new SendPipeline({
      getRuntime,
      getConversationContext: () => this.conversationContext,
      getCurrentConfig: () => this.getCurrentConfig(),
      createLLM: (httpLogFile) => this.createLLM(httpLogFile),
      setModel: (model) => { this.model = model; },
      sessionManager: this.sessionManager,
      memoryToolWiring: this.memoryToolWiring,
      contextWindowManager: this.contextWindowManager,
    });
  }

  private getProfilePaths(): { sessionsDir: string; agentsDir: string } {
    // Check if profile manager methods exist (they may not in tests or old code)
    const profileManager =
      typeof this.configManager.getProfileManager === 'function' ? this.configManager.getProfileManager() : undefined;
    const currentProfile =
      typeof this.configManager.getCurrentProfile === 'function' ? this.configManager.getCurrentProfile() : undefined;

    if (!profileManager || !currentProfile) {
      // Fallback to original paths if profile manager not available
      const nuvinDir = path.join(os.homedir(), '.nuvin');
      return {
        sessionsDir: path.join(nuvinDir, 'sessions'),
        agentsDir: path.join(nuvinDir, 'agents'),
      };
    }

    return {
      sessionsDir: profileManager.getProfileSessionsDir(currentProfile),
      agentsDir: profileManager.getProfileAgentsDir(currentProfile),
    };
  }

  private getCurrentConfig() {
    const config = this.configManager.getConfig();
    const provider = config.activeProvider || 'openrouter';
    const model = config.model || defaultModels[provider];
    const providerConfig = config.providers?.[provider];
    const smallModel = providerConfig?.smallModel || defaultSmallModels[provider] || model;
    const auth = getProviderAuth(config, provider);
    const mcpAllowedTools = config.mcpAllowedTools;
    const requireToolApproval = config.requireToolApproval;
    const thinkingValue = config.thinking;
    const reasoningEffort = thinkingValue === 'OFF' ? undefined : thinkingValue?.toLowerCase();
    const streamingChunks = config.streamingChunks ?? true;

    const oauthConfig = auth?.oauth ? { anthropic: auth.oauth } : undefined;

    return {
      config,
      provider,
      model,
      smallModel,
      auth,
      apiKey: auth?.apiKey,
      oauthConfig,
      mcpAllowedTools,
      requireToolApproval,
      reasoningEffort,
      thinking: thinkingValue,
      streamingChunks,
    };
  }

  async init(options: OrchestratorConfig, handlers: UIHandlers) {
    this.status = OrchestratorStatus.INITIALIZING;
    this.handlers = handlers;

    try {
      const builder = new OrchestratorBuilder({
        configManager: this.configManager,
        llmFactory: this.llmFactory,
        sessionManager: this.sessionManager,
        mcpToolsManager: this.mcpToolsManager,
        memoryToolWiring: this.memoryToolWiring,
        getProfilePaths: () => this.getProfilePaths(),
        getCurrentConfig: () => this.getCurrentConfig(),
        createLLM: (httpLogFile) => this.createLLM(httpLogFile),
        streamingChunks: this.streamingChunks,
      });

      const result = await builder.build(options, handlers);

      // Create and set the runtime atomically
      this.runtimeStore.set({
        orchestrator: result.orchestrator,
        memory: result.memory,
        conversationStore: result.conversationStore,
        toolRegistry: result.toolRegistry,
        sessionId: result.sessionState.sessionId,
        sessionDir: result.sessionState.sessionDir,
        activeAgentId: 'main',
      });

      this.model = result.model;
      this.enableSkills = result.enableSkills;

      this.sessionManager.setSessionState(result.sessionState);

      this.memoryToolWiring.initializeMemoryService();
      this.memoryToolWiring.wireHandlers(result.toolRegistry);

      // Set initial LLM — will be refreshed on each send() call
      result.orchestrator.setLLM(this.createLLM());

      // Set session ID for hooks context
      if (this.sessionId) {
        result.orchestrator.setSessionId(this.sessionId);
      }

      this.status = OrchestratorStatus.READY;

      // Only initialize default conversation if we have an explicit session
      if (result.hasExplicitSession) {
        await this.sessionManager.initializeDefaultConversation(result.conversationStore);
      }

      // Initialize MCP servers in background without blocking
      this.mcpToolsManager.initializeMCPServersInBackground(handlers);

      return {
        model: this.model,
        sessionId: this.sessionId,
        sessionDir: this.sessionDir,
      } as const;
    } catch (e) {
      this.status = OrchestratorStatus.ERROR;
      throw e;
    }
  }

  getOrchestrator() {
    return this.runtimeStore.get()?.orchestrator ?? null;
  }

  getMemory() {
    return this.runtimeStore.get()?.memory ?? null;
  }

  getMemoryService(): MemoryService | null {
    return this.memoryToolWiring.getMemoryService();
  }

  getStatus() {
    return this.status;
  }

  getModel() {
    return this.model;
  }

  getMCPServers() {
    return this.mcpToolsManager.getMCPServers();
  }

  getTools() {
    return this.runtimeStore.get()?.orchestrator?.getTools();
  }

  getLLM() {
    return this.runtimeStore.get()?.orchestrator?.getLLM();
  }

  getConfig() {
    return this.runtimeStore.get()?.orchestrator?.getConfig();
  }

  getAvailableProviders(): string[] {
    return this.llmFactory.getAvailableProviders();
  }

  async getAvailableModels(provider?: ProviderKey): Promise<string[]> {
    const targetProvider = provider ?? this.getCurrentConfig().provider;
    try {
      return await this.llmFactory.getModels(targetProvider);
    } catch {
      return [];
    }
  }

  getAvailableAgents(): Array<{ agentId: string; name: string; description?: string }> {
    const tools = this.runtimeStore.get()?.orchestrator?.getTools();
    const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
    const agentRegistry = agentAwareTools?.getAgentRegistry?.();
    const enabledConfig = (this.configManager.getConfig().agentsEnabled as Record<string, boolean>) || {};

    const listedAgents = (agentRegistry?.list?.() ?? [])
      .filter(
        (agent) =>
          !!agent.name &&
          agent.name !== 'nuvin' &&
          agent.user_invocable !== false &&
          enabledConfig[agent.name as string] !== false,
      )
      .map((agent) => ({
        agentId: agent.name as string,
        name: (agent.name as string) || 'Agent',
        description: (agent.description as string) || undefined,
      }));

    return [
      {
        agentId: 'main',
        name: 'Default',
        description: 'Nuvin default agent behavior',
      },
      ...listedAgents,
    ];
  }

  getActiveAgentId(): string {
    return this.runtimeStore.get()?.activeAgentId ?? 'main';
  }

  async updateMCPAllowedTools(allowedToolsConfig: Record<string, Record<string, boolean>>): Promise<void> {
    return this.mcpToolsManager.updateMCPAllowedTools(allowedToolsConfig);
  }

  async reconnectMCPServer(serverId: string): Promise<MCPServerInfo | null> {
    return this.mcpToolsManager.reconnectMCPServer(serverId);
  }

  async disconnectMCPServer(serverId: string): Promise<boolean> {
    return this.mcpToolsManager.disconnectMCPServer(serverId);
  }

  getSession() {
    return this.sessionManager.getSession();
  }

  getMcpManager() {
    return this.mcpToolsManager.getMcpManager();
  }

  setMcpManager(mcpManager: MCPServerManager | null) {
    this.mcpToolsManager.setMcpManager(mcpManager);
  }

  async cleanup() {
    this.memoryToolWiring.clearTurnLimits();
    await this.mcpToolsManager.cleanup();
    await LSP.shutdown();
  }

  updateConfig(agentConfigUpdates: Partial<AgentConfig>) {
    const orchestrator = this.runtimeStore.get()?.orchestrator ?? null;
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized, wait a moment');
    }

    orchestrator.updateConfig(agentConfigUpdates);

    // Update internal model tracking if model changed
    if (agentConfigUpdates.model) {
      this.model = agentConfigUpdates.model;
    }
  }

  private createLLM(httpLogFile?: string): LLMPort {
    const currentConfig = this.getCurrentConfig();
    return this.llmFactory.createLLM(currentConfig.provider, { httpLogFile });
  }

  getLLMFactory(): LLMFactory {
    return this.llmFactory;
  }

  async summarizeAndCreateNewSession(options: { skipEvents?: boolean } = {}) {
    return this.contextWindowManager.summarizeAndCreateNewSession(options);
  }

  async compressAndCreateNewSession<TStats>(
    compressFn: (messages: Message[]) => { compressed: Message[]; stats: TStats },
  ) {
    return this.contextWindowManager.compressAndCreateNewSession(compressFn);
  }

  async getModelContextLimit(): Promise<number | null> {
    return this.contextWindowManager.getModelContextLimit();
  }

  async send(
    content: UserMessagePayload,
    opts: SendMessageOptions = {},
    agentConfigOverrides: Partial<AgentConfig> = {},
  ) {
    return this.sendPipeline.execute(content, opts, agentConfigOverrides);
  }

  reset() {
    this.runtimeStore.clear();
    this.model = 'demo-echo';
    this.status = OrchestratorStatus.INITIALIZING;
    this.memoryToolWiring.clearTurnLimits();
    this.sessionManager.reset();
  }

  /**
   * Creates a new conversation session without reinitializing MCP servers.
   */
  async createNewConversation(config: { memPersist?: boolean } = {}): Promise<{
    sessionId: string | null;
    sessionDir: string | null;
    memory: MemoryPort<Message>;
  }> {
    return this.sessionManager.createNewConversation(config);
  }

  /**
   * Switch to an existing session.
   */
  async switchToSession(config: { sessionId: string; sessionDir: string }) {
    return this.sessionManager.switchToSession(config);
  }

  async analyzeTopic(userMessage: string, conversationId?: string): Promise<string> {
    return this.topicAnalyzer.analyzeTopic(userMessage, conversationId);
  }

  async updateConversationTopic(conversationId: string, topic: string): Promise<void> {
    return this.topicAnalyzer.updateConversationTopic(conversationId, topic);
  }

  async analyzeAndUpdateTopic(
    userMessage: string,
    conversationId?: string,
    options: { waitFor?: Promise<unknown> } = {},
  ): Promise<string> {
    return this.topicAnalyzer.analyzeAndUpdateTopic(userMessage, conversationId, options);
  }

  getConversationContext(): ConversationContext {
    return this.conversationContext;
  }

  async getConversationMetadata(conversationId: string): Promise<ConversationMetadata> {
    return this.sessionManager.getConversationMetadata(this.runtimeStore.get()?.conversationStore ?? null, conversationId);
  }

  async listConversations(): Promise<Array<{ id: string; metadata: ConversationMetadata }>> {
    return this.sessionManager.listConversations(this.runtimeStore.get()?.conversationStore ?? null);
  }

  getConversationStore() {
    return this.runtimeStore.get()?.conversationStore ?? null;
  }

  async summarize(): Promise<string> {
    return this.contextWindowManager.summarize();
  }

  async swapToAgent(agentId: string): Promise<void> {
    return this.agentSwapManager.swapToAgent(agentId);
  }

  async swapToMain(): Promise<void> {
    return this.agentSwapManager.swapToMain();
  }

  handleToolApproval(approvalId: string, decision: ToolApprovalDecision, editInstruction?: string): void {
    const orchestrator = this.runtimeStore.get()?.orchestrator;
    if (!orchestrator) return;
    orchestrator.handleToolApproval(approvalId, decision, editInstruction);
  }

  handleUserQuestionResponse(questionId: string, answers: Record<string, string | string[]>): void {
    const orchestrator = this.runtimeStore.get()?.orchestrator;
    if (!orchestrator) return;
    orchestrator.handleUserQuestionResponse(questionId, answers);
  }
}

// Default singleton for convenience where a single manager is desired
export const orchestratorManager = new OrchestratorManager();
