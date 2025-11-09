import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ToolCall, AgentOrchestrator, ToolApprovalDecision } from '@nuvin/nuvin-core';
import { eventBus } from '@/services/EventBus.js';
import { enrichToolCallsWithLineNumbers } from '@/utils/enrichToolCalls.js';

interface ToolApprovalState {
  toolApprovalMode: boolean;
  setToolApprovalMode: (value: boolean | ((prevState: boolean) => boolean)) => void;
  pendingApproval: {
    toolCalls: ToolCall[];
    approvalId: string;
    conversationId: string;
    messageId: string;
  } | null;
  sessionApprovedTools: Set<string>;
  addSessionApprovedTool: (toolName: string) => void;
  clearSessionApprovedTools: () => void;
  handleApprovalResponse: (decision: ToolApprovalDecision, approvedCalls?: ToolCall[]) => void;
  setOrchestrator: (orchestrator: AgentOrchestrator | null) => void;
}

const ToolApprovalContext = createContext<ToolApprovalState | undefined>(undefined);

export function ToolApprovalProvider({
  requireToolApproval,
  onError,
  children,
}: {
  requireToolApproval: boolean;
  onError: (message: string) => void;
  children: React.ReactNode;
}) {
  const [isToolApprovalMode, setToolApprovalMode] = useState(requireToolApproval);
  const [pendingApproval, setPendingApproval] = useState<{
    toolCalls: ToolCall[];
    approvalId: string;
    conversationId: string;
    messageId: string;
  } | null>(null);
  const [sessionApprovedTools, setSessionApprovedTools] = useState<Set<string>>(new Set());
  const orchestratorRef = useRef<AgentOrchestrator | null>(null);

  const setOrchestrator = useCallback((orchestrator: AgentOrchestrator | null) => {
    orchestratorRef.current = orchestrator;
  }, []);

  const addSessionApprovedTool = (toolName: string) => {
    setSessionApprovedTools((prev) => new Set(prev).add(toolName));
  };

  const clearSessionApprovedTools = useCallback(() => {
    setSessionApprovedTools(new Set());
  }, []);

  const handleApprovalResponse = useCallback(
    (decision: ToolApprovalDecision, approvedCalls?: ToolCall[]) => {
      if (!pendingApproval || !orchestratorRef.current) {
        return;
      }

      try {
        orchestratorRef.current.handleToolApproval(pendingApproval.approvalId, decision, approvedCalls);
        setPendingApproval(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError(`Failed to respond to tool approval: ${message}`);
      }
    },
    [pendingApproval, onError],
  );

  useEffect(() => {
    const onToolApprovalRequired = async (event: {
      toolCalls: ToolCall[];
      approvalId: string;
      conversationId: string;
      messageId: string;
    }) => {
      try {
        const enrichedToolCalls = await enrichToolCallsWithLineNumbers(event.toolCalls);

        const autoApprovedTools: ToolCall[] = [];
        const needsApprovalTools: ToolCall[] = [];

        for (const tool of enrichedToolCalls) {
          if (sessionApprovedTools.has(tool.function.name)) {
            autoApprovedTools.push(tool);
          } else {
            needsApprovalTools.push(tool);
          }
        }

        if (autoApprovedTools.length > 0 && orchestratorRef.current) {
          try {
            orchestratorRef.current.handleToolApproval(event.approvalId, 'approve', autoApprovedTools);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            onError(`Failed to auto-approve session tools: ${message}`);
          }
        }

        if (needsApprovalTools.length > 0) {
          setPendingApproval({ ...event, toolCalls: needsApprovalTools });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError(`Failed to process tool approval: ${message}`);
      }
    };

    const onNewConversation = () => {
      clearSessionApprovedTools();
    };

    const onClearChat = () => {
      clearSessionApprovedTools();
    };

    eventBus.on('ui:toolApprovalRequired', onToolApprovalRequired);
    eventBus.on('ui:new:conversation', onNewConversation);
    eventBus.on('ui:lines:clear', onClearChat);

    return () => {
      eventBus.off('ui:toolApprovalRequired', onToolApprovalRequired);
      eventBus.off('ui:new:conversation', onNewConversation);
      eventBus.off('ui:lines:clear', onClearChat);
    };
  }, [sessionApprovedTools, clearSessionApprovedTools, onError]);

  const value = {
    toolApprovalMode: isToolApprovalMode,
    setToolApprovalMode,
    pendingApproval,
    sessionApprovedTools,
    addSessionApprovedTool,
    clearSessionApprovedTools,
    handleApprovalResponse,
    setOrchestrator,
  };

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
