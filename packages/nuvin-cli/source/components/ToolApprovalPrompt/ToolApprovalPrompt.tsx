  import { useState, useMemo, useRef, useCallback } from 'react';
  import { Box, Text } from 'ink';
  import type { ToolCall, ToolApprovalDecision } from '@nuvin/nuvin-core';
  import { useInput } from '@/contexts/InputContext/index.js';
  import { FocusProvider } from '@/contexts/InputContext/FocusContext.js';
  import { ToolParameters } from './ToolParameters.js';
  import { ToolProgressInfo } from './ToolProgressInfo.js';
  import { ToolActions } from './ToolActions.js';
  import { ToolEditInput, type ToolEditInputHandle } from './ToolEditInput.js';
  import { AppModal } from '@/components/AppModal.js';
  import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
  import { theme } from '@/theme.js';

  type Props = {
    toolCalls: ToolCall[];
    onApproval: (decision: ToolApprovalDecision, approvedCalls?: ToolCall[], editInstruction?: string) => void;
    onCancel?: () => void;
  };

  function ToolApprovalPromptContent({
    toolCalls,
    onApproval,
  }: {
    toolCalls: ToolCall[];
    onApproval: (decision: ToolApprovalDecision, approvedCalls?: ToolCall[], editInstruction?: string) => void;
  }) {
    const { addSessionApprovedTool } = useToolApproval();
    const editInputRef = useRef<ToolEditInputHandle>(null);
    const [currentToolIndex, setCurrentToolIndex] = useState(0);
    const [approvedCalls, setApprovedCalls] = useState<ToolCall[]>([]);
    const [_deniedCalls, setDeniedCalls] = useState<ToolCall[]>([]);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editValue, setEditValue] = useState('');

    const currentTool = toolCalls[currentToolIndex];
    const isLastTool = currentToolIndex === toolCalls.length - 1;

    const handleToolDecision = useCallback(
      (decision: 'approve' | 'deny' | 'approve_session') => {
        if (decision === 'approve') {
          setApprovedCalls((prev) => [...prev, currentTool]);
        } else if (decision === 'deny') {
          setDeniedCalls((prev) => [...prev, currentTool]);
        } else if (decision === 'approve_session') {
          addSessionApprovedTool(currentTool.function.name);

          const currentToolName = currentTool.function.name;
          const toolsWithSameName = toolCalls
            .slice(currentToolIndex)
            .filter((tool) => tool.function.name === currentToolName);

          setApprovedCalls((prev) => [...prev, ...toolsWithSameName]);

          const nextDifferentToolIndex = toolCalls
            .slice(currentToolIndex + 1)
            .findIndex((tool) => tool.function.name !== currentToolName);

          if (nextDifferentToolIndex === -1) {
            onApproval('approve', [...approvedCalls, ...toolsWithSameName]);
            return;
          }

          setCurrentToolIndex(currentToolIndex + 1 + nextDifferentToolIndex);
          return;
        }

        if (isLastTool) {
          const finalApproved = decision === 'approve' ? [...approvedCalls, currentTool] : approvedCalls;
          if (finalApproved.length > 0) {
            onApproval('approve', finalApproved);
          } else {
            onApproval('deny');
          }
        } else {
          setCurrentToolIndex((prev) => prev + 1);
        }
      },
      [currentTool, toolCalls, currentToolIndex, approvedCalls, isLastTool, onApproval, addSessionApprovedTool],
    );

    const toolTitle = useMemo(() => {
      const toolName = currentTool.function.name;

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
      if (value.trim().length === 0) return;
      onApproval('edit', undefined, value.trim());
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

    const footerText = isEditMode ? 'Enter Submit • Esc Cancel' : 'Tab/Ctrl+N/P Cycle Focus • 1/2/3 Quick Select';

    return (
      <AppModal
        visible
        title={<Text>{toolTitle}</Text>}
        footer={
          <Box marginLeft={1} flexGrow={1} marginRight={1}>
            <Text color={theme.toolApproval.description} >
              {footerText}
            </Text>
          </Box>
        }
        rightTitle={<ToolProgressInfo currentIndex={currentToolIndex} totalTools={toolCalls.length} />}
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

  export function ToolApprovalPrompt({ toolCalls, onApproval }: Props) {
    return (
      <FocusProvider>
        <ToolApprovalPromptContent toolCalls={toolCalls} onApproval={onApproval} />
      </FocusProvider>
    );
  }
