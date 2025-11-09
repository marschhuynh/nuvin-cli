import type { CommandRegistry } from '@/modules/commands/types.js';

export function registerSudoCommand(registry: CommandRegistry) {
  registry.register({
    id: '/sudo',
    type: 'function',
    description: 'Toggle sudo mode (bypass tool approval requirement).',
    category: 'debug',
    async handler({ eventBus }) {
      // Emit event to toggle sudo mode
      // The main app will handle this and update the state
      eventBus.emit('command:sudo:toggle', undefined);
    },
  });
}
