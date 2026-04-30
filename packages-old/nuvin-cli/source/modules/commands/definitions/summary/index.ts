import * as crypto from 'node:crypto';
import type { CommandRegistry } from '@/modules/commands/types.js';
import { compressConversation } from './compression.js';
import { theme } from '@/theme.js';

export function registerSummaryCommand(registry: CommandRegistry) {
  registry.register({
    id: '/summary',
    type: 'function',
    description: 'Summarize the current conversation and create a new session with the summary',
    category: 'session',
    async handler({ eventBus, orchestratorManager, rawInput }) {
      if (!orchestratorManager) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: 'Orchestrator not initialized, wait a moment',
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.red,
        });
        return;
      }

      const memory = orchestratorManager.getMemory();
      if (!memory) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: 'Memory not initialized',
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.red,
        });
        return;
      }

      const conversationId = orchestratorManager.getConversationContext().getActiveConversationId();
      const history = await memory.get(conversationId);
      if (!history || history.length === 0) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: 'No conversation history to summarize',
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.yellow,
        });
        return;
      }

      const parts = rawInput.trim().split(/\s+/);
      const mode = parts.slice(1).join(' ').trim().toLowerCase();
      const useBetaMode = mode === 'beta';

      if (useBetaMode) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: '🧪 Using beta compression algorithm...',
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.cyan,
        });

        try {
          const result = await orchestratorManager.compressAndCreateNewSession(compressConversation);

          eventBus.emit('ui:lines:clear');

          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'system',
            content: `✓ Conversation compressed and new session created`,
            metadata: { timestamp: new Date().toISOString() },
            color: theme.tokens.green,
          });

          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'system',
            content: `Compression stats: ${result.stats.original} → ${result.stats.compressed} messages (-${result.stats.removed}, ${((result.stats.removed / result.stats.original) * 100).toFixed(1)}% reduction)`,
            metadata: { timestamp: new Date().toISOString() },
            color: theme.tokens.cyan,
          });

          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'system',
            content: `Removed: ${result.stats.staleReads} stale reads, ${result.stats.staleEdits} stale edits, ${result.stats.staleBash} stale bash, ${result.stats.failedBash} failed bash`,
            metadata: { timestamp: new Date().toISOString() },
            color: theme.tokens.cyan,
          });

          eventBus.emit('ui:header:refresh');
        } catch (error) {
          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'system',
            content: `Failed to compress conversation: ${error instanceof Error ? error.message : String(error)}`,
            metadata: { timestamp: new Date().toISOString() },
            color: theme.tokens.red,
          });
        }
        return;
      }

      eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'system',
        content: 'Generating conversation summary...',
        metadata: { timestamp: new Date().toISOString() },
        color: theme.tokens.cyan,
      });

      try {
        const result = await orchestratorManager.summarizeAndCreateNewSession({ skipEvents: true });

        eventBus.emit('ui:lines:clear');

        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: '✓ Conversation summarized and new session created',
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.green,
        });

        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'user',
          content: `Previous conversation summary:\n\n${result.summary}`,
          metadata: { timestamp: new Date().toISOString() },
        });

        eventBus.emit('ui:header:refresh');
      } catch (error) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: `Failed to summarize conversation: ${error instanceof Error ? error.message : String(error)}`,
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.red,
        });
      }
    },
  });
}
