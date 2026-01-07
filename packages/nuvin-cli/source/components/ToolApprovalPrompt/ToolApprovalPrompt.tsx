import { useState, useMemo, useRef, useCallback } from 'react';
import { Box, Text } from 'ink';
import type { ToolCall } from '@nuvin/nuvin-core';
import { useInput } from '@/contexts/InputContext/index.js';
import { FocusProvider } from '@/contexts/InputContext/FocusContext.js';
import { AppModal } from '@/components/AppModal.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { theme } from '@/theme.js';
import { ToolParameters } from './ToolParameters.js';
import { ToolProgressInfo } from './ToolProgressInfo.js';
import { ToolActions } from './ToolActions.js';
import { ToolEditInput, type ToolEditInputHandle } from './ToolEditInput.js';

type Props = {
  toolCalls: ToolCall[];
  onCancel?: () => void;
};

function ToolApprovalPromptContent({ toolCalls }: { toolCalls: ToolCall[] }) {
  const { addSessionApprovedTool, handleSingleToolApproval, pendingApprovalBatchTotal } = useToolApproval();
  const editInputRef = useRef<ToolEditInputHandle>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editValue, setEditValue] = useState('');

  const currentTool = toolCalls[0];
  const currentIndex = pendingApprovalBatchTotal - toolCalls.length;

  const handleToolDecision = useCallback(
    (decision: 'approve' | 'deny' | 'approve_session') => {
      if (!currentTool?.approvalId) return;

      if (decision === 'approve') {
        handleSingleToolApproval(currentTool.approvalId, 'approve');
      } else if (decision === 'deny') {
        handleSingleToolApproval(currentTool.approvalId, 'deny');
      } else if (decision === 'approve_session') {
        addSessionApprovedTool(currentTool.function.name);

        const currentToolName = currentTool.function.name;
        const toolsWithSameName = toolCalls.filter((tool) => tool.function.name === currentToolName);

        for (const tool of toolsWithSameName) {
          if (tool.approvalId) {
            handleSingleToolApproval(tool.approvalId, 'approve');
          }
        }
      }
    },
    [currentTool, toolCalls, addSessionApprovedTool, handleSingleToolApproval],
  );

  const toolTitle = useMemo(() => {
    const toolName = currentTool?.function.name;
    if (!toolName) return '';

    if (toolName === 'file_new' || toolName === 'file_edit') {
      try {
        const args = JSON.parse(currentTool.function.arguments) as { file_path?: string };
        if (args.file_path) {
          return (
            <>
              <Text color={theme.modal.title} bold>{`${toolName}: `}</Text>
              <Text bold={false} color={theme.modal.subtitle}>
                {args.file_path}
              </Text>
            </>
          );
        }
      } catch {}
    }

    return toolName;
  }, [currentTool]);

  const handleEditSubmit = (value: string) => {
    if (value.trim().length === 0 || !currentTool?.approvalId) return;
    handleSingleToolApproval(currentTool.approvalId, 'edit', value.trim());
    setIsEditMode(false);
    setEditValue('');
  };

  const handleEditCancel = () => {
    setIsEditMode(false);
    setEditValue('');
  };

  const handleActionExecute = (action: number) => {
    handleToolDecision(['approve', 'deny', 'approve_session'][action] as 'approve' | 'deny' | 'approve_session');
  };

  useInput(
    (input) => {
      const decisions: Record<string, 'approve' | 'deny' | 'approve_session'> = {
        '1': 'approve',
        '2': 'deny',
        '3': 'approve_session',
      };

      if (decisions[input]) {
        handleToolDecision(decisions[input]);
        return true;
      }
    },
    { isActive: true },
  );

  if (!currentTool) {
    return null;
  }

  const footerText = isEditMode ? 'Enter Submit • Esc Cancel' : 'Tab/Ctrl+N/P Cycle Focus • 1/2/3 Quick Select';

  return (
    <AppModal
      visible
      title={<Text>{toolTitle}</Text>}
      footer={
        <Box marginLeft={1} flexGrow={1} marginRight={1}>
          <Text color={theme.toolApproval.description}>{footerText}</Text>
        </Box>
      }
      rightTitle={<ToolProgressInfo currentIndex={currentIndex} totalTools={pendingApprovalBatchTotal} />}
    >
      <Box flexDirection="column" width="100%">
        <ToolParameters toolCall={currentTool} />
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginTop={1}>
          <ToolActions onActionExecute={handleActionExecute} />
        </Box>
        <Box marginY={1}>
          <ToolEditInput
            ref={editInputRef}
            value={editValue}
            onChange={setEditValue}
            onSubmit={handleEditSubmit}
            onCancel={handleEditCancel}
          />
        </Box>
      </Box>
    </AppModal>
  );
}

export function ToolApprovalPrompt({ toolCalls }: Props) {
  return (
    <FocusProvider>
      <ToolApprovalPromptContent toolCalls={toolCalls} />
    </FocusProvider>
  );
}
