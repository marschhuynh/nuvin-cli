import type { AgentCommandRunner } from './types.js';
import type { AgentConfig, ToolPort, AgentEvent, LLMFactory, MemoryPort, Message, MetricsPort } from '../ports.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { AgentManager } from '../agent-manager.js';

export class AgentManagerCommandRunner implements AgentCommandRunner {
  constructor(
    private readonly delegatingConfig: AgentConfig,
    private readonly delegatingTools: ToolPort,
    private readonly llmFactory?: LLMFactory,
    private readonly configResolver?: () => Partial<AgentConfig>,
    private readonly createMemoryForAgent?: (agentKey: string) => MemoryPort<Message>,
    private readonly metricsPort?: MetricsPort,
  ) {}

  async run(config: Parameters<AgentManager['executeTask']>[0], context?: ToolExecutionContext) {
    const eventPort = context?.eventPort;
    const signal = context?.signal;

    const agentManager = new AgentManager(
      this.delegatingConfig,
      this.delegatingTools,
      this.llmFactory,
      eventPort ? (event: AgentEvent) => eventPort.emit(event) : undefined,
      this.configResolver,
      this.createMemoryForAgent,
      this.metricsPort,
    );
    return agentManager.executeTask(config, signal);
  }
}
