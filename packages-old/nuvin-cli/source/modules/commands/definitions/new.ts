import * as crypto from 'node:crypto';
import ansiEscapes from 'ansi-escapes';
import type { CommandRegistry } from '@/modules/commands/types.js';
import { OrchestratorStatus } from '@/services/OrchestratorManager.js';
import { sessionMetricsService } from '@/services/SessionMetricsService.js';
import { theme } from '@/theme';

export function registerNewCommand(registry: CommandRegistry) {
  registry.register({
    id: '/new',
    type: 'function',
    description: 'Start a new conversation session',
    category: 'session',
    async handler({ eventBus, config, orchestratorManager }) {
      if (!orchestratorManager) {
        eventBus.emit('ui:error', 'Orchestrator not available');
        return;
      }

      if (orchestratorManager.getStatus() !== OrchestratorStatus.READY) {
        eventBus.emit('ui:error', 'Cannot start new conversation: System is still initializing');
        return;
      }

      const memPersist = config?.get<boolean>('session.memPersist') ?? false;

      eventBus.emit('ui:lines:clear');
      console.log(ansiEscapes.clearTerminal);
      eventBus.emit('ui:header:refresh');

      try {
        const { sessionId } = await orchestratorManager.createNewConversation({ memPersist });

        if (sessionId) {
          sessionMetricsService.reset(sessionId);
        }

        eventBus.emit('conversation:created', { memPersist });

        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'info',
          content: 'Started new conversation',
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.green,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        eventBus.emit('ui:error', `Failed to start new conversation: ${message}`);
      }
    },
  });
}
