import { useCallback, useEffect, useRef, useState } from 'react';
import * as crypto from 'node:crypto';
import { useInput } from '@/contexts/InputContext/index.js';
import ansiEscapes from 'ansi-escapes';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { HistorySelection } from '@/components/HistorySelection.js';
import { scanAvailableSessions, searchSessions, loadSessionHistory, getSessionDir } from '@/hooks/useSessionManagement.js';
import { ConfigManager } from '@/config/manager.js';
import { AppModal } from '@/components/AppModal.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

import type { SessionInfo } from '@/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';

const PAGE_SIZE = 20;

const HistoryCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  // Browse mode state
  const [browseSessions, setBrowseSessions] = useState<SessionInfo[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);

  // Search mode state
  const [searchResults, setSearchResults] = useState<SessionInfo[] | null>(null); // null = browse mode
  const [isSearching, setIsSearching] = useState(false);

  // Refs for stable access inside async callbacks
  const loadingMoreRef = useRef(false);
  const browseSessionsRef = useRef(browseSessions);
  browseSessionsRef.current = browseSessions;
  const pageRef = useRef(page);
  pageRef.current = page;
  const latestQueryRef = useRef('');

  const configManager = ConfigManager.getInstance();
  const currentProfile = configManager.getCurrentProfile();

  const activeSessions = searchResults ?? browseSessions;

  useInput(
    (_input, key) => {
      if (key.escape) {
        deactivate();
      }
    },
    { isActive: true },
  );

  const loadPage = useCallback(
    async () => {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setIsLoadingMore(true);
      try {
        const pageIndex = pageRef.current;
        const offset = pageIndex * PAGE_SIZE;
        const newSessions = await scanAvailableSessions(PAGE_SIZE, offset, currentProfile);
        if (newSessions.length === 0) {
          setHasMore(false);
        } else {
          setBrowseSessions([...browseSessionsRef.current, ...newSessions]);
          setPage(pageIndex + 1);
          if (newSessions.length < PAGE_SIZE) setHasMore(false);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        context.eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'error',
          content: `Failed to load sessions: ${message}`,
          metadata: { timestamp: new Date().toISOString() },
          color: theme.tokens.red,
        });
      } finally {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    },
    [currentProfile, context.eventBus, theme.tokens.red],
  );

  // Initial load
  useEffect(() => {
    const init = async () => {
      try {
        const first = await scanAvailableSessions(PAGE_SIZE, 0, currentProfile);
        if (first.length === 0) {
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
        setBrowseSessions(first);
        setPage(1);
        setHasMore(first.length === PAGE_SIZE);
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
    init();
  }, [context.eventBus, deactivate, currentProfile, theme.tokens.red, theme.tokens.yellow]);

  const handleLoadMore = useCallback(() => {
    loadPage();
  }, [loadPage]);

  // WindowedComboBox fires this after its internal 200ms debounce
  const handleQueryChange = useCallback(
    async (query: string) => {
      latestQueryRef.current = query;
      if (!query.trim()) {
        setIsSearching(false);
        setSearchResults(null);
        return;
      }
      setIsSearching(true);
      try {
        const results = await searchSessions(query, currentProfile);
        if (latestQueryRef.current !== query) return; // discard stale
        setSearchResults(results);
      } catch (_err) {
        if (latestQueryRef.current !== query) return;
        setSearchResults([]);
      } finally {
        if (latestQueryRef.current === query) setIsSearching(false);
      }
    },
    [currentProfile],
  );

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
            const conversationId = context.orchestratorManager.getConversationContext().getActiveConversationId();
            await switchResult.memory.set(conversationId, result.cliMessages);
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
    context.orchestratorManager?.getConversationContext,
    theme.tokens.green,
    theme.tokens.red,
    theme.tokens.yellow,
  ]);

  if (loading) return null;
  if (searchResults === null && browseSessions.length === 0) return null;

  const modalHeight = Math.min(rows - 4, 24);

  return (
    <AppModal visible={true} title="Session History" onClose={deactivate} closeOnEscape={false} height={modalHeight}>
      <HistorySelection
        availableSessions={activeSessions}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        isSearching={isSearching}
        searchResultCount={searchResults !== null ? searchResults.length : null}
        onLoadMore={handleLoadMore}
        onQueryChange={handleQueryChange}
      />
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
