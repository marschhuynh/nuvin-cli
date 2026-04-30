import type { AgentCatalog, AgentCommandRunner, DelegationService } from './types.js';
import type { MemoryPort, Message } from '../ports.js';
import { DefaultDelegationService } from './delegation-service.js';
import { DefaultSpecialistAgentFactory } from './agent-factory.js';

export interface DelegationServiceConfig {
  agentRegistry: AgentCatalog;
  commandRunner: AgentCommandRunner;
  agentListProvider?: () => Array<{ id: string; name: string; description: string }>;
  createMemoryForAgent?: (agentKey: string) => MemoryPort<Message>;
}

export class DelegationServiceFactory {
  create(config: DelegationServiceConfig): DelegationService {
    const specialistFactory = new DefaultSpecialistAgentFactory({
      agentListProvider: config.agentListProvider,
      createMemoryForAgent: config.createMemoryForAgent,
    });

    return new DefaultDelegationService(config.agentRegistry, specialistFactory, config.commandRunner);
  }
}
