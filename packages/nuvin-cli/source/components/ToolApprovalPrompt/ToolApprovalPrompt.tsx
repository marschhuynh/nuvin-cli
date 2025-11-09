import { useState } from 'react';
import { Box, useInput, Text } from 'ink';
import type { ToolCall, ToolApprovalDecision } from '@nuvin/nuvin-core';
import { ToolParameters } from './ToolParameters.js';
import { ToolProgressInfo } from './ToolProgressInfo.js';
import { ToolActions } from './ToolActions.js';
import { AppModal } from '@/components/AppModal.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { theme } from '@/theme.js';

type Props = {
  toolCalls: ToolCall[];
  onApproval: (decision: ToolApprovalDecision, approvedCalls?: ToolCall[]) => void;
  onCancel?: () => void;
};

export function ToolApprovalPrompt({ toolCalls, onApproval }: Props) {
  const { addSessionApprovedTool } = useToolApproval();
  const [currentToolIndex, setCurrentToolIndex] = useState(0);
  const [approvedCalls, setApprovedCalls] = useState<ToolCall[]>([]);
  const [_deniedCalls, setDeniedCalls] = useState<ToolCall[]>([]);
  const [selectedAction, setSelectedAction] = useState(0); // 0=Yes, 1=No, 2=Yes for session

  const currentTool = toolCalls[currentToolIndex];
  const isLastTool = currentToolIndex === toolCalls.length - 1;

  // Handle keyboard navigation
  useInput((input, key) => {
    if (key.tab) {
      setSelectedAction((prev) => {
        if (key.shift) {
          return prev === 0 ? 2 : prev - 1;
        } else {
          return prev === 2 ? 0 : prev + 1;
        }
      });
      return;
    }

    if (key.return) {
      const decisions = ['approve', 'deny', 'approve_session'] as const;
      handleToolDecision(decisions[selectedAction]);
      return;
    }

    if (key.leftArrow) {
      setSelectedAction((prev) => (prev === 0 ? 2 : prev - 1));
      return;
    }

    if (key.rightArrow) {
      setSelectedAction((prev) => (prev === 2 ? 0 : prev + 1));
      return;
    }

    // Handle number key shortcuts
    if (input === '1') {
      handleToolDecision('approve');
      return;
    }
    if (input === '2') {
      handleToolDecision('deny');
      return;
    }
    if (input === '3') {
      handleToolDecision('approve_session');
      return;
    }
  });

  const handleToolDecision = (decision: 'approve' | 'deny' | 'approve_session') => {
    if (decision === 'approve') {
      setApprovedCalls((prev) => [...prev, currentTool]);
    } else if (decision === 'deny') {
      setDeniedCalls((prev) => [...prev, currentTool]);
    } else if (decision === 'approve_session') {
      // Add current tool to session-approved list
      addSessionApprovedTool(currentTool.function.name);

      // Find all tools with the same name in the current batch (current + remaining)
      const currentToolName = currentTool.function.name;
      const toolsWithSameName = toolCalls
        .slice(currentToolIndex)
        .filter((tool) => tool.function.name === currentToolName);

      // Approve all instances of this tool in current batch
      setApprovedCalls((prev) => [...prev, ...toolsWithSameName]);

      // Find the next tool with a different name
      const nextDifferentToolIndex = toolCalls
        .slice(currentToolIndex + 1)
        .findIndex((tool) => tool.function.name !== currentToolName);

      if (nextDifferentToolIndex === -1) {
        // No more different tools - we're done, approve everything
        onApproval('approve', [...approvedCalls, ...toolsWithSameName]);
        return;
      }

      // Move to the next different tool
      setCurrentToolIndex(currentToolIndex + 1 + nextDifferentToolIndex);
      setSelectedAction(0); // Reset to first action
      return;
    }

    if (isLastTool) {
      // Last tool - send final decision
      const finalApproved = decision === 'approve' ? [...approvedCalls, currentTool] : approvedCalls;
      if (finalApproved.length > 0) {
        onApproval('approve', finalApproved);
      } else {
        onApproval('deny');
      }
    } else {
      // Move to next tool
      setCurrentToolIndex((prev) => prev + 1);
      setSelectedAction(0); // Reset to first action
    }
  };

  return (
    <AppModal
      visible
      title={currentTool.function.name}
      rightTitle={
        <Text color={theme.toolApproval.description} dimColor>
          Tab/←→ Navigate • Enter Select • 1/2/3 Quick Select
        </Text>
      }
    >
      <Box flexDirection="column" width="100%">
        {/* Parameters / Specialized Content */}
        <ToolParameters toolCall={currentTool} />

        {/* Action Buttons at Bottom */}
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginTop={1}>
          <ToolActions selectedAction={selectedAction} />
          <ToolProgressInfo currentIndex={currentToolIndex} totalTools={toolCalls.length} />
        </Box>
      </Box>
    </AppModal>
  );
}
