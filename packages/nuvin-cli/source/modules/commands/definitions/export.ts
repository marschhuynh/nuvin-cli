import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { CommandRegistry } from '@/modules/commands/types.js';
import { theme } from '@/theme';

export function registerExportCommand(registry: CommandRegistry) {
  registry.register({
    id: '/export',
    type: 'function',
    description: 'Export conversation history to a JSON file',
    category: 'session',
    async handler({ rawInput, eventBus, orchestratorManager }) {
      const parts = rawInput.trim().split(/\s+/);
      const filename = parts.slice(1).join(' ').trim();

      if (!filename) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'error',
          content: 'Usage: /export <filename>',
          metadata: { timestamp: new Date().toISOString() },
          color: 'red',
        });
        return;
      }

      try {
        if (!orchestratorManager) {
          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'error',
            content: 'No active session found',
            metadata: { timestamp: new Date().toISOString() },
            color: 'red',
          });
          return;
        }

        const memory = orchestratorManager.getMemory();
        if (!memory) {
          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'error',
            content: 'Memory not initialized',
            metadata: { timestamp: new Date().toISOString() },
            color: 'red',
          });
          return;
        }

        const conversationId = orchestratorManager.getConversationContext().getActiveConversationId();
        const messages = await memory.get(conversationId);

        if (!messages || messages.length === 0) {
          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'info',
            content: 'No conversation history to export',
            metadata: { timestamp: new Date().toISOString() },
            color: 'yellow',
          });
          return;
        }

        // Write to file in current directory
        const outputPath = path.resolve(process.cwd(), filename);
        await fs.writeFile(outputPath, JSON.stringify({ cli: messages }, null, 2), 'utf-8');

        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'info',
          content: `Exported ${messages.length} messages to ${outputPath}`,
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.green,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'error',
          content: `Failed to export conversation: ${message}`,
          metadata: { timestamp: new Date().toISOString() },
          color: 'red',
        });
      }
    },
  });
}
