import React from 'react';
import { Box, Text } from 'ink';
import type { ToolRenderContext } from './types.js';
import { LAYOUT } from './types.js';
import { getStateColor } from './computeToolState.js';
import { getMainArg, TOOL_ICON } from './utils.js';
import { Markdown } from '@/components/Markdown/index.js';

/**
 * Default header renderer: ⚙︎ {displayName} {mainArg}
 */
export function defaultRenderHeader(ctx: ToolRenderContext): React.ReactNode {
  const { config, args, theme, toolCall } = ctx;
  const mainArg = getMainArg(toolCall.function.name, args);

  return (
    <Box flexDirection="row">
      <Box flexShrink={0} marginRight={1}>
        <Text color={theme.messageTypes.tool} bold>
          {TOOL_ICON}
        </Text>
      </Box>
      <Text wrap="truncate-middle">
        <Text bold>{config.displayName}</Text>
        {mainArg && <Text dimColor> {mainArg}</Text>}
      </Text>
    </Box>
  );
}

/**
 * Keys to exclude from default params display
 */
const EXCLUDED_PARAM_KEYS = new Set([
  'old_text',
  'new_text',
  'description',
  'content',
  'file_path',
  'path',
  'lineStart',
  'lineEnd',
  'filePath',
  'line',
  'character',
  'operation',
  'cmd',
  'cwd',
  'pattern',
  'url',
  'query',
]);

/**
 * Default params renderer: key-value pairs
 */
export function defaultRenderParams(ctx: ToolRenderContext): React.ReactNode {
  const { args, theme, cols, toolState } = ctx;
  const color = getStateColor(toolState, theme);

  const entries = Object.entries(args).filter(
    ([key, value]) => !EXCLUDED_PARAM_KEYS.has(key) && value !== undefined && value !== '',
  );

  if (entries.length === 0) return null;

  const formatValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 0);
    }
    return String(value);
  };

  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      borderStyle="single"
      borderDimColor
      borderColor={color}
      borderBottom={false}
      borderRight={false}
      borderTop={false}
      paddingLeft={2}
      width={cols - LAYOUT.PARAM_MARGIN}
    >
      {entries.map(([key, value]) => (
        <Text key={key} dimColor>{`${key}: ${formatValue(value)}`}</Text>
      ))}
    </Box>
  );
}

/**
 * Default result renderer: markdown content
 */
export function defaultRenderResult(ctx: ToolRenderContext): React.ReactNode {
  const { toolResult, cols, theme, toolState } = ctx;

  if (!toolResult?.result) return null;

  const resultStr = typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result, null, 2);

  const color = getStateColor(toolState, theme);

  return (
    <Box
      borderStyle="single"
      borderColor={color}
      borderDimColor
      borderBottom={false}
      borderRight={false}
      borderTop={false}
      flexDirection="column"
      paddingLeft={2}
      marginLeft={2}
      width={cols - LAYOUT.CONTENT_MARGIN}
    >
      <Markdown maxWidth={cols - LAYOUT.MARKDOWN_MARGIN}>{resultStr}</Markdown>
    </Box>
  );
}

/**
 * Helper for exhaustive switch checks - ensures all cases are handled at compile time
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled tool state: ${value}`);
}

/**
 * Get status text from config or use defaults
 */
function getStatusText(ctx: ToolRenderContext): string {
  const { toolState, toolResult, config } = ctx;

  switch (toolState) {
    case 'running':
      return 'Running...';
    case 'denied':
      return 'Denied';
    case 'edited':
      return 'Edited';
    case 'aborted':
      return 'Aborted';
    case 'timeout':
      return 'Timeout';
    case 'success': {
      const successText = config.statusText?.success;
      if (typeof successText === 'function' && toolResult) {
        return successText(toolResult);
      }
      if (typeof successText === 'string') {
        return successText;
      }
      return 'Done';
    }
    case 'error': {
      return config.statusText?.error ?? 'Failed';
    }
    default:
      return assertNever(toolState);
  }
}

/**
 * Default status renderer: └─ {statusText}
 */
export function defaultRenderStatus(ctx: ToolRenderContext): React.ReactNode {
  const { theme, toolState } = ctx;
  const color = getStateColor(toolState, theme);
  const text = getStatusText(ctx);

  return (
    <Box flexDirection="row" marginLeft={2}>
      <Text dimColor color={color}>{`└─ ${text}`}</Text>
    </Box>
  );
}
