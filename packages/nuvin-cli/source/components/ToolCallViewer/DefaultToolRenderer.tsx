import { Box, Text } from 'ink';
import type { ToolRenderContext } from './types.js';
import { LAYOUT } from './types.js';
import { getStateColor } from './computeToolState.js';
import { getMainArg, TOOL_ICON } from './utils.js';

/**
 * Default header renderer: ⚙︎ {displayName} {mainArg}
 */
export function defaultRenderHeader(ctx: ToolRenderContext): React.ReactNode {
  const { config, args, theme, toolCall, toolState } = ctx;
  const mainArg = getMainArg(toolCall.function.name, args);

  // Resolve displayName - can be string or function
  const displayName = typeof config.displayName === 'function' ? config.displayName(ctx) : config.displayName;

  // Use error color for error state, otherwise use default tool color
  const displayNameColor = toolState === 'error' ? theme.status.error : undefined;

  return (
    <Box flexDirection="row">
      <Box flexShrink={0} marginRight={1}>
        <Text color={theme.messageTypes.tool} bold>
          {TOOL_ICON}
        </Text>
      </Box>
      <Text wrap="truncate-middle">
        <Text bold color={displayNameColor}>
          {displayName}
        </Text>
        {mainArg && <Text dimColor> {mainArg}</Text>}
      </Text>
    </Box>
  );
}

/**
 * Default params renderer: key-value pairs
 */
export function defaultRenderParams(ctx: ToolRenderContext): React.ReactNode {
  const { args, theme, cols, toolState, config } = ctx;
  const color = getStateColor(toolState, theme);

  // Get excluded params from config, or use empty array
  const excludedParams = new Set(config.excludeParams || []);

  const entries = Object.entries(args).filter(
    ([key, value]) => !excludedParams.has(key) && value !== undefined && value !== '',
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

  let resultStr =
    typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result, null, 2);

  // Trim trailing whitespace to avoid empty space before status line
  resultStr = resultStr.trimEnd();

  // Truncate result to max 5 visible lines (including truncation indicator)
  const MAX_LINES = 5;
  const MAX_CHARS = 1000;
  let wasTruncated = false;

  // First, check character limit - take last MAX_CHARS characters
  if (resultStr.length > MAX_CHARS) {
    resultStr = resultStr.substring(resultStr.length - MAX_CHARS);
    wasTruncated = true;
  }

  // Then, check line limit - take last lines, reserving 1 line for truncation indicator
  const lines = resultStr.split('\n');
  if (lines.length > MAX_LINES) {
    resultStr = lines.slice(-(MAX_LINES - 1)).join('\n');
    wasTruncated = true;
  }

  // Add truncation indicator if needed (total stays within MAX_LINES)
  if (wasTruncated) {
    resultStr = `... (truncated)\n${resultStr}`;
  }

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
      <Text wrap="wrap">{resultStr}</Text>
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
