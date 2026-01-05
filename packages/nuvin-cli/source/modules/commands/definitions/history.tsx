import { useEffect, useState } from 'react';
import * as crypto from 'node:crypto';
import { useInput } from '@/contexts/InputContext/index.js';
import ansiEscapes from 'ansi-escapes';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { HistorySelection } from '@/components/HistorySelection.js';
import { scanAvailableSessions, loadSessionHistory, getSessionDir } from '@/hooks/useSessionManagement.js';
import { ConfigManager } from '@/config/manager.js';
import { AppModal } from '@/components/AppModal.js';

import type { SessionInfo } from '@/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';

const HistoryCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const configManager = ConfigManager.getInstance();
  const currentProfile = configManager.getCurrentProfile();

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
        const sessions = await scanAvailableSessions(undefined, currentProfile);

        if (sessions.length === 0) {
          // No sessions found - emit info message and close
          context.eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'info',
            content: 'No previous session histories found.',
            metadata: { timestamp: new Date().toISOString() },
            color: theme.tokens.yellow,
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
          color: theme.tokens.red,
        });
        deactivate();
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, [context.eventBus, deactivate, currentProfile, theme.tokens.red, theme.tokens.yellow]);

  useEffect(() => {
    const handleHistorySelected = async (session: SessionInfo) => {
      try {
        deactivate();
        const result = await loadSessionHistory(session.sessionId, currentProfile);

        if (result.kind === 'messages') {
          const sessionDir = getSessionDir(session.sessionId, currentProfile);

          if (!context.orchestratorManager?.getOrchestrator()) {
            throw new Error('Orchestrator not initialized, wait a moment');
          }

          const switchResult = await context.orchestratorManager.switchToSession({
            sessionId: session.sessionId,
            sessionDir,
          });

          if (switchResult.memory && result.cliMessages.length > 0) {
            await switchResult.memory.set('cli', result.cliMessages);
          }

          console.log(ansiEscapes.clearTerminal);
          context.eventBus.emit('ui:header:refresh');
          context.eventBus.emit('ui:lines:set', result.lines);

          const sessionDate = new Date(parseInt(session.sessionId, 10)).toLocaleString();
          context.eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'info',
            content: `Switched to session ${session.sessionId} from ${sessionDate} (${result.cliMessages.length} messages loaded)`,
            metadata: { timestamp: new Date().toISOString() },
            color: theme.tokens.green,
          });
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
            color: theme.tokens.yellow,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        context.eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'error',
          content: `Failed to load session: ${message}`,
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.red,
        });
      }
    };

    context.eventBus.on('ui:history:selected', handleHistorySelected);

    return () => {
      context.eventBus.off('ui:history:selected', handleHistorySelected);
    };
  }, [
    context.eventBus,
    deactivate,
    currentProfile,
    context.orchestratorManager?.switchToSession,
    context.orchestratorManager?.getOrchestrator,
    theme.tokens.green,
    theme.tokens.red,
    theme.tokens.yellow,
  ]);

  if (loading || availableSessions.length === 0) {
    return null;
  }

  return (
    <AppModal visible={true} title="Session History" onClose={deactivate} closeOnEscape={false}>
      <HistorySelection availableSessions={availableSessions} />
    </AppModal>
  );
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
