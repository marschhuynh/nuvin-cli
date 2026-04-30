import type { ToolDefinition, ToolExecutionResult, ToolInvocation, ToolPort } from './ports.js';
import type { AgentRegistry } from './agent-registry.js';

type DelegationAwarePort = ToolPort & {
  setEnabledAgents?: (enabledAgents: Record<string, boolean>) => void;
  getAgentRegistry?: () => AgentRegistry | undefined;
  listRegisteredTools?: () => Promise<string[]>;
};

export class CompositeToolPort implements ToolPort {
  constructor(private ports: ToolPort[]) {}

  getToolDefinitions(enabledTools: string[]): ToolDefinition[] {
    const all: ToolDefinition[] = [];
    for (const p of this.ports) {
      try {
        all.push(...p.getToolDefinitions(enabledTools));
      } catch {
        // ignore individual port errors
      }
    }
    return all;
  }

  async executeToolCalls(
    calls: ToolInvocation[],
    context?: Record<string, unknown>,
    maxConcurrent = 3,
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult[]> {
    if (signal?.aborted) {
      return calls.map((c) => ({
        id: c.id,
        name: c.name,
        status: 'error' as const,
        type: 'text' as const,
        result: 'Tool execution aborted by user',
        durationMs: 0,
      }));
    }

    const portDefs = this.ports.map(
      (p) => new Set(p.getToolDefinitions(calls.map((c) => c.name)).map((d) => d.function.name)),
    );

    const portBatches: ToolInvocation[][] = this.ports.map(() => [] as ToolInvocation[]);
    const fallbackBatch: ToolInvocation[] = [];

    for (const c of calls) {
      let assigned = false;
      for (let i = 0; i < portDefs.length; i++) {
        if (portDefs[i]?.has(c.name)) {
          portBatches[i]?.push(c);
          assigned = true;
          break;
        }
      }
      if (!assigned) fallbackBatch.push(c);
    }

    const results: ToolExecutionResult[] = [];
    for (let i = 0; i < this.ports.length; i++) {
      const batch = portBatches[i];
      const port = this.ports[i];
      if (!batch || batch.length === 0 || !port) continue;
      const out = await port.executeToolCalls(batch, context, maxConcurrent, signal);
      if (out) results.push(...out);
    }

    for (const c of fallbackBatch) {
      results.push({ id: c.id, name: c.name, status: 'error', type: 'text', result: `No tool found for ${c.name}` });
    }

    return results;
  }

  setEnabledAgents(enabledAgents: Record<string, boolean>): void {
    for (const port of this.ports) {
      const setter = (port as DelegationAwarePort).setEnabledAgents;
      if (typeof setter === 'function') {
        setter.call(port, enabledAgents);
      }
    }
  }

  getAgentRegistry(): AgentRegistry | undefined {
    for (const port of this.ports) {
      const getter = (port as DelegationAwarePort).getAgentRegistry;
      if (typeof getter === 'function') {
        const registry = getter.call(port);
        if (registry) {
          return registry;
        }
      }
    }
    return undefined;
  }

  async listRegisteredTools(): Promise<string[]> {
    const allTools = new Set<string>();
    for (const port of this.ports) {
      const lister = (port as DelegationAwarePort).listRegisteredTools;
      if (typeof lister === 'function') {
        try {
          const tools = await lister.call(port);
          for (const tool of tools) {
            allTools.add(tool);
          }
        } catch (error) {
          console.warn('Failed to list tools from port:', error);
        }
      }
    }
    return Array.from(allTools);
  }
}
