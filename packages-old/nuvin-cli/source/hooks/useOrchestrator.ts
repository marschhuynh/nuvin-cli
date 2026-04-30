// biome-ignore-all lint/correctness/useExhaustiveDependencies: complex hook dependencies managed manually
import { useRef, useEffect, useState } from 'react';
import type { UserMessagePayload, SendMessageOptions } from '@nuvin/nuvin-core';
import type { MessageLine } from '@/adapters/index.js';
import { orchestratorManager, type OrchestratorConfig } from '@/services/OrchestratorManager.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { OrchestratorStatus } from '@/types/orchestrator.js';

import type { LineMetadata } from '@/adapters';

type UseOrchestratorProps = {
  memPersist?: boolean;
  appendLine: (line: MessageLine) => void;
  updateLine: (id: string, content: string) => void;
  updateLineMetadata: (id: string, metadata: Partial<LineMetadata>) => void;
  handleError: (message: string) => void;
};

export const useOrchestrator = ({
  memPersist = false,
  appendLine,
  updateLine,
  updateLineMetadata,
  handleError,
}: UseOrchestratorProps) => {
  const [status, setStatus] = useState<OrchestratorStatus>(OrchestratorStatus.INITIALIZING);
  const { toolApprovalMode } = useToolApproval();

  const handlersRef = useRef({ appendLine, updateLine, updateLineMetadata, handleError });
  // handlersRef.current = { appendLine, updateLine, updateLineMetadata, handleError };

  const cleanup = async () => {
    await orchestratorManager.cleanup();
  };

  const initializeOrchestrator = async (overrides?: Partial<OrchestratorConfig>, isReinit = false) => {
    if (isReinit) {
      setStatus(OrchestratorStatus.INITIALIZING);
      await orchestratorManager.cleanup();
      orchestratorManager.reset();
    }

    const config: OrchestratorConfig = {
      memPersist,
      streamingChunks: true,
      ...(overrides ?? {}),
    };

    const result = await orchestratorManager.init(config, handlersRef.current);

    setStatus(OrchestratorStatus.READY);

    return result;
  };

  const reinit = async (overrides?: Partial<OrchestratorConfig>) => {
    return initializeOrchestrator(overrides, true);
  };

  useEffect(() => {
    if (orchestratorManager.getOrchestrator()) {
      orchestratorManager.updateConfig({ requireToolApproval: toolApprovalMode });
    }
  }, [toolApprovalMode]);

  useEffect(() => {
    let didCancel = false;

    if (orchestratorManager.getStatus() === OrchestratorStatus.READY) {
      // memoryRef.current = orchestratorManager.getMemory();
      setStatus(OrchestratorStatus.READY);
      return () => {
        didCancel = true;
      };
    }

    // Initialize orchestrator (only runs once on mount)
    (async () => {
      try {
        await initializeOrchestrator();
        if (didCancel) return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        handleError(`Failed to initialize agent: ${message}`);
        if (!didCancel) setStatus(OrchestratorStatus.ERROR);
      }
    })();

    return () => {
      didCancel = true;
    };
  }, []);

  const send = async (content: UserMessagePayload, opts: SendMessageOptions = {}) => {
    return orchestratorManager.send(content, opts);
  };

  const createNewConversation = async (config: { sessionId?: string; sessionDir?: string; memPersist?: boolean }) => {
    return await orchestratorManager.createNewConversation(config);
  };

  return {
    status,
    cleanup,
    reinit,
    send,
    createNewConversation,
    sessionId: orchestratorManager.getSession().sessionId,
  };
};
