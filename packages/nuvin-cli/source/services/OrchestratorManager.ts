import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

import {
  AgentOrchestrator,
  SimpleContextBuilder,
  RuntimeEnv,
  renderTemplate,
  buildInjectedSystem,
  InMemoryMemory,
  PersistedMemory,
  JsonFileMemoryPersistence,
  SimpleId,
  SystemClock,
  SimpleCost,
  NoopReminders,
  ToolRegistry,
  CompositeToolPort,
  AgentRegistry,
  AgentFilePersistence,
  generateFolderTree,
  ConversationStore,
  ConversationContext,
  type LLMFactory as LLMFactoryCore,
  type AgentConfig,
  type Message,
  type ToolPort,
  type LLMPort,
  type MemoryPort,
  type MetricsPort,
  type MetricsSnapshot,
  type UsageData,
  type UserMessagePayload,
  type SendMessageOptions,
  type ConversationMetadata,
  type AgentAwareToolPort,
  mergeAgentConfig,
} from '@nuvin/nuvin-core';
import { UIEventAdapter, type MessageLine, type LineMetadata } from '@/adapters/index.js';
import { prompt } from '@/prompt.js';
import type { ProviderKey } from '@/config/providers.js';
import { MCPServerManager, type MCPServerInfo } from './MCPServerManager.js';
import { eventBus } from './EventBus.js';
import { ConfigManager } from '@/config/manager.js';
import { getProviderAuth } from '@/config/utils.js';
import { LLMFactory } from './LLMFactory.js';
import { OrchestratorStatus } from '@/types/orchestrator.js';
import { modelLimitsCache } from './ModelLimitsCache.js';
import { createHookPortFromConfig, type ConfigHooks } from './HookLoader.js';
import { sessionMetricsService } from './SessionMetricsService.js';
import { theme } from '@/theme.js';
import { LSP } from './lsp/index.js';
import { skillsService } from './SkillsService.js';

// Directory paths will be resolved dynamically based on active profile
const defaultModels: Record<ProviderKey, string> = {
  openrouter: 'openai/gpt-4.1',
  deepinfra: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
  github: 'gpt-4.1',
  zai: 'glm-4.5',
  anthropic: 'claude-sonnet-4-5',
  moonshot: 'moonshot-v1-8k',
};
export type { ProviderKey } from '@/config/providers.js';
export { OrchestratorStatus } from '@/types/orchestrator.js';

const baseEnabledTools: string[] = [
  'bash_tool',
  'ls_tool',
  'glob_tool',
  'grep_tool',
  'file_new',
  'file_edit',
  'file_read',
  'todo_write',
  'web_search',
  'web_fetch',
  'assign_task',
  'lsp',
  'skill',
  'ask_user_tool'
];

function getEnabledTools(): string[] {
  const tools = [...baseEnabledTools];
  return tools;
}

class SessionBoundMetricsPort implements MetricsPort {
  constructor(
    private sessionId: string,
    private service: typeof sessionMetricsService,
  ) {}

  recordLLMCall(usage: UsageData, cost?: number): void {
    this.service.recordLLMCall(this.sessionId, usage, cost);
  }

  recordToolCall(): void {
    this.service.recordToolCall(this.sessionId);
  }

  recordRequestComplete(responseTimeMs: number): void {
    this.service.recordRequestComplete(this.sessionId, responseTimeMs);
  }

  setContextWindow(limit: number, usage: number): void {
    this.service.setContextWindow(this.sessionId, limit, usage);
  }

  reset(): void {
    this.service.reset(this.sessionId);
  }

  getSnapshot(): MetricsSnapshot {
    return this.service.getSnapshot(this.sessionId);
  }
}

export type OrchestratorConfig = {
  memPersist?: boolean;
  sessionId?: string;
  sessionDir?: string;
  streamingChunks?: boolean;
};

export type UIHandlers = {
  appendLine: (line: MessageLine) => void;
  updateLine: (id: string, content: string) => void;
  updateLineMetadata: (id: string, metadata: Partial<LineMetadata>) => void;
  handleError: (message: string) => void;
};

export class OrchestratorManager {
  private orchestrator: AgentOrchestrator | null = null;
  private memory: MemoryPort<Message> | null = null;
  private conversationStore: ConversationStore | null = null;
  private conversationContext: ConversationContext;
  private model: string = 'demo-echo';
  private status: OrchestratorStatus = OrchestratorStatus.INITIALIZING;
  private sessionId: string | null = null;
  private sessionDir: string | null = null;
  private mcpManager: MCPServerManager | null = null;
  private handlers: UIHandlers | null = null;
  private memPersist: boolean = false;
  private streamingChunks: boolean = true;
  private configManager: ConfigManager;
  private llmFactory: LLMFactory;
  private sessionInitialized: boolean = false;
  private toolRegistry: ToolRegistry | null = null;
  private activeAgentId: string = 'main';
  private previousOrchestrator: AgentOrchestrator | null = null;

  private static readonly WARNING_THRESHOLD = 0.85;
  private static readonly AUTO_SUMMARY_THRESHOLD = 0.95;

  constructor() {
    this.configManager = ConfigManager.getInstance();
    this.conversationContext = new ConversationContext();
    this.llmFactory = new LLMFactory(this.configManager);
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

  /**
   * Create a memory instance (persisted or in-memory) based on configuration.
   */
  /**
   * Create a persisted memory for the given session directory and agent ID.
   * @param sessionDir - The session directory path
   * @param agentId - Agent identifier: 'cli' for main CLI, or 'agent:{type}:{id}' for sub-agents
   */
  private createMemory(sessionDir: string, agentId: string): MemoryPort<Message> {
    const filename = `history.${agentId}.json`;
    return new PersistedMemory<Message>(new JsonFileMemoryPersistence(path.join(sessionDir, filename)));
  }

  /**
   * Resolve session ID and directory from config.
   */
  private resolveSession(config: { sessionId?: string; sessionDir?: string }): {
    sessionId: string;
    sessionDir: string;
  } {
    const sessionId = config.sessionId ?? String(Date.now());
    const { sessionsDir } = this.getProfilePaths();
    const sessionDir = config.sessionDir ?? path.join(sessionsDir, sessionId);
    return { sessionId, sessionDir };
  }

  /**
   * Create a new UIEventAdapter for the given session directory.
   */
  private createEventAdapter(
    sessionDir: string,
    handlers: UIHandlers,
    persistEventLog: boolean,
    streamingChunks: boolean,
  ) {
    return new UIEventAdapter(
      handlers.appendLine,
      handlers.updateLine,
      handlers.updateLineMetadata,
      persistEventLog
        ? {
            filename: path.join(sessionDir, 'events.json'),
            streamingEnabled: streamingChunks,
          }
        : {
            streamingEnabled: streamingChunks,
          },
    );
  }

  async init(options: OrchestratorConfig, handlers: UIHandlers) {
    this.status = OrchestratorStatus.INITIALIZING;

    // Store handlers and options for later use
    this.handlers = handlers;
    this.memPersist = options.memPersist ?? true;
    // this.streamingChunks = options.streamingChunks ?? this.getCurrentConfig().streamingChunks;

    // If sessionId is explicitly provided, use it (e.g., resuming existing session)
    // Otherwise, start with in-memory and create session lazily on first message
    const hasExplicitSession = !!(options.sessionId || options.sessionDir);
    const { sessionId, sessionDir } = hasExplicitSession
      ? this.resolveSession(options)
      : { sessionId: 'temp', sessionDir: '' };

    try {
      // Read config from ConfigManager
      const currentConfig = this.getCurrentConfig();
      const sessionConfig = currentConfig.config.session;
      const persistEventLog = sessionConfig?.persistEventLog ?? false;

      // const persistHttpLog = sessionConfig?.persistHttpLog ?? false;
      // const httpLogFile = persistHttpLog ? path.join(sessionDir, 'http-log.json') : undefined;

      // const llm = this.createLLM(httpLogFile);

      // Start with in-memory unless explicit session provided
      const memory = hasExplicitSession
        ? this.createMemory(sessionDir, 'cli')
        : new InMemoryMemory<Message>();

      // Initialize agent persistence and registry
      const { agentsDir } = this.getProfilePaths();
      fs.mkdirSync(agentsDir, { recursive: true });
      const agentFilePersistence = new AgentFilePersistence({ agentsDir });
      const agentRegistry = new AgentRegistry({ filePersistence: agentFilePersistence });
      await agentRegistry.waitForLoad();

      const skillsConfig = currentConfig.config.skills;
      const enableSkills = skillsConfig?.enabled !== false;
      const toolRegistry = new ToolRegistry({ agentRegistry, enableSkills });

      await LSP.init();
      toolRegistry.setLspService(LSP);

      if (enableSkills) {
        skillsService.setConfig({
          enabled: skillsConfig?.enabled,
          directories: skillsConfig?.directories,
          exclude: skillsConfig?.exclude,
          permissions: skillsConfig?.permissions,
        });
        await skillsService.discover(process.cwd());
        toolRegistry.setSkillProvider(skillsService);
      }

      const agentTools: ToolPort = toolRegistry;

      // Create LLM factory adapter for sub-agents
      const llmFactoryAdapter: LLMFactoryCore = {
        createLLM: (config) => {
          // If provider is specified, check if it has auth configured
          let provider: ProviderKey | undefined;

          if (config.provider) {
            const requestedProvider = config.provider as ProviderKey;
            const currentConfig = this.getCurrentConfig();
            const providerConfig = currentConfig.config.providers?.[requestedProvider];

            // Check if provider has auth configured
            const hasAuth =
              providerConfig?.auth && Array.isArray(providerConfig.auth) && providerConfig.auth.length > 0;

            if (hasAuth) {
              provider = requestedProvider;
            }
          }

          // Fallback to active provider if requested provider has no auth or no provider specified
          if (!provider) {
            provider = this.getCurrentConfig().config.activeProvider || 'openrouter';
          }

          return this.llmFactory.createLLM(provider);
        },
      };

      const mcpManager = new MCPServerManager({
        getConfig: () => this.configManager.getConfig().mcp,
        appendLine: handlers.appendLine,
        handleError: handlers.handleError,
        silentInit: true,
        eventBus,
      });

      new RuntimeEnv({ appName: 'nuvin-agent' }).init(sessionId);

      // Get enabled agents config to filter available agents
      const enabledAgentsConfig = (currentConfig.config.agentsEnabled as Record<string, boolean>) || {};

      const availableAgents = agentRegistry
        .list()
        .filter((agent) => {
          return enabledAgentsConfig[agent.name] !== false;
        })
        .map((agent) => ({
          id: agent.name as string,
          name: agent.name as string,
          description: agent.description as string,
        }));

      const folderTree = await generateFolderTree(process.cwd(), {
        maxDepth: 3,
        maxFiles: 500,
        includeHidden: false,
      });

      const injectedSystem = buildInjectedSystem(
        {
          today: new Date().toLocaleString(),
          platform: process.platform,
          arch: process.arch,
          tempDir: os.tmpdir?.() ?? '',
          workspaceDir: process.cwd(),
          availableAgents,
          folderTree,
        },
        { withSubAgent: true },
      );

      const agentConfig = {
        id: 'nuvin-agent',
        systemPrompt: renderTemplate(prompt, { injectedSystem }),
        temperature: 1,
        topP: 1,
        model: currentConfig.model,
        enabledTools: getEnabledTools(),
        maxToolConcurrency: 10,
        requireToolApproval: currentConfig.requireToolApproval,
        reasoningEffort: currentConfig.reasoningEffort,
        thinking: currentConfig.thinking,
      };

      const agentDeps = {
        memory,
        tools: agentTools,
        events: hasExplicitSession
          ? this.createEventAdapter(sessionDir, handlers, persistEventLog, this.streamingChunks)
          : this.createEventAdapter('', handlers, false, this.streamingChunks),
        metrics: new SessionBoundMetricsPort(sessionId, sessionMetricsService),
      };
      const orchestrator = new AgentOrchestrator(agentConfig, agentDeps);

      // Wire up hooks from config
      const hookPort = createHookPortFromConfig(currentConfig.config.hooks as ConfigHooks | undefined);
      if (hookPort) {
        orchestrator.setHookPort(hookPort);
      }

      // Initialize AssignTool with orchestrator dependencies
      if (toolRegistry?.setOrchestrator) {
        // Config resolver provides fresh config values for sub-agents
        const configResolver = () => {
          const fresh = this.getCurrentConfig();
          return {
            model: fresh.model,
            reasoningEffort: fresh.reasoningEffort,
            thinking: fresh.thinking,
          };
        };

        // Create memory factory for sub-agents - each agent gets its own file with {"default": [...]} format
        // Bind sessionDir so sub-agents only need to provide their agentKey
        const createAgentMemory = hasExplicitSession
          ? (agentKey: string) => this.createMemory(sessionDir, agentKey)
          : () => new InMemoryMemory<Message>();

        toolRegistry.setOrchestrator(agentConfig, agentTools, llmFactoryAdapter, configResolver, createAgentMemory);
        toolRegistry.setEnabledAgents(enabledAgentsConfig);
      }

      this.orchestrator = orchestrator;
      this.memory = memory;
      this.conversationStore = new ConversationStore(memory);
      this.model = currentConfig.model;
      this.sessionId = hasExplicitSession && this.memPersist ? sessionId : null;
      this.sessionDir = hasExplicitSession && this.memPersist ? sessionDir : null;
      this.sessionInitialized = hasExplicitSession;
      this.mcpManager = mcpManager;
      this.toolRegistry = toolRegistry;

      // Set initial LLM - will be refreshed on each send() call
      const initialLLM = this.createLLM();
      this.orchestrator.setLLM(initialLLM);

      // Set session ID for hooks context
      if (this.sessionId) {
        this.orchestrator.setSessionId(this.sessionId);
      }

      this.status = OrchestratorStatus.READY;

      // Only initialize default conversation if we have an explicit session
      if (hasExplicitSession) {
        await this.initializeDefaultConversation();
      }

      // Initialize MCP servers in background without blocking
      this.initializeMCPServersInBackground(mcpManager, handlers);

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
    return this.orchestrator;
  }

  getMemory() {
    return this.memory;
  }

  getStatus() {
    return this.status;
  }

  getModel() {
    return this.model;
  }

  getMCPServers() {
    return this.mcpManager?.getAllServers() || [];
  }

  getTools() {
    return this.orchestrator?.getTools();
  }

  getLLM() {
    return this.orchestrator?.getLLM();
  }

  getConfig() {
    return this.orchestrator?.getConfig();
  }

  getActiveAgentId(): string {
    return this.activeAgentId;
  }

  async updateMCPAllowedTools(allowedToolsConfig: Record<string, Record<string, boolean>>): Promise<void> {
    if (this.mcpManager && this.orchestrator) {
      await this.mcpManager.updateAllowedToolsConfig(allowedToolsConfig);

      // Recalculate enabled tools and update orchestrator
      const allServers = this.mcpManager.getConnectedServers();
      const mcpEnabledTools: string[] = [];

      for (const server of allServers) {
        mcpEnabledTools.push(...server.allowedTools);
      }

      // Update orchestrator's enabled tools list
      const nonMcpTools = getEnabledTools(); // Base tools from initialization
      const updatedEnabledTools = [...nonMcpTools, ...mcpEnabledTools];

      this.orchestrator.updateConfig({
        enabledTools: updatedEnabledTools,
      });
    }
  }

  async reconnectMCPServer(serverId: string): Promise<MCPServerInfo | null> {
    if (!this.mcpManager) return null;

    const serverInfo = await this.mcpManager.reconnectServer(serverId);

    if (serverInfo && serverInfo.status === 'connected' && this.orchestrator) {
      const allServers = this.mcpManager.getConnectedServers();
      const mcpEnabledTools: string[] = [];

      for (const server of allServers) {
        mcpEnabledTools.push(...server.allowedTools);
      }

      const nonMcpTools = getEnabledTools();
      const updatedEnabledTools = [...nonMcpTools, ...mcpEnabledTools];

      this.orchestrator.updateConfig({
        enabledTools: updatedEnabledTools,
      });
    }

    return serverInfo;
  }

  async disconnectMCPServer(serverId: string): Promise<boolean> {
    if (!this.mcpManager) return false;

    const success = await this.mcpManager.disconnectServer(serverId);

    if (success && this.orchestrator) {
      const allServers = this.mcpManager.getConnectedServers();
      const mcpEnabledTools: string[] = [];

      for (const server of allServers) {
        mcpEnabledTools.push(...server.allowedTools);
      }

      const nonMcpTools = getEnabledTools();
      const updatedEnabledTools = [...nonMcpTools, ...mcpEnabledTools];

      this.orchestrator.updateConfig({
        enabledTools: updatedEnabledTools,
      });
    }

    return success;
  }

  getSession() {
    return { sessionId: this.sessionId, sessionDir: this.sessionDir } as const;
  }

  getMcpManager() {
    return this.mcpManager;
  }

  setMcpManager(mcpManager: MCPServerManager | null) {
    this.mcpManager = mcpManager;
  }

  async cleanup() {
    await this.mcpManager?.disconnectAllServers?.();
    await LSP.shutdown();
  }

  private async initializeMCPServersInBackground(mcpManager: MCPServerManager, handlers: UIHandlers): Promise<void> {
    // Run MCP server initialization in background without blocking
    (async () => {
      try {
        const { mcpPorts, enabledTools: mcpEnabledTools } = await mcpManager.initializeServers();

        // Update enabledTools with MCP tools when they become available
        if (mcpPorts.length > 0 && this.orchestrator) {
          // Get current tools and create composite with MCP tools
          const currentTools = this.orchestrator.getTools();
          const compositeTools = new CompositeToolPort([currentTools, ...mcpPorts]);

          // Update the orchestrator's tools and enabled tools list
          this.orchestrator.setTools(compositeTools);

          const updatedEnabledTools = [...getEnabledTools(), ...mcpEnabledTools];
          this.orchestrator.updateConfig({
            enabledTools: updatedEnabledTools,
          });
        }
      } catch (err) {
        console.error('[MCP Init] Failed to initialize MCP servers:', err);
        handlers.handleError(`Failed to initialize MCP servers: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  }

  updateConfig(agentConfigUpdates: Partial<AgentConfig>) {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized, wait a moment');
    }

    this.orchestrator.updateConfig(agentConfigUpdates);

    // Update internal model tracking if model changed
    if (agentConfigUpdates.model) {
      this.model = agentConfigUpdates.model;
    }
  }

  /**
   * Initialize a persisted session lazily (on first message).
   * Migrates from in-memory to persisted storage.
   */
  private async initializePersistedSession(): Promise<void> {
    if (!this.orchestrator || !this.handlers) {
      throw new Error('Orchestrator or handlers not initialized');
    }

    const { sessionId, sessionDir } = this.resolveSession({});
    const currentConfig = this.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    const newMemory = this.createMemory(sessionDir, 'cli');
    const newEventAdapter = this.createEventAdapter(sessionDir, this.handlers, persistEventLog, this.streamingChunks);

    this.orchestrator.setMemory(newMemory);
    this.orchestrator.setEvents(newEventAdapter);
    this.orchestrator.setMetrics(new SessionBoundMetricsPort(sessionId, sessionMetricsService));
    this.orchestrator.setSessionId(sessionId);

    // Also reinitialize sub-agent memory with persisted storage
    if (this.toolRegistry) {
      const createAgentMemory = (agentKey: string) => this.createMemory(sessionDir, agentKey);
      this.toolRegistry.setSharedMemory(createAgentMemory);
    }

    this.memory = newMemory;
    this.conversationStore = new ConversationStore(newMemory);
    this.sessionId = sessionId;
    this.sessionDir = sessionDir;
    this.sessionInitialized = true;

    await this.initializeDefaultConversation();

    // eventBus.emit('ui:header:refresh');
  }

  private async initializeDefaultConversation(): Promise<void> {
    if (!this.conversationStore) {
      return;
    }

    const conversationId = this.conversationContext.getActiveConversationId();
    const conversation = await this.conversationStore.getConversation(conversationId);

    if (!conversation.metadata.createdAt) {
      await this.conversationStore.setConversation(conversationId, {
        messages: [],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
        },
      });
    }
  }

  private async updateConversationMetadataAfterSend(
    conversationId: string,
    metrics?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      toolCalls?: number;
      responseTimeMs?: number;
      cost?: number;
    },
  ): Promise<void> {
    if (!this.conversationStore || !this.memory) {
      return;
    }

    const messages = await this.memory.get(conversationId);
    await this.conversationStore.updateMetadata(conversationId, {
      messageCount: messages.length,
    });

    if (metrics) {
      await this.conversationStore.recordRequestMetrics(conversationId, metrics);
    }
  }

  private createLLM(httpLogFile?: string): LLMPort {
    const currentConfig = this.getCurrentConfig();
    return this.llmFactory.createLLM(currentConfig.provider, { httpLogFile });
  }

  getLLMFactory(): LLMFactory {
    return this.llmFactory;
  }

  private async checkContextWindowUsage(provider: string, model: string): Promise<void> {
    if (!this.sessionId) return;

    const metrics = sessionMetricsService.getSnapshot(this.sessionId);
    const llm = this.orchestrator?.getLLM();
    const limits = await modelLimitsCache.getLimit(provider, model, llm?.getModels?.bind(llm));

    if (!limits) return;

    const usage = metrics.currentPromptTokens ? metrics.currentPromptTokens / limits.contextWindow : 0;

    sessionMetricsService.setContextWindow(this.sessionId, limits.contextWindow, usage);

    if (!metrics.currentPromptTokens) return;

    if (usage >= OrchestratorManager.AUTO_SUMMARY_THRESHOLD) {
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
      } catch (error) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: `⚠️ Auto-summary failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.red,
        });
      }
    } else if (usage >= OrchestratorManager.WARNING_THRESHOLD) {
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
   *
   * @param options.skipEvents - If true, skip emitting UI events (caller handles UI)
   * @returns Summary result with session info
   */
  async summarizeAndCreateNewSession(options: { skipEvents?: boolean } = {}): Promise<{
    summary: string;
    previousSessionId: string;
    newSessionId: string;
    newSessionDir: string;
  }> {
    if (!this.memory) {
      throw new Error('Memory not initialized');
    }

    if (!this.sessionId) {
      throw new Error('Session ID not set');
    }

    const previousSessionId = this.sessionId;

    const summary = await this.summarize();

    const result = await this.createNewConversation({ memPersist: true });

    if (!result.sessionId || !result.sessionDir) {
      throw new Error('Failed to create new session');
    }

    const newSessionId = result.sessionId;
    const newSessionDir = result.sessionDir;

    const conversationId = this.conversationContext.getActiveConversationId();
    if (this.conversationStore) {
      await this.conversationStore.updateMetadata(conversationId, {
        summarizedFrom: previousSessionId,
        topic: `Summary of session ${previousSessionId}`,
      });
    }

    const summaryMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Previous conversation summary:\n\n${summary}`,
      timestamp: new Date().toISOString(),
    };
    await this.memory?.append(conversationId, [summaryMessage]);

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
      previousSessionId,
      newSessionId,
      newSessionDir,
    };
  }

  /**
   * Compress current conversation and create a new session with compressed messages.
   * The original session history is preserved, and the new session links back via metadata.
   *
   * @param compressFn - Function that compresses messages and returns stats
   * @returns Compression result with session info and stats
   */
  async compressAndCreateNewSession<TStats>(
    compressFn: (messages: Message[]) => { compressed: Message[]; stats: TStats },
  ): Promise<{
    previousSessionId: string;
    newSessionId: string;
    newSessionDir: string;
    stats: TStats;
  }> {
    if (!this.memory) {
      throw new Error('Memory not initialized');
    }

    if (!this.sessionId) {
      throw new Error('Session ID not set');
    }

    const previousSessionId = this.sessionId;

    const conversationId = this.conversationContext.getActiveConversationId();
    const history = await this.memory.get(conversationId);
    if (!history || history.length === 0) {
      throw new Error('No conversation history to compress');
    }

    const { compressed, stats } = compressFn(history);

    const result = await this.createNewConversation({ memPersist: true });

    if (!result.sessionId || !result.sessionDir) {
      throw new Error('Failed to create new session');
    }

    const newSessionId = result.sessionId;
    const newSessionDir = result.sessionDir;

    if (this.conversationStore) {
      await this.conversationStore.updateMetadata(conversationId, {
        summarizedFrom: previousSessionId,
        topic: `Compressed from session ${previousSessionId}`,
      });
    }

    await this.memory?.set(conversationId, compressed);

    sessionMetricsService.reset(newSessionId);

    eventBus.emit('conversation:created', { memPersist: true });

    return {
      previousSessionId,
      newSessionId,
      newSessionDir,
      stats,
    };
  }

  async getModelContextLimit(): Promise<number | null> {
    const currentConfig = this.getCurrentConfig();
    const llm = this.orchestrator?.getLLM();
    const limits = await modelLimitsCache.getLimit(currentConfig.provider, currentConfig.model, llm?.getModels);
    return limits?.contextWindow ?? null;
  }

  private async ensureContextWindowLimitSet(provider: string, model: string): Promise<void> {
    const metrics = this.orchestrator?.getMetrics?.();
    if (!metrics) return;

    const llm = this.orchestrator?.getLLM();
    const limits = await modelLimitsCache.getLimit(provider, model, llm?.getModels?.bind(llm));

    if (limits) {
      const currentSnapshot = metrics.getSnapshot();
      metrics.setContextWindow(limits.contextWindow, currentSnapshot.contextWindowUsage ?? 0);
    }
  }

  async send(
    content: UserMessagePayload,
    opts: SendMessageOptions = {},
    agentConfigOverrides: Partial<AgentConfig> = {},
  ) {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized, wait a moment');
    }

    // Lazy session creation: create persisted session on first message
    if (this.memPersist && !this.sessionInitialized) {
      await this.initializePersistedSession();
    }

    const currentConfig = this.getCurrentConfig();
    const persistHttpLog = currentConfig.config.session?.persistHttpLog ?? false;
    const httpLogFile = persistHttpLog && this.sessionDir ? path.join(this.sessionDir, 'http-log.json') : undefined;
    const newLLM = this.createLLM(httpLogFile);
    this.orchestrator.setLLM(newLLM);

    const agentConfig: Partial<AgentConfig> = {
      model: currentConfig.model,
      reasoningEffort: currentConfig.reasoningEffort,
      thinking: currentConfig.thinking,
      ...agentConfigOverrides,
    };

    if (Object.keys(agentConfig).length > 0) {
      this.orchestrator.updateConfig(agentConfig);

      if (agentConfig.model) {
        this.model = agentConfig.model;
      }
    }

    await this.ensureContextWindowLimitSet(currentConfig.provider, currentConfig.model);

    const conversationId = opts.conversationId ?? this.conversationContext.getActiveConversationId();

    const result = await this.orchestrator.send(content, {
      ...opts,
      conversationId,
    });

    if (result && this.conversationStore) {
      await this.updateConversationMetadataAfterSend(conversationId, {
        promptTokens: result.metadata?.promptTokens,
        completionTokens: result.metadata?.completionTokens,
        totalTokens: result.metadata?.totalTokens,
        toolCalls: result.metadata?.toolCalls,
        responseTimeMs: result.metadata?.responseTime,
        cost: result.metadata?.estimatedCost ?? undefined,
      });

      await this.checkContextWindowUsage(currentConfig.provider, currentConfig.model);
    }

    return result;
  }

  reset() {
    this.orchestrator = null;
    this.memory = null;
    this.model = 'demo-echo';
    this.status = OrchestratorStatus.INITIALIZING;
    this.sessionId = null;
    this.sessionDir = null;
    this.sessionInitialized = false;
  }

  /**
   * Creates a new conversation session without reinitializing MCP servers.
   * This is more efficient than full reinit when you just want to start fresh conversation.
   *
   * @param config.memPersist - If true, creates session directory and persists to disk
   * @returns Session info including generated sessionId and sessionDir
   */
  async createNewConversation(config: { memPersist?: boolean } = {}): Promise<{
    sessionId: string | null;
    sessionDir: string | null;
    memory: MemoryPort<Message>;
  }> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized, wait a moment');
    }

    if (!this.handlers) {
      throw new Error('Handlers not initialized');
    }

    const memPersist = config.memPersist ?? this.memPersist;

    const { sessionId, sessionDir } = this.resolveSession({});

    const currentConfig = this.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    const newMemory = this.createMemory(sessionDir, 'cli');

    const newEventAdapter = this.createEventAdapter(sessionDir, this.handlers, persistEventLog, this.streamingChunks);

    this.orchestrator.setMemory(newMemory);
    this.orchestrator.setEvents(newEventAdapter);
    this.orchestrator.setMetrics(new SessionBoundMetricsPort(sessionId, sessionMetricsService));
    if (memPersist) {
      this.orchestrator.setSessionId(sessionId);
    }

    this.memory = newMemory;
    this.conversationStore = new ConversationStore(newMemory);
    this.memPersist = memPersist;
    this.sessionId = memPersist ? sessionId : null;
    this.sessionDir = memPersist ? sessionDir : null;
    this.sessionInitialized = memPersist;

    return {
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      memory: this.memory,
    };
  }

  /**
   * Switch to an existing session. Unlike createNewConversation, this assumes
   * the session directory already exists and won't create new directories.
   */
  async switchToSession(config: { sessionId: string; sessionDir: string }) {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized, wait a moment');
    }

    if (!this.handlers) {
      throw new Error('Handlers not initialized');
    }

    const { sessionId, sessionDir } = config;

    const currentConfig = this.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    const newMemory = this.createMemory(sessionDir, 'cli');

    const newEventAdapter = this.createEventAdapter(sessionDir, this.handlers, persistEventLog, this.streamingChunks);

    this.orchestrator.setMemory(newMemory);
    this.orchestrator.setEvents(newEventAdapter);
    this.orchestrator.setMetrics(new SessionBoundMetricsPort(sessionId, sessionMetricsService));
    this.orchestrator.setSessionId(sessionId);

    this.memory = newMemory;
    this.conversationStore = new ConversationStore(newMemory);
    this.memPersist = true;
    this.sessionId = sessionId;
    this.sessionDir = sessionDir;
    this.sessionInitialized = true;

    return {
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      memory: this.memory,
    } as const;
  }

  async analyzeTopic(userMessage: string, conversationId?: string): Promise<string> {
    const actualConversationId = conversationId ?? this.conversationContext.getActiveConversationId();

    let conversationHistory = '';
    if (this.memory) {
      try {
        const messages = await this.memory.get(actualConversationId);
        if (messages && messages.length > 0) {
          const userMessages = messages.filter((msg) => msg.role === 'user');
          if (userMessages.length > 0) {
            conversationHistory = userMessages
              .map((msg) => {
                let content = '';
                if (typeof msg.content === 'string') {
                  content = msg.content;
                } else if (msg.content && typeof msg.content === 'object' && 'parts' in msg.content) {
                  content = msg.content.parts
                    .map((part) => {
                      if (part.type === 'text') {
                        return part.text;
                      }
                      return '[non-text content]';
                    })
                    .join('\n');
                }
                return content;
              })
              .join('\n\n');
          }
        }
      } catch {
        // If we can't get history, continue with just the current message
      }
    }

    const topicAnalysisPrompt = conversationHistory
      ? `Analyze the following user messages and extract the main topic or intent in 5-10 words. Be concise and descriptive.

Previous user messages:
${conversationHistory}

Current user message: ${userMessage}

Respond with only the topic, no explanation.`
      : `Analyze the following user message and extract the main topic or intent in 5-10 words. Be concise and descriptive.

User message: ${userMessage}

Respond with only the topic, no explanation.`;

    const currentConfig = this.getCurrentConfig();
    const persistHttpLog = currentConfig.config.session?.persistHttpLog ?? false;
    const httpLogFile = persistHttpLog && this.sessionDir ? path.join(this.sessionDir, 'http-log.json') : undefined;
    const llm = this.createLLM(httpLogFile);

    const topicMemory = new InMemoryMemory<Message>();
    const topicTools = new ToolRegistry({ agentRegistry: new AgentRegistry({ filePersistence: undefined }) });

    const topicConfig = {
      id: 'topic-analyzer',
      systemPrompt: 'You are a topic analyzer. Extract the main topic from user messages concisely.',
      temperature: 0.3,
      topP: 1,
      model: currentConfig.model,
      enabledTools: [],
      maxToolConcurrency: 0,
      reasoningEffort: undefined,
    };

    const topicOrchestrator = new AgentOrchestrator(topicConfig, {
      memory: topicMemory,
      llm,
      tools: topicTools,
    });

    try {
      const response = await topicOrchestrator.send(topicAnalysisPrompt);
      return response.content.trim();
    } catch (_error) {
      // Silently fail topic analysis to avoid crashing the main interaction loop
      // Just return a generic fallback or the user message itself if short
      return userMessage.length < 50 ? userMessage : 'Topic analysis failed';
    }
  }

  async updateConversationTopic(conversationId: string, topic: string): Promise<void> {
    if (!this.conversationStore) {
      throw new Error('ConversationStore not initialized');
    }

    await this.conversationStore.updateTopic(conversationId, topic);
  }

  async analyzeAndUpdateTopic(userMessage: string, conversationId?: string): Promise<string> {
    const actualConversationId = conversationId ?? this.conversationContext.getActiveConversationId();
    const topic = await this.analyzeTopic(userMessage);
    await this.updateConversationTopic(actualConversationId, topic);
    return topic;
  }

  getConversationContext(): ConversationContext {
    return this.conversationContext;
  }

  async getConversationMetadata(conversationId: string): Promise<ConversationMetadata> {
    if (!this.conversationStore) {
      throw new Error('ConversationStore not initialized');
    }

    const conversation = await this.conversationStore.getConversation(conversationId);
    return conversation.metadata;
  }

  async listConversations(): Promise<Array<{ id: string; metadata: ConversationMetadata }>> {
    if (!this.conversationStore) {
      throw new Error('ConversationStore not initialized');
    }

    return this.conversationStore.listConversations();
  }

  getConversationStore() {
    return this.conversationStore;
  }

  async summarize(): Promise<string> {
    if (!this.memory) {
      throw new Error('Memory not initialized');
    }

    const conversationId = this.conversationContext.getActiveConversationId();
    const history = await this.memory.get(conversationId);
    if (!history || history.length === 0) {
      return 'No conversation history to summarize.';
    }

    const conversationText = history
      .map((msg) => {
        const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'Tool';
        let content = '';
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (msg.content && typeof msg.content === 'object' && 'parts' in msg.content) {
          content = msg.content.parts
            .map((part) => {
              if (part.type === 'text') {
                return part.text;
              }
              return '[non-text content]';
            })
            .join('\n');
        }
        return `${role}: ${content}`;
      })
      .join('\n\n');

    const summarySystemPrompt = `You are a conversation summarizer. Your task is to create a concise summary of the conversation history provided by the user. Focus on:
- Key topics discussed
- Important decisions or actions taken
- Main questions asked and answers provided
- Overall context and flow of the conversation

Keep the summary clear and concise, typically 3-5 paragraphs.`;

    const currentConfig = this.getCurrentConfig();
    const httpLogFile = this.memPersist && this.sessionDir ? path.join(this.sessionDir, 'http-log.json') : undefined;
    const llm = this.createLLM(httpLogFile);

    const summaryMemory = new InMemoryMemory<Message>();
    const summaryTools = new ToolRegistry({ agentRegistry: new AgentRegistry({ filePersistence: undefined }) });

    const summaryConfig = {
      id: 'summary-agent',
      systemPrompt: summarySystemPrompt,
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

  /**
   * Swap to a different agent by creating a new AgentOrchestrator with the agent's config.
   * Preserves conversation history by copying it to the new orchestrator's memory.
   *
   * @param agentId - The ID of the agent to swap to (from AgentRegistry)
   * @throws Error if orchestrator is not initialized or agent is not found
   */
  async swapToAgent(agentId: string): Promise<void> {
    if (!this.orchestrator || !this.handlers) {
      throw new Error('Orchestrator or handlers not initialized');
    }

    // Get agent registry from tools
    const tools = this.orchestrator.getTools();
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

    const currentConfig = this.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    // Capture current conversation history for preservation
    const conversationId = this.conversationContext.getActiveConversationId();
    const history = this.memory ? await this.memory.get(conversationId) : [];

    // Merge the main config with the agent's config
    const mainConfig = this.orchestrator.getConfig();
    const mergedConfig = mergeAgentConfig(mainConfig, agent);

    // Create new memory for the swapped agent
    let newMemory: MemoryPort<Message>;
    if (this.sessionDir) {
      newMemory = this.createMemory(this.sessionDir, `swapped-${agentId}`);
    } else {
      newMemory = new InMemoryMemory<Message>();
    }

    // Copy conversation history to new memory
    if (history.length > 0) {
      await newMemory.set(conversationId, history);
    }

    // Create new LLM for the agent's model
    const httpLogFile = this.memPersist && this.sessionDir && this.sessionDir.length > 0
      ? path.join(this.sessionDir, 'http-log.json')
      : undefined;
    const newLLM = this.createLLM(httpLogFile);

    // Create new event adapter
    const newEventAdapter = this.createEventAdapter(
      this.sessionDir || '',
      this.handlers,
      persistEventLog,
      this.streamingChunks,
    );

    // Create new metrics port
    const newMetrics = new SessionBoundMetricsPort(
      `swapped-${agentId}`,
      sessionMetricsService,
    );

    // Create new orchestrator with merged config
    const newOrchestrator = new AgentOrchestrator(mergedConfig, {
      memory: newMemory,
      tools,
      events: newEventAdapter,
      metrics: newMetrics,
    });

    // Set LLM before storing
    newOrchestrator.setLLM(newLLM);

    // Store previous orchestrator for potential restore
    this.previousOrchestrator = this.orchestrator;

    // Swap orchestrator state
    this.orchestrator = newOrchestrator;
    this.memory = newMemory;
    this.activeAgentId = agentId;

    // Emit swap event
    eventBus.emit('agent:swapped', {
      type: 'agent:swapped',
      previousAgentId: 'main',
      agentId,
      agentName: agent.name,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Swap back to the main (nuvin-agent) agent.
   * Preserves conversation history by copying it to the new orchestrator's memory.
   *
   * @throws Error if orchestrator is not initialized
   */
  async swapToMain(): Promise<void> {
    if (!this.orchestrator || !this.handlers) {
      throw new Error('Orchestrator or handlers not initialized');
    }

    // Early return if already on main agent
    if (this.activeAgentId === 'main') {
      return;
    }

    const currentConfig = this.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    // Capture current conversation history for preservation
    const conversationId = this.conversationContext.getActiveConversationId();
    const history = this.memory ? await this.memory.get(conversationId) : [];

    // Get the original main agent config by creating a fresh config
    const injectedSystem = buildInjectedSystem(
      {
        today: new Date().toLocaleString(),
        platform: process.platform,
        arch: process.arch,
        tempDir: os.tmpdir?.() ?? '',
        workspaceDir: process.cwd(),
        availableAgents: [],
        folderTree: undefined,
      },
      { withSubAgent: true },
    );

    const mainConfig: AgentConfig = {
      id: 'nuvin-agent',
      systemPrompt: renderTemplate(prompt, { injectedSystem }),
      temperature: 1,
      topP: 1,
      model: currentConfig.model,
      enabledTools: getEnabledTools(),
      maxToolConcurrency: 10,
      requireToolApproval: currentConfig.requireToolApproval,
      reasoningEffort: currentConfig.reasoningEffort,
      thinking: currentConfig.thinking,
    };

    // Create new memory for the main agent
    let newMemory: MemoryPort<Message>;
    if (this.sessionDir) {
      newMemory = this.createMemory(this.sessionDir, 'cli');
    } else {
      newMemory = new InMemoryMemory<Message>();
    }

    // Copy conversation history to new memory
    if (history.length > 0) {
      await newMemory.set(conversationId, history);
    }

    // Create new LLM for the main agent's model
    const httpLogFile = this.memPersist && this.sessionDir && this.sessionDir.length > 0
      ? path.join(this.sessionDir, 'http-log.json')
      : undefined;
    const newLLM = this.createLLM(httpLogFile);

    // Create new event adapter
    const newEventAdapter = this.createEventAdapter(
      this.sessionDir || '',
      this.handlers,
      persistEventLog,
      this.streamingChunks,
    );

    // Create new metrics port
    const newMetrics = new SessionBoundMetricsPort('main', sessionMetricsService);

    // Get tools from current orchestrator
    const tools = this.orchestrator.getTools();

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
    this.previousOrchestrator = this.orchestrator;

    // Swap orchestrator state
    this.orchestrator = newOrchestrator;
    this.memory = newMemory;
    this.activeAgentId = 'main';

    // Emit swap event
    eventBus.emit('agent:swapped', {
      type: 'agent:swapped',
      previousAgentId: this.previousOrchestrator?.getConfig?.()?.id || 'unknown',
      agentId: 'main',
      agentName: 'Main Agent',
      timestamp: new Date().toISOString(),
    });
  }
}

// Default singleton for convenience where a single manager is desired
export const orchestratorManager = new OrchestratorManager();
