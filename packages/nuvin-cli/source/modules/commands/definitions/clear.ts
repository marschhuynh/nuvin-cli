import ansiEscapes from 'ansi-escapes';
import type { CommandRegistry } from '@/modules/commands/types.js';

export function registerClearCommand(registry: CommandRegistry) {
  registry.register({
    id: '/clear',
    type: 'function',
    description: 'Clear all messages from the current conversation',
    category: 'session',
    async handler({ eventBus, memory }) {
      // Clear the conversation history in memory if available
      if (memory) {
        await memory.delete('cli');
      }

      // Clear the UI messages
      eventBus.emit('ui:lines:clear');

      // Clear last metadata
      eventBus.emit('ui:lastMetadata', null);

      // Clear the terminal screen
      try {
        console.log(ansiEscapes.clearScreen);
        console.log(ansiEscapes.cursorTo(0, 0));
      } catch {}

      // Refresh header to re-render
      eventBus.emit('ui:header:refresh');

      // Emit a custom event for clear confirmation
      eventBus.emit('ui:clear:complete');
    },
  });
}
