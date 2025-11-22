import type { CommandRegistry } from '@/modules/commands/types.js';
import { OrchestratorStatus } from '@/services/OrchestratorManager.js';

export function registerNewCommand(registry: CommandRegistry) {
  registry.register({
    id: '/new',
    type: 'function',
    description: 'Start a new conversation session',
    category: 'session',
    async handler({ eventBus, config, orchestrator }) {
      if (!orchestrator) {
        eventBus.emit('ui:error', 'Orchestrator not available');
        return;
      }

      if (orchestrator.getStatus() !== OrchestratorStatus.READY) {
        eventBus.emit('ui:error', 'Cannot start new conversation: System is still initializing');
        return;
      }

      // Get memPersist config from session.memPersist (supports both CLI flags and config file)
      const memPersist = config?.get<boolean>('session.memPersist') ?? false;

      // Clear the UI messages (but don't delete the current session's memory!)
      eventBus.emit('ui:lines:clear');

      // Clear last metadata
      eventBus.emit('ui:lastMetadata', null);

      // Emit event to create new conversation (without MCP reinitialization)
      // This will switch to a new memory instance, preserving the old session
      eventBus.emit('ui:new:conversation', { memPersist });
    },
  });
}
