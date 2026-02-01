import { useState, useMemo, useRef, useCallback } from 'react';
import { Box, Text } from 'ink';
import type { ToolCall } from '@nuvin/nuvin-core';
import { useInput } from '@/contexts/InputContext/index.js';
import { FocusProvider } from '@/contexts/InputContext/FocusContext.js';
import { AppModal } from '@/components/AppModal.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { theme } from '@/theme.js';
import { getToolDisplayName } from '@/components/ToolCallViewer/registry.js';
import { ToolParameters } from './ToolParameters.js';
import { ToolProgressInfo } from './ToolProgressInfo.js';
import { ToolActions } from './ToolActions.js';
import { ToolEditInput, type ToolEditInputHandle } from './ToolEditInput.js';
import { HelpText } from '@/components/HelpText.js';

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

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(currentTool.function.arguments);
    } catch {}

    const displayName =
      args.description && typeof args.description === 'string' && args.description.trim()
        ? args.description
        : getToolDisplayName(toolName);

    if (toolName === 'file_new' || toolName === 'file_edit') {
      const filePath = args.file_path as string | undefined;
      if (filePath) {
        return (
          <>
            <Text color={theme.modal.title} bold>{`${displayName}: `}</Text>
            <Text bold={false} color={theme.modal.subtitle}>
              {filePath}
            </Text>
          </>
        );
      }
    }

    return displayName;
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

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1}>
      {isEditMode ? (
        <HelpText
          segments={[
            { text: 'Enter', highlight: true },
            { text: ' submit • ' },
            { text: 'Esc', highlight: true },
            { text: ' cancel' },
          ]}
        />
      ) : (
        <HelpText
          segments={[
            { text: 'Tab', highlight: true },
            { text: ' cycle focus • ' },
            { text: '1', highlight: true },
            { text: ' approve • ' },
            { text: '2', highlight: true },
            { text: ' deny • ' },
            { text: '3', highlight: true },
            { text: ' approve session' },
          ]}
        />
      )}
    </Box>
  );

  return (
    <AppModal
      visible
      title={<Text>{toolTitle}</Text>}
      rightTitle={<ToolProgressInfo currentIndex={currentIndex} totalTools={pendingApprovalBatchTotal} />}
      footer={footerContent}
    >
      <Box flexDirection="column" width="100%" flexShrink={0}>
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
