import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolInvocation,
  ToolPort,
  AgentAwareToolPort,
  OrchestratorAwareToolPort,
  MemoryPort,
  AgentConfig,
  LLMFactory,
  Message,
} from './ports.js';
import { ErrorReason } from './ports.js';
import { InMemoryMemory } from './persistent/index.js';
import { TodoStore, type TodoItem as StoreTodo } from './todo-store.js';
import { TodoWriteTool } from './tools/TodoWriteTool.js';
import { WebSearchTool } from './tools/WebSearchTool.js';
import { WebFetchTool } from './tools/WebFetchTool.js';
import { FileReadTool } from './tools/FileReadTool.js';
import { FileNewTool } from './tools/FileNewTool.js';
import { FileEditTool } from './tools/FileEditTool.js';
import type { FunctionTool } from './tools/types.js';
import { BashTool } from './tools/BashTool.js';
import { LsTool } from './tools/LsTool.js';
import { GlobTool } from './tools/GlobTool.js';
import { GrepTool } from './tools/GrepTool.js';
import { SkillTool, type SkillProvider } from './tools/SkillTool.js';
import { AgentRegistry } from './agent-registry.js';
import { AssignTool } from './tools/AssignTool.js';
import { LspTool, type LspService } from './tools/LspTool.js';
import { AgentManagerCommandRunner, DelegationServiceFactory } from './delegation/index.js';
import { AskUserTool } from './tools/AskUserTool.js';
import { memorySaveToolDefinition, type MemorySaveToolInput } from './tools/memory-save-tool.js';
import {
  memoryQueryToolDefinition,
  type MemoryQueryToolInput,
  type MemoryQueryToolResult,
} from './tools/memory-query-tool.js';
import { ComputerUseTool } from './tools/ComputerUseTool.js';

type MemoryToolExecutionContext = {
  conversationId?: string;
  messageId?: string;
  toolCallId?: string;
  agentId?: string;
};

export class ToolRegistry implements ToolPort, AgentAwareToolPort, OrchestratorAwareToolPort {
  private tools = new Map<string, FunctionTool<unknown, unknown>>();
  private toolsMemory?: MemoryPort<string>;
  private agentRegistry: AgentRegistry;
  private delegationServiceFactory?: DelegationServiceFactory;
  private assignTool?: AssignTool;
  private lspTool?: LspTool;
  private skillTool?: SkillTool;
  private enabledAgentsConfig: Record<string, boolean> = {};
  private memoryHandler: ((input: MemorySaveToolInput) => Promise<string>) | null = null;
  private memoryQueryHandler:
    | ((input: MemoryQueryToolInput, context?: MemoryToolExecutionContext) => Promise<MemoryQueryToolResult>)
    | null = null;

  // Stored for re-initialization when memory changes (lazy session init)
  private orchestratorConfig?: AgentConfig;
  private orchestratorTools?: ToolPort;
  private orchestratorLLMFactory?: LLMFactory;
  private orchestratorConfigResolver?: () => Partial<AgentConfig>;

  constructor(opts?: {
    todoMemory?: MemoryPort<StoreTodo>;
    toolsMemory?: MemoryPort<string>;
    agentRegistry?: AgentRegistry;
    delegationServiceFactory?: DelegationServiceFactory;
    enableSkills?: boolean;
  }) {
    this.toolsMemory = opts?.toolsMemory || new InMemoryMemory();
    this.agentRegistry = opts?.agentRegistry || new AgentRegistry();
    this.delegationServiceFactory = opts?.delegationServiceFactory;

    const todoStore = new TodoStore(opts?.todoMemory || new InMemoryMemory());

    const toolInstances: FunctionTool<unknown, unknown>[] = [
      new TodoWriteTool(todoStore),
      new WebSearchTool(),
      new WebFetchTool(),
      new FileReadTool({ allowAbsolute: true }),
      new FileNewTool(),
      new FileEditTool(),
      new BashTool(),
      new LsTool({ allowAbsolute: true }),
      new GlobTool({ allowAbsolute: true }),
      new GrepTool({ allowAbsolute: true }),
      new AskUserTool(),
      ...(process.platform === 'darwin' && process.env.NUVIN_COMPUTER_USE === '1' ? [new ComputerUseTool()] : []),
    ];

    for (const tool of toolInstances) {
      this.tools.set(tool.name, tool);
    }

    this.lspTool = new LspTool();
    this.tools.set(this.lspTool.name, this.lspTool as FunctionTool<unknown, unknown>);

    if (opts?.enableSkills !== false) {
      this.skillTool = new SkillTool();
      this.tools.set(this.skillTool.name, this.skillTool as FunctionTool<unknown, unknown>);
    }

    void this.persistToolNames();
  }

  setLspService(service: LspService): void {
    if (this.lspTool) {
      this.lspTool.setLspService(service);
    }
  }

  setSkillProvider(provider: SkillProvider): void {
    if (this.skillTool) {
      this.skillTool.setProvider(provider);
    }
  }

  updateSkillToolDescription(): void {
    if (this.skillTool) {
      this.skillTool.updateDescription();
    }
  }

  /**
   * Wire the memory_save tool handler from the CLI layer.
   * Called after the MemoryService is available (in OrchestratorManager.init).
   */
  setMemoryHandler(handler: (input: MemorySaveToolInput) => Promise<string>): void {
    this.memoryHandler = handler;
  }

  /**
   * Wire the memory_query tool handler from the CLI layer.
   * Called after the MemoryService is available (in OrchestratorManager.init).
   */
  setMemoryQueryHandler(
    handler: (input: MemoryQueryToolInput, context?: MemoryToolExecutionContext) => Promise<MemoryQueryToolResult>,
  ): void {
    this.memoryQueryHandler = handler;
  }

  private async persistToolNames() {
    try {
      const names = Array.from(this.tools.keys());
      await this.toolsMemory?.set('tool_names', names);
    } catch {
      console.warn('Failed to persist tool names to memory');
    }
  }

  async listRegisteredTools(): Promise<string[]> {
    return Array.from(this.tools.keys());
  }

  getToolDefinitions(enabledTools: string[]): ToolDefinition[] {
    const list: ToolDefinition[] = [];
    for (const name of enabledTools) {
      if (name === 'memory_save') {
        if (this.memoryHandler) {
          list.push({ type: 'function', function: memorySaveToolDefinition });
        }
        continue;
      }
      if (name === 'memory_query') {
        if (this.memoryQueryHandler) {
          list.push({ type: 'function', function: memoryQueryToolDefinition });
        }
        continue;
      }
      const impl = this.tools.get(name);
      if (impl) list.push({ type: 'function', function: impl.definition() });
    }
    return list;
  }

  /**
   * Initialize AssignTool with orchestrator dependencies (lazy initialization)
   */
  setOrchestrator(
    config: AgentConfig,
    tools: ToolPort,
    llmFactory?: LLMFactory,
    configResolver?: () => Partial<AgentConfig>,
    createMemoryForAgent?: (agentKey: string) => MemoryPort<Message>,
  ): void {
    // Store for re-initialization
    this.orchestratorConfig = config;
    this.orchestratorTools = tools;
    this.orchestratorLLMFactory = llmFactory;
    this.orchestratorConfigResolver = configResolver;

    const commandRunner = new AgentManagerCommandRunner(config, tools, llmFactory, configResolver, createMemoryForAgent);

    const factory = this.delegationServiceFactory ?? new DelegationServiceFactory();
    const delegationService = factory.create({
      agentRegistry: this.agentRegistry,
      commandRunner,
      agentListProvider: () =>
        this.agentRegistry.list()
          .filter((agent) => agent.name !== 'nuvin')
          .map((agent) => ({
            id: agent.name,
            name: agent.name,
            description: agent.description,
          })),
      createMemoryForAgent, // Pass memory factory for resume functionality
    });

    delegationService.setEnabledAgents(this.enabledAgentsConfig);

    this.assignTool = new AssignTool(delegationService);
    this.tools.set('assign_task', this.assignTool);

    void this.persistToolNames();
  }

  /**
   * Update memory factory for sub-agent sessions.
   * Called when session is lazily initialized and memory needs to switch from in-memory to persisted.
   */
  setSharedMemory(createMemoryForAgent: (agentKey: string) => MemoryPort<Message>): void {
    if (!this.orchestratorConfig || !this.orchestratorTools) {
      return; // Not initialized yet
    }
    // Re-initialize with new memory factory
    this.setOrchestrator(
      this.orchestratorConfig,
      this.orchestratorTools,
      this.orchestratorLLMFactory,
      this.orchestratorConfigResolver,
      createMemoryForAgent,
    );
  }

  /**
   * Get the agent registry
   */
  getAgentRegistry(): AgentRegistry {
    return this.agentRegistry;
  }

  /**
   * Update the enabled agents configuration for AssignTool
   */
  setEnabledAgents(enabledAgents: Record<string, boolean>): void {
    this.enabledAgentsConfig = enabledAgents;
    this.assignTool?.setEnabledAgents(enabledAgents);
  }

  async executeToolCalls(
    calls: ToolInvocation[],
    context?: Record<string, unknown>,
    maxConcurrent = 3,
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    for (let i = 0; i < calls.length; i += maxConcurrent) {
      if (signal?.aborted) {
        const remaining = calls.slice(i);
        for (const call of remaining) {
          results.push({
            id: call.id,
            name: call.name,
            status: 'error' as const,
            type: 'text' as const,
            result: 'Tool execution aborted by user',
            metadata: { errorReason: ErrorReason.Aborted },
            durationMs: 0,
          });
        }
        break;
      }

      const batch = calls.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(async (c) => {
          if (signal?.aborted) {
            return {
              id: c.id,
              name: c.name,
              status: 'error' as const,
              type: 'text' as const,
              result: 'Tool execution aborted by user',
              metadata: { errorReason: ErrorReason.Aborted },
              durationMs: 0,
            };
          }

          if (c.editInstruction) {
            const editResult = `${c.editInstruction}
<system-reminder>
This is not a result from the tool call. The user wants something else. Please follow the user's instruction.
DO NOT mention this explicitly to the user.
</system-reminder>`;
            return {
              id: c.id,
              name: c.name,
              status: 'error' as const,
              type: 'text' as const,
              result: editResult,
              metadata: { errorReason: ErrorReason.Edited, editInstruction: c.editInstruction },
              durationMs: 0,
            };
          }

          const startTime = performance.now();

          if (c.name === 'memory_save') {
            if (!this.memoryHandler) {
              const durationMs = Math.round(performance.now() - startTime);
              return {
                id: c.id,
                name: c.name,
                status: 'error' as const,
                type: 'text' as const,
                result: 'Memory system is not enabled.',
                metadata: { errorReason: ErrorReason.ToolNotFound },
                durationMs,
              };
            }
            try {
              const result = await this.memoryHandler(c.parameters as unknown as MemorySaveToolInput);
              const durationMs = Math.round(performance.now() - startTime);
              return {
                id: c.id,
                name: c.name,
                status: 'success' as const,
                type: 'text' as const,
                result,
                durationMs,
              };
            } catch (error) {
              const durationMs = Math.round(performance.now() - startTime);
              return {
                id: c.id,
                name: c.name,
                status: 'error' as const,
                type: 'text' as const,
                result: `Failed to save memory: ${error instanceof Error ? error.message : String(error)}`,
                metadata: { errorReason: ErrorReason.Unknown },
                durationMs,
              };
            }
          }

          if (c.name === 'memory_query') {
            if (!this.memoryQueryHandler) {
              const durationMs = Math.round(performance.now() - startTime);
              return {
                id: c.id,
                name: c.name,
                status: 'error' as const,
                type: 'text' as const,
                result: 'Memory query system is not enabled.',
                metadata: { errorReason: ErrorReason.ToolNotFound },
                durationMs,
              };
            }
            try {
              const result = await this.memoryQueryHandler(c.parameters as unknown as MemoryQueryToolInput, {
                conversationId: typeof context?.['conversationId'] === 'string' ? (context['conversationId'] as string) : undefined,
                messageId: typeof context?.['messageId'] === 'string' ? (context['messageId'] as string) : undefined,
                toolCallId: c.id,
                agentId: typeof context?.['agentId'] === 'string' ? (context['agentId'] as string) : undefined,
              });
              const durationMs = Math.round(performance.now() - startTime);
              return {
                id: c.id,
                name: c.name,
                status: 'success' as const,
                type: 'json' as const,
                result,
                durationMs,
              };
            } catch (error) {
              const durationMs = Math.round(performance.now() - startTime);
              return {
                id: c.id,
                name: c.name,
                status: 'error' as const,
                type: 'text' as const,
                result: `Failed to query memory: ${error instanceof Error ? error.message : String(error)}`,
                metadata: { errorReason: ErrorReason.Unknown },
                durationMs,
              };
            }
          }

          const impl = this.tools.get(c.name);
          if (!impl) {
            const durationMs = Math.round(performance.now() - startTime);
            return {
              id: c.id,
              name: c.name,
              status: 'error' as const,
              type: 'text' as const,
              result: `Tool '${c.name}' not found`,
              metadata: { errorReason: ErrorReason.ToolNotFound },
              durationMs,
            };
          }
          const r = await impl.execute(c.parameters || {}, { ...context, toolCallId: c.id, signal });
          const durationMs = Math.round(performance.now() - startTime);
          return { ...r, id: c.id, name: c.name, durationMs };
        }),
      );
      results.push(...batchResults);
    }
    return results;
  }
}
