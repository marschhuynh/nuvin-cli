import { useEffect, useState } from 'react';
import * as crypto from 'node:crypto';
import { useInput } from 'ink';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { HistorySelection } from '@/components/HistorySelection.js';
import { scanAvailableSessions, loadSessionHistory } from '@/hooks/useSessionManagement.js';

import type { SessionInfo } from '@/types.js';

const HistoryCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useInput(
    (_input, key) => {
      if (key.escape) {
        deactivate();
      }
    },
    { isActive: true },
  );

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const sessions = await scanAvailableSessions();

        if (sessions.length === 0) {
          // No sessions found - emit info message and close
          context.eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'info',
            content: 'No previous session histories found.',
            metadata: { timestamp: new Date().toISOString() },
            color: 'yellow',
          });
          deactivate();
          return;
        }

        setAvailableSessions(sessions);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        context.eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'error',
          content: `Failed to load session histories: ${message}`,
          metadata: { timestamp: new Date().toISOString() },
          color: 'red',
        });
        deactivate();
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, [context.eventBus, deactivate]);

  useEffect(() => {
    const handleHistorySelected = async (session: SessionInfo) => {
      try {
        deactivate();

        const result = await loadSessionHistory(session.sessionId);

        context.eventBus.emit('ui:lines:clear', undefined);
        context.eventBus.emit('ui:header:refresh', undefined);

        if (result.kind === 'messages') {
          // Set metadata - use ui:lastMetadata event
          if (result.metadata) {
            context.eventBus.emit('ui:lastMetadata', result.metadata);
          } else {
            // Clear metadata if not available
            context.eventBus.emit('ui:lastMetadata', null);
          }

          // Load ALL CLI messages into memory first - this ensures conversation continuity
          let memoryLoadSuccess = false;
          if (result.cliMessages && result.cliMessages.length > 0 && context.memory) {
            try {
              await context.memory.set('cli', result.cliMessages);

              // Verify memory was loaded correctly
              const loadedMessages = await context.memory.get('cli');
              if (loadedMessages.length !== result.cliMessages.length) {
                throw new Error(
                  `Memory verification failed: expected ${result.cliMessages.length} messages, got ${loadedMessages.length}`,
                );
              }

              memoryLoadSuccess = true;
            } catch (err) {
              console.error('Failed to set memory:', err);
              context.eventBus.emit('ui:line', {
                id: crypto.randomUUID(),
                type: 'error',
                content: `⚠ Warning: Failed to load messages into memory: ${err instanceof Error ? err.message : String(err)}`,
                metadata: { timestamp: new Date().toISOString() },
                color: 'red',
              });
            }
          }

          // Set UI lines - note: app.tsx limits display to 2000 lines for performance
          context.eventBus.emit('ui:lines:set', result.lines);

          // Notify user about what was loaded
          const sessionDate = new Date(parseInt(session.sessionId, 10)).toLocaleString();
          const totalLines = result.lines.length;
          const messageCount = result.cliMessages?.length || 0;

          const memoryStatus = memoryLoadSuccess
            ? ` (${messageCount} messages in conversation memory)`
            : ' (memory load failed - conversation history unavailable)';

          context.eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'info',
            content: `Loaded ${messageCount} messages from session ${sessionDate}${memoryStatus}`,
            metadata: { timestamp: new Date().toISOString() },
            color: memoryLoadSuccess ? 'green' : 'yellow',
          });

          // Warn if display was truncated (2000 line limit in app.tsx)
          if (totalLines > 2000) {
            context.eventBus.emit('ui:line', {
              id: crypto.randomUUID(),
              type: 'info',
              content: `⚠ Display showing last 2000 of ${totalLines} lines (all ${messageCount} messages loaded in memory)`,
              metadata: { timestamp: new Date().toISOString() },
              color: 'yellow',
            });
          }
        } else if (result.kind === 'empty') {
          const msg =
            result.reason === 'no_messages'
              ? 'Selected session has no messages to load.'
              : `No history file found for session ${session.sessionId}`;
          context.eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'info',
            content: msg,
            metadata: { timestamp: new Date().toISOString() },
            color: 'yellow',
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        context.eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'error',
          content: `Failed to load session: ${message}`,
          metadata: { timestamp: new Date().toISOString() },
          color: 'red',
        });
      }
    };

    context.eventBus.on('ui:history:selected', handleHistorySelected);

    return () => {
      context.eventBus.off('ui:history:selected', handleHistorySelected);
    };
  }, [context.eventBus, deactivate, context.memory]);

  if (loading || availableSessions.length === 0) {
    return null;
  }

  return <HistorySelection availableSessions={availableSessions} />;
};

export function registerHistoryCommand(registry: CommandRegistry) {
  registry.register({
    id: '/history',
    type: 'component',
    description: 'Load previous session',
    category: 'session',
    component: HistoryCommandComponent,
  });
}
