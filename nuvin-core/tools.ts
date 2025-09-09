import type { ToolDefinition, ToolExecutionResult, ToolInvocation, ToolPort, MemoryPort } from './ports';
import { PersistedMemory, JsonFileMemoryPersistence } from './persistent';
import { TodoStore, type TodoItem as StoreTodo } from './todo-store';
import { TodoWriteTool } from './tools/TodoWriteTool';
import { WebSearchTool } from './tools/WebSearchTool';
import { WebFetchTool } from './tools/WebFetchTool';
import type { FunctionTool } from './tools/types';

export class ToolRegistry implements ToolPort {
  private tools = new Map<string, FunctionTool>();
  private toolsMemory?: MemoryPort<string>;

  constructor(opts?: { todoMemory?: MemoryPort<StoreTodo>; toolsMemory?: MemoryPort<string> }) {
    this.toolsMemory =
      opts?.toolsMemory ?? new PersistedMemory<string>(new JsonFileMemoryPersistence<string>('.nuvin_tools.json'));

    const todoStore = new TodoStore(
      (opts?.todoMemory) || new PersistedMemory<StoreTodo>(new JsonFileMemoryPersistence<StoreTodo>('.nuvin_todos.json')),
    );

    const toolInstances: FunctionTool[] = [
      new TodoWriteTool(todoStore),
      new WebSearchTool(),
      new WebFetchTool(),
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
    try {
      const fromMem = await this.toolsMemory?.get('tool_names');
      if (fromMem && Array.isArray(fromMem) && fromMem.length) return fromMem;
    } catch {
      console.warn('Failed to load tool names from memory');
    }
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

  async executeToolCalls(
    calls: ToolInvocation[],
    context?: Record<string, unknown>,
    maxConcurrent = 3,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    for (let i = 0; i < calls.length; i += maxConcurrent) {
      const batch = calls.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(async (c) => {
          const startTime = performance.now();
          const impl = this.tools.get(c.name);
          if (!impl) {
            const durationMs = Math.round(performance.now() - startTime);
            return { id: c.id, name: c.name, status: 'error' as const, type: 'text' as const, result: `Tool '${c.name}' not found`, durationMs };
          }
          const r = await impl.execute(c.parameters || {}, context);
          const durationMs = Math.round(performance.now() - startTime);
          return { ...r, id: c.id, name: c.name, durationMs };
        }),
      );
      results.push(...batchResults);
    }
    return results;
  }
}
