import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  AgentOrchestrator,
  RuntimeEnv,
  renderTemplate,
  buildInjectedSystem,
  InMemoryMemory,
  ToolRegistry,
  AgentRegistry,
  AgentFilePersistence,
  generateFolderTree,
  ConversationStore,
  type LLMFactory as LLMFactoryCore,
  type AgentConfig,
  type Message,
  type ToolPort,
  type LLMPort,
  type MemoryPort,
  DelegationServiceFactory,
  DefaultSpecialistAgentFactory,
  DefaultDelegationService,
  type DelegationServiceConfig,
} from '@nuvin/nuvin-core';
import { builtinAgents } from '@/agents/index.js';
import type { ProviderKey } from '@/config/providers.js';
import type { CLIConfig, SkillsSettings } from '@/config/types.js';
import type { AuthCredentials } from '@/config/utils.js';
import { MCPServerManager } from './MCPServerManager.js';
import { eventBus } from './EventBus.js';
import type { ConfigManager } from '@/config/manager.js';
import type { LLMFactory } from './LLMFactory.js';
import { createHookPortFromConfig, type ConfigHooks } from './HookLoader.js';
import { sessionMetricsService } from './SessionMetricsService.js';
import { LSP } from './lsp/index.js';
import { skillsService } from './SkillsService.js';
import { getGitContextInfo, type GitContextInfo } from '@/utils/git-context.js';
import {
  getEnabledTools,
  resolveMemoryExtractionConfig,
  INTERNAL_MEMORY_EXTRACTOR_AGENT,
  INTERNAL_MEMORY_EXTRACTOR_INSTRUCTIONS,
} from './orchestrator-modules/constants.js';
import { SessionBoundMetricsPort } from './orchestrator-modules/utils.js';
import type { MCPToolsManager } from './orchestrator-modules/MCPToolsManager.js';
import type { MemoryToolWiring } from './orchestrator-modules/MemoryToolWiring.js';
import type { SessionManager } from './orchestrator-modules/SessionManager.js';
import type { UIHandlers } from './orchestrator-modules/types.js';
import type { OrchestratorConfig } from './IOrchestratorManager.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Shape returned by OrchestratorManager.getCurrentConfig(). */
export type CurrentConfig = {
  config: CLIConfig;
  provider: string;
  model: string;
  smallModel: string;
  auth: AuthCredentials | undefined;
  apiKey: string | undefined;
  oauthConfig: { anthropic: AuthCredentials['oauth'] } | undefined;
  mcpAllowedTools: CLIConfig['mcpAllowedTools'];
  requireToolApproval: boolean | undefined;
  reasoningEffort: string | undefined;
  thinking: CLIConfig['thinking'];
  streamingChunks: boolean;
};

/**
 * Dependencies injected from OrchestratorManager into the builder.
 * Uses typed callbacks following the existing orchestrator-modules pattern.
 */
export type OrchestratorBuilderDeps = {
  configManager: ConfigManager;
  llmFactory: LLMFactory;
  sessionManager: SessionManager;
  mcpToolsManager: MCPToolsManager;
  memoryToolWiring: MemoryToolWiring;
  getProfilePaths: () => { sessionsDir: string; agentsDir: string };
  getCurrentConfig: () => CurrentConfig;
  createLLM: (httpLogFile?: string) => LLMPort;
  streamingChunks: boolean;
};

/** Result of a successful build — all state needed by OrchestratorManager. */
export interface OrchestratorBuildResult {
  orchestrator: AgentOrchestrator;
  memory: MemoryPort<Message>;
  conversationStore: ConversationStore;
  toolRegistry: ToolRegistry;
  model: string;
  enableSkills: boolean;
  sessionState: {
    sessionId: string | null;
    sessionDir: string | null;
    sessionInitialized: boolean;
  };
  hasExplicitSession: boolean;
}

// ─── OrchestratorBuilder ───────────────────────────────────────────────────────

/**
 * Encapsulates the multi-phase orchestrator initialization that was previously
 * a ~320-line procedural init() method. Each phase is independently callable
 * for testability, and the `build()` method orchestrates them in sequence.
 *
 * This is an **internal implementation detail** — not exposed to consumers.
 */
export class OrchestratorBuilder {
  constructor(private deps: OrchestratorBuilderDeps) {}

  // ── Phase 1: Session resolution ────────────────────────────────────────────

  resolveSession(options: OrchestratorConfig): {
    hasExplicitSession: boolean;
    sessionId: string;
    sessionDir: string;
  } {
    const hasExplicitSession = !!(options.sessionId || options.sessionDir);
    const { sessionId, sessionDir } = hasExplicitSession
      ? this.deps.sessionManager.resolveSession(options)
      : { sessionId: 'temp', sessionDir: '' };

    return { hasExplicitSession, sessionId, sessionDir };
  }

  createMemory(
    hasExplicitSession: boolean,
    sessionDir: string,
  ): MemoryPort<Message> {
    return hasExplicitSession
      ? this.deps.sessionManager.createMemory(sessionDir, 'cli')
      : new InMemoryMemory<Message>();
  }

  // ── Phase 2: Agent registry ────────────────────────────────────────────────

  async buildAgentRegistry(
    currentConfig: CurrentConfig,
  ): Promise<AgentRegistry> {
    const { agentsDir } = this.deps.getProfilePaths();
    const configManager = this.deps.configManager;
    const currentProfile =
      typeof configManager.getCurrentProfile === 'function'
        ? configManager.getCurrentProfile()
        : undefined;
    const isDefaultProfile = !currentProfile || currentProfile === 'default';

    // Create directory for project-local agents
    const localAgentsDir = path.join(process.cwd(), '.nuvin', 'agents');
    fs.mkdirSync(localAgentsDir, { recursive: true });

    const localAgentFilePersistence = new AgentFilePersistence({
      agentsDir: localAgentsDir,
    });

    // Profile agents (profile-specific, only if not default profile)
    // For default profile, agentsDir === globalAgentsDir, so we skip to avoid duplication
    let profileAgentFilePersistence: AgentFilePersistence | undefined;
    if (!isDefaultProfile) {
      fs.mkdirSync(agentsDir, { recursive: true });
      profileAgentFilePersistence = new AgentFilePersistence({
        agentsDir,
      });
    }

    // Global agents (home directory)
    const globalAgentsDir = path.join(os.homedir(), '.nuvin', 'agents');
    fs.mkdirSync(globalAgentsDir, { recursive: true });
    const globalAgentFilePersistence = new AgentFilePersistence({
      agentsDir: globalAgentsDir,
    });

    const agentRegistry = new AgentRegistry({
      localFilePersistence: localAgentFilePersistence,
      profileFilePersistence: profileAgentFilePersistence,
      globalFilePersistence: globalAgentFilePersistence,
    });
    await agentRegistry.waitForLoad();

    // Register built-in agents
    for (const agent of builtinAgents) {
      if (agent.name && !agentRegistry.exists(agent.name)) {
        agentRegistry.register({ ...agent, location: 'built-in' });
      }
    }

    // Register internal memory extractor agent
    const extractionSettings = resolveMemoryExtractionConfig(currentConfig.config.memory);
    agentRegistry.register({
      name: INTERNAL_MEMORY_EXTRACTOR_AGENT,
      description: 'Internal memory extraction specialist',
      instructions: INTERNAL_MEMORY_EXTRACTOR_INSTRUCTIONS,
      allowed_tools: ['memory_query', 'memory_save'],
      user_invocable: false,
      temperature: 0.4,
      top_p: 0.1,
      provider: extractionSettings.provider,
      model: extractionSettings.model,
      location: 'built-in',
    });

    return agentRegistry;
  }

  // ── Phase 3: Skills & tools ────────────────────────────────────────────────

  async buildToolRegistry(
    agentRegistry: AgentRegistry,
    enableSkills: boolean,
    skillsConfig: SkillsSettings | undefined,
    delegationServiceFactory: DelegationServiceFactory,
  ): Promise<ToolRegistry> {
    const toolRegistry = new ToolRegistry({
      agentRegistry,
      enableSkills,
      delegationServiceFactory,
    });

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

    return toolRegistry;
  }

  // ── Phase 4: Delegation & LLM factory ──────────────────────────────────────

  buildDelegationFactory(
    gitContext: GitContextInfo,
    enableSkills: boolean,
  ): DelegationServiceFactory {
    return new (class extends DelegationServiceFactory {
      create(config: DelegationServiceConfig) {
        const specialistFactory = new DefaultSpecialistAgentFactory({
          agentListProvider: config.agentListProvider,
          createMemoryForAgent: config.createMemoryForAgent,
          systemContextProvider: () => ({
            timeISO: new Date().toLocaleString(),
            platform: process.platform,
            arch: process.arch,
            tempDir: os.tmpdir?.() ?? '',
            workspaceDir: process.cwd(),
            shell: gitContext.shell,
            gitBranch: gitContext.gitBranch,
            gitRepo: gitContext.gitRepo,
            recentCommits: gitContext.recentCommits,
            availableSkills: enableSkills
              ? skillsService.list().map((s) => ({ name: s.name, description: s.description }))
              : [],
          }),
        });

        return new DefaultDelegationService(
          config.agentRegistry,
          specialistFactory,
          config.commandRunner,
        );
      }
    })();
  }

  buildLLMFactoryAdapter(): LLMFactoryCore {
    return {
      createLLM: (config) => {
        // If provider is specified, check if it has auth configured
        let provider: ProviderKey | undefined;

        if (config.provider) {
          const requestedProvider = config.provider as ProviderKey;
          const currentConfig = this.deps.getCurrentConfig();
          const providerConfig = currentConfig.config.providers?.[requestedProvider];

          // Check if provider has auth configured
          const hasAuth =
            providerConfig?.auth &&
            Array.isArray(providerConfig.auth) &&
            providerConfig.auth.length > 0;

          if (hasAuth) {
            provider = requestedProvider;
          }
        }

        // Fallback to active provider if requested provider has no auth or no provider specified
        if (!provider) {
          provider = this.deps.getCurrentConfig().config.activeProvider || 'openrouter';
        }

        return this.deps.llmFactory.createLLM(provider);
      },
    };
  }

  // ── Phase 5: MCP manager ───────────────────────────────────────────────────

  createMCPManager(handlers: UIHandlers): MCPServerManager {
    return new MCPServerManager({
      getConfig: () => this.deps.configManager.getConfig().mcp,
      appendLine: handlers.appendLine,
      handleError: handlers.handleError,
      silentInit: true,
      eventBus,
    });
  }

  // ── Phase 6: System prompt ─────────────────────────────────────────────────

  async buildSystemContext(
    agentRegistry: AgentRegistry,
    enableSkills: boolean,
    gitContext: GitContextInfo,
    currentConfig: CurrentConfig,
  ): Promise<{ agentConfig: AgentConfig }> {
    const enabledAgentsConfig = (currentConfig.config.agentsEnabled as Record<string, boolean>) || {};

    const availableAgents = agentRegistry
      .list()
      .filter((agent) => {
        if (agent.name === 'nuvin') return false;
        if (agent.user_invocable === false) return false;
        return enabledAgentsConfig[agent.name as string] !== false;
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

    const availableSkills = enableSkills
      ? skillsService.list().map((s) => ({ name: s.name, description: s.description }))
      : [];

    const injectedSystem = buildInjectedSystem(
      {
        today: new Date().toLocaleString(),
        platform: process.platform,
        arch: process.arch,
        tempDir: os.tmpdir?.() ?? '',
        workspaceDir: process.cwd(),
        availableAgents,
        folderTree,
        shell: gitContext.shell,
        gitBranch: gitContext.gitBranch,
        gitRepo: gitContext.gitRepo,
        recentCommits: gitContext.recentCommits,
        availableSkills,
      },
      { withSubAgent: true },
    );

    // Get main agent prompt from registry (allows user override)
    // Falls back to built-in prompt.ts if registry fails to load
    const mainAgentTemplate = agentRegistry.get('nuvin');
    const mainPrompt = mainAgentTemplate?.instructions as string;

    const agentConfig: AgentConfig = {
      id: 'nuvin-agent',
      systemPrompt: renderTemplate(mainPrompt, { injectedSystem }),
      ...(mainAgentTemplate?.temperature !== undefined && {
        temperature: mainAgentTemplate.temperature,
      }),
      ...(mainAgentTemplate?.top_p !== undefined && { topP: mainAgentTemplate.top_p }),
      maxTokens: mainAgentTemplate?.max_tokens,
      model: currentConfig.model,
      enabledTools: getEnabledTools(currentConfig.config.memory),
      maxToolConcurrency: 10,
      requireToolApproval: currentConfig.requireToolApproval,
      reasoningEffort: currentConfig.reasoningEffort,
      thinking: currentConfig.thinking,
    };

    return { agentConfig };
  }

  // ── Phase 7: Orchestrator construction ─────────────────────────────────────

  buildOrchestrator(
    agentConfig: AgentConfig,
    agentTools: ToolPort,
    memory: MemoryPort<Message>,
    hasExplicitSession: boolean,
    sessionId: string,
    sessionDir: string,
    persistEventLog: boolean,
    handlers: UIHandlers,
    currentConfig: CurrentConfig,
  ): AgentOrchestrator {
    const agentDeps = {
      memory,
      tools: agentTools,
      events: hasExplicitSession
        ? this.deps.sessionManager.createEventAdapter(
            sessionDir,
            handlers,
            persistEventLog,
            this.deps.streamingChunks,
          )
        : this.deps.sessionManager.createEventAdapter(
            '',
            handlers,
            false,
            this.deps.streamingChunks,
          ),
      metrics: new SessionBoundMetricsPort(sessionId, sessionMetricsService),
    };

    const orchestrator = new AgentOrchestrator(agentConfig, agentDeps);

    // Wire up hooks from config
    const hookPort = createHookPortFromConfig(currentConfig.config.hooks as ConfigHooks | undefined);
    if (hookPort) {
      orchestrator.setHookPort(hookPort);
    }

    return orchestrator;
  }

  // ── Phase 8: Wiring ────────────────────────────────────────────────────────

  wireToolRegistry(
    toolRegistry: ToolRegistry,
    agentConfig: AgentConfig,
    agentTools: ToolPort,
    llmFactoryAdapter: LLMFactoryCore,
    hasExplicitSession: boolean,
    sessionDir: string,
    enabledAgentsConfig: Record<string, boolean>,
  ): void {
    if (toolRegistry?.setOrchestrator) {
      // Config resolver provides fresh config values for sub-agents
      const configResolver = (): Partial<AgentConfig> => {
        const fresh = this.deps.getCurrentConfig();
        return {
          model: fresh.model,
          reasoningEffort: fresh.reasoningEffort,
          thinking: fresh.thinking,
        };
      };

      // Create memory factory for sub-agents — each agent gets its own file
      // Bind sessionDir so sub-agents only need to provide their agentKey
      const createAgentMemory = hasExplicitSession
        ? (agentKey: string) => this.deps.sessionManager.createMemory(sessionDir, agentKey)
        : () => new InMemoryMemory<Message>();

      toolRegistry.setOrchestrator(
        agentConfig,
        agentTools,
        llmFactoryAdapter,
        configResolver,
        createAgentMemory,
      );
      toolRegistry.setEnabledAgents(enabledAgentsConfig);
    }
  }

  // ── Main entry point ───────────────────────────────────────────────────────

  /**
   * Orchestrates all phases in sequence to produce an OrchestratorBuildResult.
   * This is the only method that OrchestratorManager.init() needs to call.
   */
  async build(
    options: OrchestratorConfig,
    handlers: UIHandlers,
  ): Promise<OrchestratorBuildResult> {
    // Phase 1: Session resolution
    this.deps.sessionManager.setMemPersist(options.memPersist ?? true);
    const { hasExplicitSession, sessionId, sessionDir } = this.resolveSession(options);

    // Read config
    const currentConfig = this.deps.getCurrentConfig();
    const sessionConfig = currentConfig.config.session;
    const persistEventLog = sessionConfig?.persistEventLog ?? false;

    // Phase 1 cont: Memory
    const memory = this.createMemory(hasExplicitSession, sessionDir);

    // Phase 2: Agent registry
    const agentRegistry = await this.buildAgentRegistry(currentConfig);

    // Resolve skills config
    const skillsConfig = currentConfig.config.skills;
    const enableSkills = skillsConfig?.enabled !== false;

    // Phase 3+4: Git context, delegation factory, and tool registry
    const gitContext = await getGitContextInfo();
    const delegationFactory = this.buildDelegationFactory(gitContext, enableSkills);
    const toolRegistry = await this.buildToolRegistry(
      agentRegistry,
      enableSkills,
      skillsConfig,
      delegationFactory,
    );
    const agentTools: ToolPort = toolRegistry;

    // Phase 4 cont: LLM factory adapter
    const llmFactoryAdapter = this.buildLLMFactoryAdapter();

    // Phase 5: MCP manager
    const mcpManager = this.createMCPManager(handlers);
    this.deps.mcpToolsManager.setMcpManager(mcpManager);

    // Init runtime env
    new RuntimeEnv({ appName: 'nuvin-agent' }).init(sessionId);

    // Phase 6: System prompt
    const { agentConfig } = await this.buildSystemContext(
      agentRegistry,
      enableSkills,
      gitContext,
      currentConfig,
    );

    // Phase 7: Orchestrator construction
    const orchestrator = this.buildOrchestrator(
      agentConfig,
      agentTools,
      memory,
      hasExplicitSession,
      sessionId,
      sessionDir,
      persistEventLog,
      handlers,
      currentConfig,
    );

    // Phase 8: Wiring
    const enabledAgentsConfig = (currentConfig.config.agentsEnabled as Record<string, boolean>) || {};
    this.wireToolRegistry(
      toolRegistry,
      agentConfig,
      agentTools,
      llmFactoryAdapter,
      hasExplicitSession,
      sessionDir,
      enabledAgentsConfig,
    );

    const memPersist = this.deps.sessionManager.getMemPersist();

    return {
      orchestrator,
      memory,
      conversationStore: new ConversationStore(memory),
      toolRegistry,
      model: currentConfig.model,
      enableSkills,
      sessionState: {
        sessionId: hasExplicitSession && memPersist ? sessionId : null,
        sessionDir: hasExplicitSession && memPersist ? sessionDir : null,
        sessionInitialized: hasExplicitSession,
      },
      hasExplicitSession,
    };
  }
}

