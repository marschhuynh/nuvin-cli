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
import { DirLsTool } from './tools/DirLsTool.js';
import { AgentRegistry } from './agent-registry.js';
import { AssignTool } from './tools/AssignTool.js';
import { AgentManagerCommandRunner, DelegationServiceFactory } from './delegation/index.js';

export class ToolRegistry implements ToolPort, AgentAwareToolPort, OrchestratorAwareToolPort {
  private tools = new Map<string, FunctionTool>();
  private toolsMemory?: MemoryPort<string>;
  private agentRegistry: AgentRegistry;
  private delegationServiceFactory?: DelegationServiceFactory;
  private assignTool?: AssignTool;
  private enabledAgentsConfig: Record<string, boolean> = {};

  constructor(opts?: {
    todoMemory?: MemoryPort<StoreTodo>;
    toolsMemory?: MemoryPort<string>;
    agentRegistry?: AgentRegistry;
    delegationServiceFactory?: DelegationServiceFactory;
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
      new DirLsTool({ allowAbsolute: true }),
    ];

    for (const tool of toolInstances) {
      this.tools.set(tool.name, tool);
    }
    void this.persistToolNames();
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
  ): void {
    const commandRunner = new AgentManagerCommandRunner(config, tools, llmFactory, configResolver);

    const factory = this.delegationServiceFactory ?? new DelegationServiceFactory();
    const delegationService = factory.create({
      agentRegistry: this.agentRegistry,
      commandRunner,
      agentListProvider: () =>
        this.agentRegistry
          .list()
          .map((agent) => ({
            id: agent.id,
            name: agent.name,
            description: agent.description,
          })),
    });

    delegationService.setEnabledAgents(this.enabledAgentsConfig);

    this.assignTool = new AssignTool(delegationService);
    this.tools.set('assign_task', this.assignTool);
    void this.persistToolNames();
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

          const startTime = performance.now();
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
