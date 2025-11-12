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
  type UserMessagePayload,
  type SendMessageOptions,
  type ConversationMetadata,
} from '@nuvin/nuvin-core';
import { UIEventAdapter, type MessageLine, type MessageMetadata, type LineMetadata } from '@/adapters/index.js';
import { prompt } from '@/prompt.js';
import type { ProviderKey } from '@/config/providers.js';
import { MCPServerManager } from './MCPServerManager.js';
import { withRetry, AbortError } from '@/utils/retry-utils.js';
import { eventBus } from './EventBus.js';
import { ConfigManager } from '@/config/manager.js';
import { getProviderAuth } from '@/config/utils.js';
import { LLMFactory } from './LLMFactory.js';

// Default directory paths
const NUVIN_CLI_DIR = path.join(os.homedir(), '.nuvin-cli');
const DEFAULT_SESSIONS_DIR = path.join(NUVIN_CLI_DIR, 'sessions');
const DEFAULT_AGENTS_DIR = path.join(NUVIN_CLI_DIR, 'agents');
const defaultModels: Record<ProviderKey, string> = {
  openrouter: 'openai/gpt-4.1',
  deepinfra: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
  github: 'gpt-4.1',
  zai: 'glm-4.5',
  anthropic: 'claude-sonnet-4-5',
  moonshot: 'moonshot-v1-8k',
};
export type { ProviderKey } from '@/config/providers.js';

const enabledTools: string[] = [
  'bash_tool',
  'dir_ls',
  'file_new',
  'file_edit',
  'file_read',
  'todo_write',
  'web_search',
  'web_fetch',
  'assign_task',
];

export type OrchestratorConfig = {
  memPersist?: boolean;
  mcpConfigPath?: string;
  sessionId?: string;
  sessionDir?: string;
  streamingChunks?: boolean;
};

export type UIHandlers = {
  appendLine: (line: MessageLine) => void;
  updateLine: (id: string, content: string) => void;
  updateLineMetadata: (id: string, metadata: Partial<LineMetadata>) => void;
  setLastMetadata: (metadata: MessageMetadata) => void;
  handleError: (message: string) => void;
};

export class OrchestratorManager {
  private orchestrator: AgentOrchestrator | null = null;
  private memory: MemoryPort<Message> | null = null;
  private conversationStore: ConversationStore | null = null;
  private conversationContext: ConversationContext;
  private model: string = 'demo-echo';
  private status: 'Initializing...' | 'Ready' | 'Error' = 'Initializing...';
  private sessionId: string | null = null;
  private sessionDir: string | null = null;
  private mcpManager: MCPServerManager | null = null;
  private handlers: UIHandlers | null = null;
  private memPersist: boolean = false;
  private streamingChunks: boolean = false;
  private configManager: ConfigManager;
  private llmFactory: LLMFactory;

  constructor(configManager?: ConfigManager, conversationContext?: ConversationContext) {
    this.configManager = configManager ?? ConfigManager.getInstance();
    this.conversationContext = conversationContext ?? new ConversationContext();
    this.llmFactory = new LLMFactory(this.configManager);
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
    const streamingChunks = config.streamingChunks ?? false;

    const oauthConfig = auth?.oauth
      ? {
          anthropic: auth.oauth,
        }
      : undefined;

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
      streamingChunks,
    };
  }

  /**
   * Create session directories for persisted memory.
   */
  private createSessionDirectories(sessionDir: string): void {
    try {
      fs.mkdirSync(DEFAULT_SESSIONS_DIR, { recursive: true });
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch {
      // Ignore errors - directories might already exist
    }
  }

  /**
   * Create a memory instance (persisted or in-memory) based on configuration.
   */
  private createMemory(sessionDir: string, memPersist: boolean): MemoryPort<Message> {
    return memPersist
      ? new PersistedMemory<Message>(new JsonFileMemoryPersistence(path.join(sessionDir, 'history.json')))
      : new InMemoryMemory<Message>();
  }

  /**
   * Resolve session ID and directory from config.
   */
  private resolveSession(config: { sessionId?: string; sessionDir?: string }): {
    sessionId: string;
    sessionDir: string;
  } {
    const sessionId = config.sessionId ?? String(Date.now());
    const sessionDir = config.sessionDir ?? path.join(DEFAULT_SESSIONS_DIR, sessionId);
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
      handlers.setLastMetadata,
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
    this.status = 'Initializing...';

    const { sessionId, sessionDir } = this.resolveSession(options);

    // Store handlers and options for later use
    this.handlers = handlers;
    this.memPersist = options.memPersist ?? false;
    this.streamingChunks = options.streamingChunks ?? this.getCurrentConfig().streamingChunks;

    try {
      // Only create session directories if memPersist is enabled
      if (this.memPersist) {
        this.createSessionDirectories(sessionDir);
      }

      // Create agents directory
      try {
        fs.mkdirSync(DEFAULT_AGENTS_DIR, { recursive: true });
      } catch {
        // Ignore errors - directory might already exist
      }

      // Read config from ConfigManager
      const currentConfig = this.getCurrentConfig();
      const sessionConfig = currentConfig.config.session;
      const persistHttpLog = sessionConfig?.persistHttpLog ?? false;
      const persistEventLog = sessionConfig?.persistEventLog ?? false;

      const httpLogFile = persistHttpLog ? path.join(sessionDir, 'http-log.json') : undefined;

      const llm = this.createLLM(httpLogFile);

      const memory = this.createMemory(sessionDir, this.memPersist);

      // Initialize agent persistence and registry
      const agentFilePersistence = new AgentFilePersistence({ agentsDir: DEFAULT_AGENTS_DIR });
      const agentRegistry = new AgentRegistry({ filePersistence: agentFilePersistence });

      // Wait for agents to finish loading before building system prompt
      await agentRegistry.waitForLoad();

      const toolRegistry = new ToolRegistry({ agentRegistry });
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

          return this.llmFactory.createLLM(provider, { httpLogFile });
        },
      };

      const mcpManager = new MCPServerManager({
        configPath: options.mcpConfigPath,
        config: currentConfig.config.mcp?.servers ? { mcpServers: currentConfig.config.mcp.servers } : null,
        appendLine: handlers.appendLine,
        handleError: handlers.handleError,
        silentInit: true,
      });

      // Load allowed MCP tools from config if available
      if (currentConfig.mcpAllowedTools) {
        mcpManager.setAllowedToolsConfig(currentConfig.mcpAllowedTools);
      }

      const runtimeEnv = new RuntimeEnv({ appName: 'nuvin-agent' });
      runtimeEnv.init(sessionId);

      // Get enabled agents config to filter available agents
      const enabledAgentsConfig = (currentConfig.config.agentsEnabled as Record<string, boolean>) || {};
      
      const availableAgents = agentRegistry
        .list()
        .filter((agent) => agent.id && agent.name && agent.description)
        .filter((agent) => {
          // Include agent if it's enabled or if no explicit config exists (default to enabled)
          const agentId = agent.id as string;
          return enabledAgentsConfig[agentId] !== false; // Include if true or undefined
        })
        .map((agent) => ({
          id: agent.id as string,
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
        id: 'core-demo-agent',
        systemPrompt: renderTemplate(prompt, { injectedSystem }),
        temperature: 1,
        topP: 1,
        model: currentConfig.model,
        enabledTools,
        maxToolConcurrency: 3,
        requireToolApproval: currentConfig.requireToolApproval,
        reasoningEffort: currentConfig.reasoningEffort,
      };

      const agentDeps = {
        memory,
        llm,
        tools: agentTools,
        context: new SimpleContextBuilder(),
        ids: new SimpleId(),
        clock: new SystemClock(),
        cost: new SimpleCost(),
        reminders: new NoopReminders(),
        events: this.createEventAdapter(sessionDir, handlers, persistEventLog, this.streamingChunks),
      };
      const orchestrator = new AgentOrchestrator(agentConfig, agentDeps);

      // Initialize AssignTool with orchestrator dependencies
      if (toolRegistry?.setOrchestrator) {
        // Config resolver provides fresh config values for sub-agents
        const configResolver = () => {
          const fresh = this.getCurrentConfig();
          return {
            model: fresh.model,
            reasoningEffort: fresh.reasoningEffort,
          };
        };

        toolRegistry.setOrchestrator(agentConfig, agentTools, llmFactoryAdapter, configResolver);
      }

      // Note: Enabled agents configuration will be loaded and set by the /agent command

      this.orchestrator = orchestrator;
      this.memory = memory;
      this.conversationStore = new ConversationStore(memory);
      this.model = currentConfig.model;
      this.sessionId = this.memPersist ? sessionId : null;
      this.sessionDir = this.memPersist ? sessionDir : null;
      this.mcpManager = mcpManager;
      this.status = 'Ready';

      await this.initializeDefaultConversation();

      // Initialize MCP servers in background without blocking
      this.initializeMCPServersInBackground(mcpManager, handlers);

      return {
        orchestrator: this.orchestrator,
        memory: this.memory,
        model: this.model,
        sessionId: this.sessionId,
        sessionDir: this.sessionDir,
      } as const;
    } catch (e) {
      this.status = 'Error';
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
      const nonMcpTools = enabledTools; // Base tools from initialization
      const updatedEnabledTools = [...nonMcpTools, ...mcpEnabledTools];

      this.orchestrator.updateConfig({
        enabledTools: updatedEnabledTools,
      });
    }
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
    if (this.mcpManager) {
      await this.mcpManager.disconnectAllServers();
    }
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

          const updatedEnabledTools = [...enabledTools, ...mcpEnabledTools];
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
      throw new Error('Orchestrator not initialized');
    }

    this.orchestrator.updateConfig(agentConfigUpdates);

    // Update internal model tracking if model changed
    if (agentConfigUpdates.model) {
      this.model = agentConfigUpdates.model;
    }
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
    tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  ): Promise<void> {
    if (!this.conversationStore || !this.memory) {
      return;
    }

    const messages = await this.memory.get(conversationId);
    await this.conversationStore.updateMetadata(conversationId, {
      messageCount: messages.length,
    });

    if (tokenUsage) {
      await this.conversationStore.incrementTokens(conversationId, tokenUsage);
    }
  }

  private createLLM(httpLogFile?: string): LLMPort {
    const currentConfig = this.getCurrentConfig();
    return this.llmFactory.createLLM(currentConfig.provider, { httpLogFile });
  }

  getLLMFactory(): LLMFactory {
    return this.llmFactory;
  }

  async send(
    content: UserMessagePayload,
    opts: SendMessageOptions = {},
    agentConfigOverrides: Partial<AgentConfig> = {},
  ) {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    const currentConfig = this.getCurrentConfig();
    const persistHttpLog = currentConfig.config.session?.persistHttpLog ?? false;
    const httpLogFile = persistHttpLog && this.sessionDir ? path.join(this.sessionDir, 'http-log.json') : undefined;
    const newLLM = this.createLLM(httpLogFile);
    this.orchestrator.setLLM(newLLM);

    const agentConfig: Partial<AgentConfig> = {
      model: currentConfig.model,
      reasoningEffort: currentConfig.reasoningEffort,
      ...agentConfigOverrides,
    };

    if (Object.keys(agentConfig).length > 0) {
      this.orchestrator.updateConfig(agentConfig);

      if (agentConfig.model) {
        this.model = agentConfig.model;
      }
    }

    const conversationId = opts.conversationId ?? this.conversationContext.getActiveConversationId();

    try {
      const result = await withRetry(
        async () => {
          return this.orchestrator?.send(content, {
            ...opts,
            conversationId,
          });
        },
        {
          maxRetries: 10,
          delayMs: 10000,
          signal: opts.signal,
          onRetry: (attempt, error, remainingSeconds) => {
            eventBus.emit('ui:line', {
              id: crypto.randomUUID(),
              type: 'system',
              content: `Request failed (attempt ${attempt}/${10}). Retrying in ${remainingSeconds}s... Error: ${error.message}`,
              metadata: { timestamp: new Date().toISOString() },
              color: 'yellow',
            });
          },
          onNonRetryable: (error) => {
            eventBus.emit('ui:line', {
              id: crypto.randomUUID(),
              type: 'system',
              content: `Request failed with error: ${error.message}`,
              metadata: { timestamp: new Date().toISOString() },
              color: 'red',
            });
          },
        },
      );

      if (result && this.conversationStore) {
        await this.updateConversationMetadataAfterSend(conversationId, {
          promptTokens: result.metadata?.promptTokens,
          completionTokens: result.metadata?.completionTokens,
          totalTokens: result.metadata?.totalTokens,
        });
      }

      return result;
    } catch (error) {
      // Re-throw AbortError as-is to preserve abort semantics
      if (error instanceof AbortError) {
        throw error;
      }
      // Re-throw any abort-related errors as AbortError for consistency
      if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
        throw new AbortError(error.message);
      }
      // Don't re-throw other errors as they've already been displayed by onNonRetryable
      return null;
    }
  }

  async retry(opts: SendMessageOptions = {}, agentConfigOverrides: Partial<AgentConfig> = {}) {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    const currentConfig = this.getCurrentConfig();
    const persistHttpLog = currentConfig.config.session?.persistHttpLog ?? false;
    const httpLogFile = persistHttpLog && this.sessionDir ? path.join(this.sessionDir, 'http-log.json') : undefined;
    const newLLM = this.createLLM(httpLogFile);
    this.orchestrator.setLLM(newLLM);

    const agentConfig: Partial<AgentConfig> = {
      model: currentConfig.model,
      reasoningEffort: currentConfig.reasoningEffort,
      ...agentConfigOverrides,
    };

    if (Object.keys(agentConfig).length > 0) {
      this.orchestrator.updateConfig(agentConfig);

      if (agentConfig.model) {
        this.model = agentConfig.model;
      }
    }

    const conversationId = opts.conversationId ?? this.conversationContext.getActiveConversationId();

    try {
      const result = await withRetry(
        async () => {
          return this.orchestrator?.send('', { ...opts, conversationId, retry: true });
        },
        {
          maxRetries: 10,
          delayMs: 10000,
          signal: opts.signal,
          onRetry: (attempt, error, remainingSeconds) => {
            eventBus.emit('ui:line', {
              id: crypto.randomUUID(),
              type: 'system',
              content: `LLM retry failed (attempt ${attempt}/${10}). Retrying in ${remainingSeconds}s... Error: ${error.message}`,
              metadata: { timestamp: new Date().toISOString() },
              color: 'yellow',
            });
          },
          onNonRetryable: (error) => {
            eventBus.emit('ui:line', {
              id: crypto.randomUUID(),
              type: 'system',
              content: `LLM retry failed with non-retryable error: ${error.message}`,
              metadata: { timestamp: new Date().toISOString() },
              color: 'red',
            });
          },
        },
      );

      if (result && this.conversationStore) {
        await this.updateConversationMetadataAfterSend(conversationId, {
          promptTokens: result.metadata?.promptTokens,
          completionTokens: result.metadata?.completionTokens,
          totalTokens: result.metadata?.totalTokens,
        });
      }

      return result;
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }
      if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
        throw new AbortError(error.message);
      }
      // Don't re-throw other errors as they've already been displayed by onNonRetryable
      return null;
    }
  }

  reset() {
    this.orchestrator = null;
    this.memory = null;
    this.model = 'demo-echo';
    this.status = 'Initializing...';
    this.sessionId = null;
    this.sessionDir = null;
  }

  /**
   * Creates a new conversation session without reinitializing MCP servers.
   * This is more efficient than full reinit when you just want to start fresh conversation.
   */
  async createNewConversation(config: { sessionId?: string; sessionDir?: string; memPersist?: boolean }) {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    if (!this.handlers) {
      throw new Error('Handlers not initialized');
    }

    const { sessionId, sessionDir } = this.resolveSession(config);

    // Use memPersist from parameter, or fall back to the initial setting
    const memPersist = config.memPersist ?? this.memPersist;

    // Create session directories if memPersist is enabled
    if (memPersist) {
      this.createSessionDirectories(sessionDir);
    }

    // Get persistence settings from config
    const currentConfig = this.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    // Create new memory instance
    const newMemory = this.createMemory(sessionDir, memPersist);

    // Create new event adapter for the new session
    const newEventAdapter = this.createEventAdapter(sessionDir, this.handlers, persistEventLog, this.streamingChunks);

    // Update orchestrator with new memory and events
    this.orchestrator.setMemory(newMemory);
    this.orchestrator.setEvents(newEventAdapter);

    // Update internal state
    this.memory = newMemory;
    this.conversationStore = new ConversationStore(newMemory);
    this.memPersist = memPersist;
    this.sessionId = memPersist ? sessionId : null;
    this.sessionDir = memPersist ? sessionDir : null;

    return {
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      memory: this.memory,
    } as const;
  }

  async analyzeTopic(userMessage: string): Promise<string> {
    const topicAnalysisPrompt = `Analyze the following user message and extract the main topic or intent in 3-5 words. Be concise and descriptive.

User message: ${userMessage}

Respond with only the topic, no explanation.`;

    const currentConfig = this.getCurrentConfig();
    const persistHttpLog = currentConfig.config.session?.persistHttpLog ?? false;
    const httpLogFile = persistHttpLog && this.sessionDir ? path.join(this.sessionDir, 'http-log.json') : undefined;
    const llm = this.createLLM(httpLogFile);

    const topicMemory = new InMemoryMemory<Message>();
    const topicTools = new ToolRegistry({ agentRegistry: new AgentRegistry({ filePersistence: null }) });

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

    const topicDeps = {
      memory: topicMemory,
      llm,
      tools: topicTools,
      context: new SimpleContextBuilder(),
      ids: new SimpleId(),
      clock: new SystemClock(),
      cost: new SimpleCost(),
      reminders: new NoopReminders(),
      events: null,
    };

    const topicOrchestrator = new AgentOrchestrator(topicConfig, topicDeps);
    const response = await topicOrchestrator.send(topicAnalysisPrompt);

    return response.content.trim();
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

    const history = await this.memory.get('cli');
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
    const summaryTools = new ToolRegistry({ agentRegistry: new AgentRegistry({ filePersistence: null }) });

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
      events: null,
    };

    const summaryOrchestrator = new AgentOrchestrator(summaryConfig, summaryDeps);

    const response = await summaryOrchestrator.send(conversationText);

    return response.content;
  }
}

// Default singleton for convenience where a single manager is desired
export const orchestratorManager = new OrchestratorManager();
