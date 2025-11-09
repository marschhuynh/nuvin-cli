import * as crypto from 'node:crypto';
import type { CommandRegistry } from '@/modules/commands/types.js';
import { compressConversation } from './compression.js';

export function registerSummaryCommand(registry: CommandRegistry) {
  registry.register({
    id: '/summary',
    type: 'function',
    description:
      'Summarize the current conversation and replace the history with the summary. Use "/summary beta" for compression-based summarization.',
    category: 'session',
    async handler({ eventBus, memory, orchestrator, rawInput }) {
      if (!orchestrator) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: 'Orchestrator not initialized',
          metadata: { timestamp: new Date().toISOString() },
          color: 'red',
        });
        return;
      }

      if (!memory) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: 'Memory not initialized',
          metadata: { timestamp: new Date().toISOString() },
          color: 'red',
        });
        return;
      }

      const history = await memory.get('cli');
      if (!history || history.length === 0) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: 'No conversation history to summarize',
          metadata: { timestamp: new Date().toISOString() },
          color: 'yellow',
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
          color: 'cyan',
        });

        try {
          const { compressed, stats } = compressConversation(history);

          await memory.set('cli', compressed);

          eventBus.emit('ui:lines:clear');
          eventBus.emit('ui:lastMetadata', null);

          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'system',
            content: `✓ Conversation compressed successfully`,
            metadata: { timestamp: new Date().toISOString() },
            color: 'green',
          });

          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'system',
            content: `📊 Compression stats: ${stats.original} → ${stats.compressed} messages (-${stats.removed}, ${((stats.removed / stats.original) * 100).toFixed(1)}% reduction)`,
            metadata: { timestamp: new Date().toISOString() },
            color: 'cyan',
          });

          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'system',
            content: `🗑️  Removed: ${stats.staleReads} stale reads, ${stats.staleEdits} stale edits, ${stats.staleBash} stale bash, ${stats.failedBash} failed bash`,
            metadata: { timestamp: new Date().toISOString() },
            color: 'cyan',
          });

          eventBus.emit('ui:header:refresh');
        } catch (error) {
          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'system',
            content: `Failed to compress conversation: ${error instanceof Error ? error.message : String(error)}`,
            metadata: { timestamp: new Date().toISOString() },
            color: 'red',
          });
        }
        return;
      }

      eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'system',
        content: 'Generating conversation summary...',
        metadata: { timestamp: new Date().toISOString() },
        color: 'cyan',
      });

      try {
        const summary = await orchestrator.summarize();

        const summaryMessage = {
          id: crypto.randomUUID(),
          role: 'user' as const,
          content: `Previous conversation summary:\n\n${summary}`,
          timestamp: new Date().toISOString(),
        };

        await memory.set('cli', [summaryMessage]);

        eventBus.emit('ui:lines:clear');
        eventBus.emit('ui:lastMetadata', null);

        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: '✓ Conversation summarized successfully',
          metadata: { timestamp: new Date().toISOString() },
          color: 'green',
        });

        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'user',
          content: summaryMessage.content,
          metadata: { timestamp: summaryMessage.timestamp },
        });

        eventBus.emit('ui:header:refresh');
      } catch (error) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'system',
          content: `Failed to summarize conversation: ${error instanceof Error ? error.message : String(error)}`,
          metadata: { timestamp: new Date().toISOString() },
          color: 'red',
        });
      }
    },
  });
}
