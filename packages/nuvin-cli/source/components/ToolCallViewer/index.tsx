import type React from 'react';
import { Box, Text } from 'ink';
import { type ToolCall, type ToolExecutionResult, parseToolArguments } from '@nuvin/nuvin-core';
import type { MessageLine as MessageLineType } from '@/adapters/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { ToolTimer } from '@/components/ToolTimer.js';
import { getToolConfig, getRenderFn } from '@/components/ToolCallViewer/registry.js';
import { AutoScrollBox } from '@/components/AutoScrollBox.js';
import { getStateColor } from './computeToolState.js';
import { buildStreamingViewportLines } from './streamingViewport.js';
import type { ComputedToolState, ToolRenderContext } from './types.js';
import { LAYOUT } from './types.js';

type ToolCallViewerProps = {
  toolCall: ToolCall;
  toolResult?: MessageLineType;
  toolState: ComputedToolState;
  messageId: string;
  streamingOutput?: string;
  streamingTotalLines?: number;
};

export const ToolCallViewer: React.FC<ToolCallViewerProps> = ({
  toolCall,
  toolResult,
  toolState,
  messageId: _messageId,
  streamingOutput,
  streamingTotalLines,
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

  // Show result if:
  // 1. Not running, AND
  // 2. Not denied or edited (status-only states), AND
  // 3. Not collapsed by default, AND
  // 4. Either: has result content OR has custom result renderer (but not if explicitly null)
  const hasCustomResultRenderer = config.renderResult !== undefined && config.renderResult !== null;
  const showResult =
    !isRunning &&
    toolState !== 'denied' &&
    toolState !== 'edited' &&
    !config.collapsedByDefault &&
    (toolExecutionResult?.result || hasCustomResultRenderer);
  const finalDuration = toolResult?.metadata?.duration;

  // When renderStatus is explicitly null, don't render any status lines
  const shouldRenderStatus = config.renderStatus !== null;
  const streamingViewportLines = streamingOutput ? buildStreamingViewportLines(streamingOutput, 5) : [];

  return (
    <Box flexDirection="column" width={cols - 2} overflow="hidden">
      {/* Header */}
      {renderHeader(ctx)}

      {/* Params */}
      {renderParams(ctx)}

      {/* Running indicator */}
      {shouldRenderStatus && isRunning && toolName !== 'ask_user_tool' && (
        streamingOutput ? (
          <Box flexDirection="column" marginLeft={2}>
            <Box
              borderStyle="single"
              borderColor={color}
              borderDimColor
              borderBottom={false}
              borderRight={false}
              borderTop={false}
              flexDirection="column"
              paddingLeft={2}
              width={cols - LAYOUT.CONTENT_MARGIN}
            >
              <AutoScrollBox maxHeight={5} showScrollbar={false}>
                <Box flexDirection="column">
                  {streamingViewportLines.map((line, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static viewport lines don't reorder
                    <Text key={i} dimColor wrap="truncate">
                      {line}
                    </Text>
                  ))}
                </Box>
              </AutoScrollBox>
            </Box>
            <Box flexDirection="row">
              <Text dimColor color={color}>
                {'└─ '}
              </Text>
              <Text>Running ({streamingTotalLines ?? 0} lines) ...</Text>
              <Box marginLeft={1}>
                <ToolTimer hasResult={false} finalDuration={finalDuration} />
              </Box>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="row" marginLeft={2}>
            <Text dimColor color={color}>
              └─{' '}
            </Text>
            <Text>Running ...</Text>
            <Box marginLeft={1}>
              <ToolTimer hasResult={false} finalDuration={finalDuration} />
            </Box>
          </Box>
        )
      )}

      {/* Denied state */}
      {shouldRenderStatus && toolState === 'denied' && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={theme.colors.warning}>
            └─ Denied
          </Text>
        </Box>
      )}

      {/* Edited state */}
      {shouldRenderStatus && toolState === 'edited' && (
        <Box flexDirection="row" marginLeft={2}>
          <Text dimColor color={theme.colors.warning}>
            └─ Edited
          </Text>
        </Box>
      )}

      {/* Result content */}
      {showResult && renderResult(ctx)}

      {/* Status line (for success/error states) */}
      {shouldRenderStatus &&
        !isRunning &&
        toolState !== 'denied' &&
        toolState !== 'edited' &&
        toolExecutionResult &&
        renderStatus(ctx)}
    </Box>
  );
};
