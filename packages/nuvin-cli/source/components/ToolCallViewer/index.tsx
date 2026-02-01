import type React from 'react';
import { Box, Text } from 'ink';
import { type ToolCall, type ToolExecutionResult, parseToolArguments } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { ToolTimer } from '@/components/ToolTimer.js';
import { getToolConfig, getRenderFn } from '@/components/toolRegistry.js';
import { getStateColor } from './computeToolState.js';
import type { ComputedToolState, ToolRenderContext } from './types.js';

type ToolCallViewerProps = {
  toolCall: ToolCall;
  toolResult?: MessageLineType;
  toolState: ComputedToolState;
  messageId: string;
};

export const ToolCallViewer: React.FC<ToolCallViewerProps> = ({
  toolCall,
  toolResult,
  toolState,
  messageId: _messageId,
}) => {
  const { theme } = useTheme();
  const { pendingApprovalTools } = useToolApproval();
  const { cols } = useStdoutDimensions();

  // Skip if awaiting approval
  if (pendingApprovalTools.some((tc) => tc.id === toolCall.id)) {
    return null;
  }

  const toolName = toolCall.function.name;
  const config = getToolConfig(toolName);
  const args = parseToolArguments(toolCall.function.arguments);
  const toolExecutionResult = toolResult?.metadata?.toolResult as ToolExecutionResult | undefined;

  // Handle hideUntilComplete (e.g., ask_user_tool)
  if (config.hideUntilComplete && toolState === 'running') {
    return null;
  }

  // Special handling for ask_user_tool - hide until answered
  if (toolName === 'ask_user_tool') {
    const metadata = toolExecutionResult?.metadata as { answers?: Record<string, string | string[]> } | undefined;
    const hasAnswers = metadata?.answers && Object.keys(metadata.answers).length > 0;
    if (!hasAnswers) {
      return null;
    }
  }

  // Build render context
  const ctx: ToolRenderContext = {
    toolCall,
    toolResult: toolExecutionResult,
    toolState,
    args,
    theme,
    cols,
    config,
  };

  // Get render functions
  const renderHeader = getRenderFn(toolName, 'header');
  const renderParams = getRenderFn(toolName, 'params');
  const renderResult = getRenderFn(toolName, 'result');
  const renderStatus = getRenderFn(toolName, 'status');

  const color = getStateColor(toolState, theme);
  const isRunning = toolState === 'running';
  const showResult = !isRunning && !config.collapsedByDefault && toolExecutionResult?.result;
  const finalDuration = toolResult?.metadata?.duration;

  return (
    <Box flexDirection="column" width={cols - 2} overflow="hidden">
      {/* Header */}
      {renderHeader(ctx)}

      {/* Params */}
      {renderParams(ctx)}

      {/* Running indicator */}
      {isRunning && toolName !== 'ask_user_tool' && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={color}>└─ </Text>
          <Text>Running ...</Text>
          <Box marginLeft={1}>
            <ToolTimer hasResult={false} finalDuration={finalDuration} />
          </Box>
        </Box>
      )}

      {/* Denied state */}
      {toolState === 'denied' && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={theme.colors.warning}>└─ Denied</Text>
        </Box>
      )}

      {/* Edited state */}
      {toolState === 'edited' && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={theme.colors.warning}>└─ Edited</Text>
        </Box>
      )}

      {/* Result content */}
      {showResult && renderResult(ctx)}

      {/* Status line (for success/error states) */}
      {!isRunning && toolState !== 'denied' && toolState !== 'edited' && toolExecutionResult && (
        renderStatus(ctx)
      )}
    </Box>
  );
};
