import { useCallback, useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { Box, Text } from 'ink';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { UserMessagePayload } from '@nuvin/nuvin-core';

import { ChatDisplay, Footer, InteractionArea, type InputAreaHandle } from '@/components/index.js';
import { ErrorBoundary } from '@/components/ErrorBoundary.js';
import { InitialConfigSetup } from '@/components/InitialConfigSetup.js';

import {
  useOrchestrator,
  useSessionManagement,
  useNotification,
  useStdoutDimensions,
  useGlobalKeyboard,
  useHandleSubmit,
} from '@/hooks/index.js';
import type { MessageLine } from '@/adapters/index.js';
import { eventBus } from '@/services/EventBus.js';
import { sessionMetricsService, type MetricsSnapshot } from '@/services/SessionMetricsService.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { useCommand } from '@/modules/commands/hooks/useCommand.js';
import type { ProviderKey } from '@/const.js';
import useMessages from '@/hooks/useMessage.js';
import { useConfig } from '@/contexts/ConfigContext.js';
import { orchestratorManager } from '@/services/OrchestratorManager.js';
import type { SessionInfo } from '@/types.js';
import { createEmptySnapshot } from '@nuvin/nuvin-core';
import { OrchestratorStatus } from '@/types/orchestrator.js';
import { useTheme } from './contexts/ThemeContext';
import ansiEscapes from 'ansi-escapes';

type Props = {
  provider?: ProviderKey;
  model?: string;
  apiKey?: string;
  memPersist?: boolean;
  thinking?: string;
  historyPath?: string;
  initialSessions?: SessionInfo[] | null;
};

export default function App({ apiKey: _apiKey, memPersist = false, historyPath, initialSessions }: Props) {
  const { theme } = useTheme();
  const { cols } = useStdoutDimensions();
  const { messages, clearMessages, setLines, appendLine, updateLine, updateLineMetadata, handleError } = useMessages();
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<MetricsSnapshot>(createEmptySnapshot());
  const currentSessionIdRef = useRef<string | null>(null);

  const [_setupComplete, setSetupComplete] = useState(false);

  const { setNotification } = useNotification();
  const { config, reload: reloadConfig } = useConfig();

  const [vimModeEnabled, setVimModeEnabled] = useState(false);
  const [vimMode, setVimMode] = useState<'insert' | 'normal'>('insert');
  const [isExiting, setIsExiting] = useState(false);

  const { toolApprovalMode, setToolApprovalMode, pendingApproval } = useToolApproval();
  const { activeCommand, execute: executeCommand } = useCommand();

  const [headerKey, setHeaderKey] = useState<number>(1);

  const abortRef = useRef<AbortController | null>(null);
  const previousVimModeRef = useRef<boolean | null>(null);
  const inputAreaRef = useRef<InputAreaHandle>(null);

  const historyLoadedRef = useRef(false);

  const { loadHistoryFromFile } = useSessionManagement();

  const { status, send, reinit, sessionId } = useOrchestrator({
    appendLine,
    updateLine,
    updateLineMetadata,
    handleError,
    memPersist,
  });

  useEffect(() => {
    currentSessionIdRef.current = sessionId ?? null;
    if (sessionId) {
      setMetrics(sessionMetricsService.getSnapshot(sessionId));
    }
  }, [sessionId]);

  useEffect(() => {
    const unsubscribe = sessionMetricsService.subscribe((conversationId, snapshot) => {
      if (conversationId === currentSessionIdRef.current) {
        setMetrics(snapshot);
      }
    });
    return unsubscribe;
  }, []);

  const showInitialSetup = useMemo(() => {
    if (!config.activeProvider) {
      return true;
    }

    if (config.activeProvider === 'echo') {
      return false;
    }

    const provider = config.activeProvider;
    const providerConfig = config.providers?.[provider];
    const hasNewAuth = providerConfig?.auth && Array.isArray(providerConfig.auth) && providerConfig.auth.length > 0;
    const hasLegacyAuth = providerConfig?.token || providerConfig?.apiKey || config.tokens?.[provider] || config.apiKey;

    return !hasNewAuth && !hasLegacyAuth;
  }, [config]);

  const handleSetupComplete = async () => {
    setSetupComplete(true);
    await reloadConfig();
    if (reinit) {
      await reinit();
    }
  };

  useEffect(() => {
    const onLine = (line: MessageLine) => appendLine(line);
    const onErr = (message: string) => handleError(message);

    const onClearComplete = () => {
      appendLine({
        id: crypto.randomUUID(),
        type: 'info',
        content: 'Chat history cleared. Ready for new conversation.',
        metadata: { timestamp: new Date().toISOString() },
        color: theme.tokens.green,
      });
    };

    eventBus.on('ui:line', onLine);
    eventBus.on('ui:error', onErr);
    eventBus.on('ui:lines:clear', clearMessages);
    eventBus.on('ui:lines:set', setLines);
    eventBus.on('ui:clear:complete', onClearComplete);

    return () => {
      eventBus.off('ui:line', onLine);
      eventBus.off('ui:error', onErr);
      eventBus.off('ui:lines:clear', clearMessages);
      eventBus.off('ui:lines:set', setLines);
      eventBus.off('ui:clear:complete', onClearComplete);
    };
  }, [appendLine, handleError, clearMessages, setLines, theme.tokens.green]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: We only want to load once at startup when orchestrator is ready
  useEffect(() => {
    if (!historyPath || historyLoadedRef.current) return;
    if (status !== OrchestratorStatus.READY) return;

    const loadHistory = async () => {
      try {
        const resolvedPath = path.resolve(historyPath);
        const result = await loadHistoryFromFile(resolvedPath);

        if (result.kind === 'messages') {
          if (result.cliMessages && result.cliMessages.length > 0) {
            const memory = orchestratorManager.getMemory();
            if (memory) {
              await memory.set('default', result.cliMessages);
            }
          }

          setLines(result.lines);

          appendLine({
            id: crypto.randomUUID(),
            type: 'info',
            content: `Loaded ${result.count} messages from ${historyPath}`,
            metadata: { timestamp: new Date().toISOString() },
            color: theme.tokens.green,
          });

          historyLoadedRef.current = true;
          // Force refresh to ensure layout is correct after heavy static content load
          // process.stdout.write(ansiEscapes.clearTerminal);
          // onViewRefresh();
        } else {
          const msg =
            result.reason === 'no_messages'
              ? `History file ${historyPath} has no messages`
              : `History file not found: ${historyPath}`;
          appendLine({
            id: crypto.randomUUID(),
            type: 'error',
            content: msg,
            metadata: { timestamp: new Date().toISOString() },
            color: 'red',
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendLine({
          id: crypto.randomUUID(),
          type: 'error',
          content: `Failed to load history: ${message}`,
          metadata: { timestamp: new Date().toISOString() },
          color: 'red',
        });
      }
    };

    loadHistory();
  }, [historyPath, status]);

  const processMessage = useCallback(
    async (submission: UserMessagePayload) => {
      const displayContent =
        typeof submission === 'string' ? submission : (submission.displayText ?? submission.text ?? '');

      appendLine({
        id: crypto.randomUUID(),
        type: 'user',
        content: displayContent,
        metadata: { timestamp: new Date().toISOString() },
        color: 'cyan',
      });

      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (!send) throw new Error('Agent not initialized');
        await send(submission, {
          conversationId: 'default',
          stream: true,
          signal: controller.signal,
        });

        // TODO: This feature is currently disabled
        // if (orchestratorManager && displayContent) {
        //   orchestratorManager.analyzeAndUpdateTopic(displayContent, 'cli');
        // }
      } catch (err: unknown) {
        const e = err as Error & { name?: string; message?: unknown };
        const msgText: string = typeof e?.message === 'string' ? e.message : String(e);
        const aborted = e?.name === 'AbortError';
        if (aborted) {
          appendLine({
            id: crypto.randomUUID(),
            type: 'info',
            content: 'Request aborted.',
            metadata: { timestamp: new Date().toISOString() },
            color: 'yellow',
          });
        } else {
          handleError(msgText);
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [send, appendLine, handleError],
  );

  useGlobalKeyboard({
    busy,
    pendingApproval,
    inputAreaRef,
    onNotification: setNotification,
  });

  const handleSubmit = useHandleSubmit({
    appendLine,
    handleError,
    executeCommand,
    processMessage,
  });

  const onViewRefresh = useCallback(() => {
    setHeaderKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const onSudoToggle = () => {
      setToolApprovalMode((prev) => !prev);
    };

    const onVimModeToggle = () => {
      setVimModeEnabled((prev) => !prev);
    };

    const onCustomCommandExecute = (payload: { commandId: string; renderedPrompt: string; userInput: string }) => {
      if (payload.renderedPrompt) {
        void handleSubmit(payload.renderedPrompt);
      }
    };

    const onExitStart = () => {
      setIsExiting(true);
    };

    eventBus.on('command:sudo:toggle', onSudoToggle);
    eventBus.on('ui:header:refresh', onViewRefresh);
    eventBus.on('ui:input:toggleVimMode', onVimModeToggle);
    eventBus.on('custom-command:execute', onCustomCommandExecute);
    eventBus.on('ui:exit:start', onExitStart);

    return () => {
      eventBus.off('command:sudo:toggle', onSudoToggle);
      eventBus.off('ui:header:refresh', onViewRefresh);
      eventBus.off('ui:input:toggleVimMode', onVimModeToggle);
      eventBus.off('custom-command:execute', onCustomCommandExecute);
      eventBus.off('ui:exit:start', onExitStart);
    };
  }, [onViewRefresh, setToolApprovalMode, handleSubmit]);

  useEffect(() => {
    if (previousVimModeRef.current === null) {
      previousVimModeRef.current = vimModeEnabled;
      return;
    }

    if (previousVimModeRef.current === vimModeEnabled) {
      return;
    }

    previousVimModeRef.current = vimModeEnabled;
  }, [vimModeEnabled]);

  const initialColsRef = useRef(true);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (!cols || cols < 10) return;

    // Skip the initial mount to avoid duplicate header rendering
    if (initialColsRef.current) {
      initialColsRef.current = false;
      return;
    }

    // Debounce the clear and refresh to avoid excessive updates during rapid resize
    if (resizeDebounceRef.current) {
      clearTimeout(resizeDebounceRef.current);
    }

    resizeDebounceRef.current = setTimeout(() => {
      console.log(ansiEscapes.clearTerminal);
      onViewRefresh();
      resizeDebounceRef.current = null;
    }, 200);

    return () => {
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }
    };
  }, [cols, onViewRefresh]);

  useEffect(() => {
    const checkForUpdates = async () => {
      const { AutoUpdater } = await import('@/services/AutoUpdater.js');

      await AutoUpdater.checkAndUpdate({
        onUpdateAvailable: (versionInfo) => {
          setNotification(`New version ${versionInfo.latest} available! Starting update...`, 5000);
        },
        onUpdateStarted: () => {
          setNotification('Update started in background...', 3000);
        },
        onUpdateCompleted: (_success, message) => {
          setNotification(message, 5000);
        },
        onError: (_error) => {},
      });
    };

    const timer = setTimeout(() => {
      checkForUpdates();
    }, 2000);

    return () => clearTimeout(timer);
  }, [setNotification]);

  if (showInitialSetup) {
    return (
      <ErrorBoundary
        memory={orchestratorManager.getMemory()}
        fallback={
          <Box flexDirection="column" padding={1}>
            <Box>
              <Text>Terminal rendering error occurred. The app will continue running.</Text>
            </Box>
            <Box>
              <Text>Try: 1) Resize terminal to normal size 2) Restart the app</Text>
            </Box>
          </Box>
        }
      >
        <InitialConfigSetup onComplete={handleSetupComplete} llmFactory={orchestratorManager.getLLMFactory()} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary
      memory={orchestratorManager.getMemory()}
      fallback={
        <Box flexDirection="column" padding={1}>
          <Box>
            <Text>Terminal rendering error occurred. The app will continue running.</Text>
          </Box>
          <Box>
            <Text>Try: 1) Resize terminal to normal size 2) Restart the app</Text>
          </Box>
        </Box>
      }
    >
      <Box flexDirection="column">
        <ChatDisplay
          key={`chat-display-${headerKey}`}
          messages={messages}
          headerKey={headerKey}
          sessions={initialSessions}
        />

        {!isExiting && (
          <InteractionArea
            ref={inputAreaRef}
            busy={busy}
            vimModeEnabled={vimModeEnabled}
            hasActiveCommand={!!activeCommand}
            memory={orchestratorManager.getMemory()}
            abortRef={abortRef}
            onNotification={setNotification}
            onBusyChange={setBusy}
            onInputSubmit={handleSubmit}
            onVimModeToggle={() => setVimModeEnabled((prev) => !prev)}
            onVimModeChanged={setVimMode}
          />
        )}

        <Footer
          status={status}
          metrics={metrics}
          toolApprovalMode={toolApprovalMode}
          vimModeEnabled={vimModeEnabled}
          vimMode={vimMode}
          workingDirectory={process.cwd()}
        />
      </Box>
    </ErrorBoundary>
  );
}
