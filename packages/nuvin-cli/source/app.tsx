import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Box, Spacer, Text } from 'ink';
import ansiEscapes from 'ansi-escapes';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { UserMessagePayload } from '@nuvin/nuvin-core';

import { ChatDisplay, Footer, InteractionArea, type InputAreaHandle } from './components/index.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { InitialConfigSetup } from './components/InitialConfigSetup.js';
import {
  useOrchestrator,
  useKeyboardInput,
  useSessionManagement,
  useNotification,
  useStdoutDimensions,
  useGlobalKeyboard,
  useHandleSubmit,
} from './hooks/index.js';
import type { MessageLine, MessageMetadata } from './adapters/index.js';
import { eventBus } from './services/EventBus.js';
import { useToolApproval } from './contexts/ToolApprovalContext.js';
import { useCommand } from './modules/commands/hooks/useCommand.js';
import { commandRegistry } from './modules/commands/registry.js';
import type { ProviderKey } from './const.js';
import useMessages from './hooks/useMessage.js';
import { useConfig } from './contexts/ConfigContext.js';
import { useExplainMode } from './contexts/ExplainModeContext.js';
import { OrchestratorStatus } from './services/OrchestratorManager.js';

type Props = {
  provider?: ProviderKey;
  model?: string;
  apiKey?: string;
  memPersist?: boolean;
  mcpConfigPath?: string;
  thinking?: string;
  historyPath?: string;
};

export default function App({
  apiKey: _apiKey,
  memPersist = false,
  mcpConfigPath: _mcpConfigPath,
  historyPath,
}: Props) {
  const { explainMode } = useExplainMode();
  const [cols, _rows] = useStdoutDimensions();
  const { messages, clearMessages, setLines, appendLine, updateLine, updateLineMetadata, handleError } = useMessages();
  const [busy, setBusy] = useState(false);
  const [lastMetadata, setLastMetadata] = useState<MessageMetadata | null>(null);
  const [accumulatedCost, setAccumulatedCost] = useState(0);

  const [_setupComplete, setSetupComplete] = useState(false);

  const { setNotification } = useNotification();
  const { config, reload: reloadConfig } = useConfig();

  const [vimModeEnabled, setVimModeEnabled] = useState(false);
  const [vimMode, setVimMode] = useState<'insert' | 'normal'>('insert');

  const { toolApprovalMode, setToolApprovalMode, pendingApproval, setOrchestrator } = useToolApproval();
  const { activeCommand, execute: executeCommand } = useCommand();

  const [headerKey, setHeaderKey] = useState<number>(1);

  const abortRef = useRef<AbortController | null>(null);
  const previousVimModeRef = useRef<boolean | null>(null);
  const inputAreaRef = useRef<InputAreaHandle>(null);
  const isInitialMountRef = useRef(true);

  const newConversationInProgressRef = useRef(false);
  const historyLoadedRef = useRef(false);

  const { createNewSession, loadHistoryFromFile } = useSessionManagement();

  const handleSetLastMetadata = useCallback((metadata: MessageMetadata | null) => {
    setLastMetadata(metadata);
    if (metadata?.cost && metadata.cost > 0) {
      setAccumulatedCost((prev) => prev + (metadata.cost ?? 0));
    }
  }, []);

  const { orchestrator, manager, memory, status, send, createNewConversation, reinit } = useOrchestrator({
    appendLine,
    updateLine,
    updateLineMetadata,
    setLastMetadata: handleSetLastMetadata,
    handleError,
    memPersist,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: just depend on the status
  useEffect(() => {
    if (status === OrchestratorStatus.READY) {
      setOrchestrator(orchestrator);
      commandRegistry.setMemory(memory);
      commandRegistry.setOrchestrator(manager);
    }
  }, [status]);

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

    const onLastMetadata = (metadata: MessageMetadata | null) => {
      setLastMetadata(metadata);
    };

    const onClearComplete = () => {
      // Reset accumulated cost and metadata on clear
      setAccumulatedCost(0);
      setLastMetadata(null);

      appendLine({
        id: crypto.randomUUID(),
        type: 'info',
        content: 'Chat history cleared. Ready for new conversation.',
        metadata: { timestamp: new Date().toISOString() },
        color: 'green',
      });
    };

    const onNewConversation = async (event: { memPersist: boolean }) => {
      if (newConversationInProgressRef.current) {
        return;
      }

      newConversationInProgressRef.current = true;

      try {
        // Reset accumulated cost on new conversation
        setAccumulatedCost(0);

        // Only create session directory if memPersist is enabled
        const session = event.memPersist ? await createNewSession() : { sessionId: undefined, sessionDir: undefined };
        await createNewConversation({ ...session, memPersist: event.memPersist });

        appendLine({
          id: crypto.randomUUID(),
          type: 'info',
          content: event.memPersist ? 'Started new conversation session' : 'Started new conversation',
          metadata: { timestamp: new Date().toISOString() },
          color: 'green',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        handleError(`Failed to start new conversation: ${message}`);
      } finally {
        newConversationInProgressRef.current = false;
      }
    };

    eventBus.on('ui:line', onLine);
    eventBus.on('ui:error', onErr);
    eventBus.on('ui:lastMetadata', onLastMetadata);
    eventBus.on('ui:lines:clear', clearMessages);
    eventBus.on('ui:lines:set', setLines);
    eventBus.on('ui:clear:complete', onClearComplete);
    eventBus.on('ui:new:conversation', onNewConversation);

    return () => {
      eventBus.off('ui:line', onLine);
      eventBus.off('ui:error', onErr);
      eventBus.off('ui:lastMetadata', onLastMetadata);
      eventBus.off('ui:lines:clear', clearMessages);
      eventBus.off('ui:lines:set', setLines);
      eventBus.off('ui:clear:complete', onClearComplete);
      eventBus.off('ui:new:conversation', onNewConversation);
    };
  }, [appendLine, handleError, createNewConversation, createNewSession, clearMessages, setLines]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: We only want to load once at startup
  useEffect(() => {
    if (!historyPath || !memory || historyLoadedRef.current) return;

    const loadHistory = async () => {
      try {
        const resolvedPath = path.resolve(historyPath);
        const result = await loadHistoryFromFile(resolvedPath);

        if (result.kind === 'messages') {
          // Load messages into memory
          if (result.cliMessages && result.cliMessages.length > 0) {
            await memory.set('cli', result.cliMessages);
          }

          // Set metadata
          if (result.metadata) {
            setLastMetadata(result.metadata);
          }

          // Set UI lines
          setLines(result.lines);

          // Notify user
          appendLine({
            id: crypto.randomUUID(),
            type: 'info',
            content: `Loaded ${result.count} messages from ${historyPath}`,
            metadata: { timestamp: new Date().toISOString() },
            color: 'green',
          });

          // Mark history as loaded to prevent reloading
          historyLoadedRef.current = true;
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
  }, [historyPath, memory]);

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
          conversationId: 'cli',
          stream: true,
          signal: controller.signal,
        });

        if (manager && displayContent) {
          manager.analyzeAndUpdateTopic(displayContent, 'cli');
        }
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
    [send, manager, appendLine, handleError],
  );

  useKeyboardInput();

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

    eventBus.on('command:sudo:toggle', onSudoToggle);
    eventBus.on('ui:header:refresh', onViewRefresh);
    eventBus.on('ui:input:toggleVimMode', onVimModeToggle);

    return () => {
      eventBus.off('command:sudo:toggle', onSudoToggle);
      eventBus.off('ui:header:refresh', onViewRefresh);
      eventBus.off('ui:input:toggleVimMode', onVimModeToggle);
    };
  }, [onViewRefresh, setToolApprovalMode]);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: cols dependency intentionally excluded to avoid re-renders
  useEffect(() => {
    // Skip on initial mount to avoid unnecessary render
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (!cols || cols < 10) return;
    try {
      console.log(ansiEscapes.clearTerminal);
      onViewRefresh();
    } catch (error) {
      console.warn('Error during resize refresh, continuing with safe state:', error);
    }
  }, [cols, onViewRefresh, explainMode]);

  if (showInitialSetup) {
    return (
      <ErrorBoundary
        memory={memory}
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
        <InitialConfigSetup onComplete={handleSetupComplete} llmFactory={manager?.getLLMFactory()} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary
      memory={memory}
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
      <Box flexDirection="column" height="100%" width="100%">
        <ChatDisplay key={`chat-display-${headerKey}`} messages={messages} headerKey={headerKey} />
        <Spacer />

        {!explainMode && (
          <InteractionArea
            ref={inputAreaRef}
            busy={busy}
            vimModeEnabled={vimModeEnabled}
            hasActiveCommand={!!activeCommand}
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
          lastMetadata={lastMetadata}
          accumulatedCost={accumulatedCost}
          toolApprovalMode={toolApprovalMode}
          vimModeEnabled={vimModeEnabled}
          vimMode={vimMode}
          workingDirectory={process.cwd()}
        />
      </Box>
    </ErrorBoundary>
  );
}
