import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ToolCall, ToolApprovalDecision } from '@nuvin/nuvin-core';
import { eventBus } from '@/services/EventBus.js';
import { enrichToolCallsWithLineNumbers } from '@/utils/enrichToolCalls.js';
import { firePermissionRequestHooks } from '@/utils/firePermissionRequestHooks.js';
import type { IOrchestratorManager } from '@/services/IOrchestratorManager';

interface ToolApprovalState {
  toolApprovalMode: boolean;
  setToolApprovalMode: (value: boolean | ((prevState: boolean) => boolean)) => void;
  pendingApprovalTools: ToolCall[];
  pendingApprovalBatchTotal: number;
  sessionApprovedTools: Set<string>;
  addSessionApprovedTool: (toolName: string) => void;
  clearSessionApprovedTools: () => void;
  handleSingleToolApproval: (approvalId: string, decision: ToolApprovalDecision, editInstruction?: string) => void;
}

const ToolApprovalContext = createContext<ToolApprovalState | undefined>(undefined);

export function ToolApprovalProvider({
  requireToolApproval,
  onError,
  children,
  orchestratorManager,
}: {
  orchestratorManager: IOrchestratorManager | null;
  requireToolApproval: boolean;
  onError: (message: string) => void;
  children: React.ReactNode;
}) {
  const [isToolApprovalMode, setToolApprovalMode] = useState(requireToolApproval);
  const [pendingApprovalTools, setPendingApprovalTools] = useState<ToolCall[]>([]);
  const [pendingApprovalBatchTotal, setPendingApprovalBatchTotal] = useState(0);
  const [sessionApprovedTools, setSessionApprovedTools] = useState<Set<string>>(new Set());

  const addSessionApprovedTool = useCallback((toolName: string) => {
    setSessionApprovedTools((prev) => new Set(prev).add(toolName));
  }, []);

  const clearSessionApprovedTools = useCallback(() => {
    setSessionApprovedTools(new Set());
    setPendingApprovalTools([]);
    setPendingApprovalBatchTotal(0);
  }, []);

  const handleSingleToolApproval = useCallback(
    (approvalId: string, decision: ToolApprovalDecision, editInstruction?: string) => {
      if (!orchestratorManager) {
        return;
      }

      try {
        orchestratorManager.handleToolApproval(approvalId, decision, editInstruction);
        setPendingApprovalTools((prev) => prev.filter((tc) => tc.approvalId !== approvalId));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError(`Failed to respond to tool approval: ${message}`);
      }
    },
    [onError, orchestratorManager],
  );

  const sessionApprovedToolsRef = useRef(sessionApprovedTools);
  sessionApprovedToolsRef.current = sessionApprovedTools;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const onToolCalls = async (event: { toolCalls: ToolCall[] }) => {
      try {
        const enrichedToolCalls = await enrichToolCallsWithLineNumbers(event.toolCalls);

        const toolsNeedingApproval: ToolCall[] = [];

        for (const tool of enrichedToolCalls) {
          if (tool.requiresApproval && tool.approvalId) {
            if (sessionApprovedToolsRef.current.has(tool.function.name)) {
              try {
                orchestratorManager?.handleToolApproval(tool.approvalId, 'approve');
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                onErrorRef.current(`Failed to auto-approve session tool: ${message}`);
              }
            } else {
              toolsNeedingApproval.push(tool);
            }
          }
        }

        if (toolsNeedingApproval.length > 0) {
          // Fire permission_request hooks only for tools that will actually show the approval UI.
          // Session-approved tools have already been filtered out above.
          await firePermissionRequestHooks(toolsNeedingApproval, orchestratorManager);

          setPendingApprovalTools((prev) => {
            const newTools = [...prev, ...toolsNeedingApproval];
            setPendingApprovalBatchTotal(newTools.length);
            return newTools;
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onErrorRef.current(`Failed to process tool calls: ${message}`);
      }
    };

    const onNewConversation = () => {
      clearSessionApprovedTools();
    };

    const onClearChat = () => {
      clearSessionApprovedTools();
    };

    eventBus.on('ui:toolCalls', onToolCalls);
    eventBus.on('conversation:created', onNewConversation);
    eventBus.on('ui:lines:clear', onClearChat);

    return () => {
      eventBus.off('ui:toolCalls', onToolCalls);
      eventBus.off('conversation:created', onNewConversation);
      eventBus.off('ui:lines:clear', onClearChat);
    };
  }, [clearSessionApprovedTools, orchestratorManager]);

  const value = useMemo(
    () => ({
      toolApprovalMode: isToolApprovalMode,
      setToolApprovalMode,
      pendingApprovalTools,
      pendingApprovalBatchTotal,
      sessionApprovedTools,
      addSessionApprovedTool,
      clearSessionApprovedTools,
      handleSingleToolApproval,
    }),
    [
      isToolApprovalMode,
      pendingApprovalTools,
      pendingApprovalBatchTotal,
      sessionApprovedTools,
      addSessionApprovedTool,
      clearSessionApprovedTools,
      handleSingleToolApproval,
    ],
  );

  return <ToolApprovalContext.Provider value={value}>{children}</ToolApprovalContext.Provider>;
}

export function useToolApproval() {
  const context = useContext(ToolApprovalContext);
  if (!context) {
    throw new Error('useToolApproval must be used within ToolApprovalProvider');
  }
  return context;
}

export type { ToolApprovalState };
