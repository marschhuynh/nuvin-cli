import * as crypto from 'node:crypto';
import type { CommandRegistry } from '@/modules/commands/types.js';

export function registerExitCommand(registry: CommandRegistry) {
  registry.register({
    id: '/exit',
    type: 'function',
    description: 'Exit the application after cleaning up resources.',
    category: 'session',
    async handler({ eventBus }) {
      // Emit cleanup message
      eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'info',
        content: 'Cleaning up resources...',
        metadata: { timestamp: new Date().toISOString() },
        color: 'cyan',
      });

      // Simulate cleanup delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Emit completion message
      eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'info',
        content: 'Cleanup complete. Exiting now.',
        metadata: { timestamp: new Date().toISOString() },
        color: 'cyan',
      });

      // Exit the application
      setTimeout(() => {
        process.exit(0);
      }, 500);
    },
  });
}
