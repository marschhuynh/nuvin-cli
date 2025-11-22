// biome-ignore-all lint/correctness/useExhaustiveDependencies: complex hook dependencies managed manually
import { useRef, useEffect, useState } from 'react';
import type { MemoryPort, AgentOrchestrator, Message, UserMessagePayload, SendMessageOptions } from '@nuvin/nuvin-core';
import type { MessageLine, MessageMetadata } from '@/adapters/index.js';
import { OrchestratorManager, type OrchestratorConfig } from '@/services/OrchestratorManager.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { OrchestratorStatus } from '@/types/orchestrator.js';

import type { LineMetadata } from '@/adapters';

type UseOrchestratorProps = {
  memPersist?: boolean;
  mcpConfigPath?: string;
  appendLine: (line: MessageLine) => void;
  updateLine: (id: string, content: string) => void;
  updateLineMetadata: (id: string, metadata: Partial<LineMetadata>) => void;
  setLastMetadata: (metadata: MessageMetadata | null) => void;
  handleError: (message: string) => void;
};

export const useOrchestrator = ({
  memPersist = false,
  mcpConfigPath,
  appendLine,
  updateLine,
  updateLineMetadata,
  setLastMetadata,
  handleError,
}: UseOrchestratorProps) => {
  const [status, setStatus] = useState<OrchestratorStatus>(OrchestratorStatus.INITIALIZING);
  const { toolApprovalMode } = useToolApproval();

  const orchestratorRef = useRef<AgentOrchestrator | null>(null);
  const memoryRef = useRef<MemoryPort<Message> | null>(null);
  const managerRef = useRef<OrchestratorManager>(new OrchestratorManager());

  const handlersRef = useRef({ appendLine, updateLine, updateLineMetadata, setLastMetadata, handleError });
  handlersRef.current = { appendLine, updateLine, updateLineMetadata, setLastMetadata, handleError };

  const cleanup = async () => {
    await managerRef.current.cleanup();
  };

  const initializeOrchestrator = async (overrides?: Partial<OrchestratorConfig>, isReinit = false) => {
    if (isReinit) {
      setStatus(OrchestratorStatus.INITIALIZING);
      await managerRef.current.cleanup();
      managerRef.current.reset();
    }

    const config: OrchestratorConfig = {
      memPersist,
      mcpConfigPath,
      streamingChunks: true,
      ...(overrides ?? {}),
    };

    const result = await managerRef.current.init(config, handlersRef.current);

    memoryRef.current = result.memory;
    orchestratorRef.current = result.orchestrator;
    setStatus(OrchestratorStatus.READY);

    return result;
  };

  const reinit = async (overrides?: Partial<OrchestratorConfig>) => {
    return initializeOrchestrator(overrides, true);
  };

  useEffect(() => {
    if (managerRef.current.getOrchestrator()) {
      managerRef.current.updateConfig({ requireToolApproval: toolApprovalMode });
    }
  }, [toolApprovalMode]);

  useEffect(() => {
    let didCancel = false;

    if (managerRef.current.getStatus() === OrchestratorStatus.READY) {
      memoryRef.current = managerRef.current.getMemory();
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
    return managerRef.current.send(content, opts);
  };

  const createNewConversation = async (config: { sessionId?: string; sessionDir?: string; memPersist?: boolean }) => {
    const result = await managerRef.current.createNewConversation(config);
    memoryRef.current = result.memory;
    return result;
  };

  return {
    orchestrator: orchestratorRef.current,
    manager: managerRef.current,
    memory: memoryRef.current,
    status,
    cleanup,
    reinit,
    send,
    createNewConversation,
    sessionId: managerRef.current.getSession().sessionId,
  };
};
