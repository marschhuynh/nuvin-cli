import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { MetricsSnapshot } from '@/services/SessionMetricsService.js';
import type { ProviderKey } from '@/const.js';
import type { LspStatusInfo, LspServerStatus } from '@/services/EventBus.js';
import { useNotification } from '@/hooks/useNotification.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { StatuslineSegment, StatuslineRow } from '@/config/types.js';
import { THINKING_LEVELS } from '@/config/types.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { useConfig } from '@/contexts/ConfigContext.js';
import { eventBus } from '@/services/EventBus.js';
import { formatTokens, formatCost, formatDirectory, getUsageColor, getGitBranchAsync } from '@/utils/formatters.js';

type FooterProps = {
  status: string;
  metrics?: MetricsSnapshot;
  toolApprovalMode?: boolean;
  vimModeEnabled?: boolean;
  vimMode?: 'insert' | 'normal';
  workingDirectory?: string;
  sessionId?: string;
};

export const DEFAULT_STATUSLINE_ROWS: [StatuslineRow, StatuslineRow] = [
  ['model', 'session', 'thinking', 'sudo', '|', 'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp'],
  ['gitBranch', '|', 'keybindings'],
];

const FooterComponent: React.FC<FooterProps> = ({
  status: _status,
  metrics,
  vimModeEnabled = false,
  vimMode = 'insert',
  workingDirectory,
  sessionId,
}) => {
  const { notification } = useNotification();
  const { theme } = useTheme();
  const { toolApprovalMode } = useToolApproval();
  const { get, getCurrentProfile } = useConfig();
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [lspServers, setLspServers] = useState<Map<string, LspServerStatus>>(new Map());

  useEffect(() => {
    if (!workingDirectory) return;
    let cancelled = false;
    getGitBranchAsync(workingDirectory).then((branch) => {
      if (!cancelled) setGitBranch(branch);
    });
    return () => {
      cancelled = true;
    };
  }, [workingDirectory]);

  useEffect(() => {
    const handleLspStatus = (info: LspStatusInfo) => {
      setLspServers((prev) => {
        const next = new Map(prev);
        if (info.status === 'disconnected') {
          next.delete(info.serverId);
        } else {
          next.set(info.serverId, info.status);
        }
        return next;
      });
    };

    eventBus.on('lsp:status', handleLspStatus);
    return () => {
      eventBus.off('lsp:status', handleLspStatus);
    };
  }, []);

  const lspConnected = Array.from(lspServers.values()).filter((s) => s === 'connected').length;
  const lspConnecting = Array.from(lspServers.values()).filter((s) => s === 'connecting').length;
  const lspTotal = lspServers.size;

  const thinking = get<string>('thinking');
  const provider = get<ProviderKey>('activeProvider');
  const model = get<string>('model');
  const currentProfile = getCurrentProfile?.();

  const rows = get<[StatuslineRow, StatuslineRow]>('ui.statusline.rows') ?? DEFAULT_STATUSLINE_ROWS;

  const partitionRow = (row: StatuslineRow) => {
    const sepIdx = row.indexOf('|');
    if (sepIdx === -1) {
      // No separator — all segments are left-aligned
      return { left: row.filter((s): s is StatuslineSegment => s !== '|'), right: [] as StatuslineSegment[] };
    }
    return {
      left: row.slice(0, sepIdx).filter((s): s is StatuslineSegment => s !== '|'),
      right: row.slice(sepIdx + 1).filter((s): s is StatuslineSegment => s !== '|'),
    };
  };

  /** Render a single segment — returns only its label+value, no separators. */
  const renderSegment = (seg: StatuslineSegment): React.ReactNode => {
    switch (seg) {
      case 'model':
        return (
          <Text key="model" color={theme.footer.status} dimColor>
            {provider}:{model}
          </Text>
        );
      case 'session':
        if (!sessionId) return null;
        return (
          <Text key="session" color={theme.footer.status} dimColor>
            Session: {sessionId}
          </Text>
        );
      case 'thinking':
        if (!thinking || thinking === THINKING_LEVELS.OFF) return null;
        return (
          <Text key="thinking" color={theme.footer.status} dimColor>
            Thinking: {thinking}
          </Text>
        );
      case 'sudo':
        if (toolApprovalMode) return null;
        return (
          <Text key="sudo" color={theme.footer.status} dimColor>
            SUDO
          </Text>
        );
      case 'tokens':
        if (!metrics?.currentTokens && !metrics?.totalTokens) return null;
        return (
          <React.Fragment key="tokens">
            <Text color={theme.footer.model} dimColor bold>
              Tokens:
            </Text>
            <Text color={theme.footer.model} bold>
              {' '}
              {formatTokens(metrics!.currentTokens)}
            </Text>
            {metrics!.totalTokens > 0 && (
              <Text color={theme.footer.model} dimColor>
                {' '}
                / {formatTokens(metrics!.totalTokens)}
              </Text>
            )}
          </React.Fragment>
        );
      case 'context':
        if (!metrics?.contextWindowLimit || metrics.contextWindowUsage === undefined) return null;
        return (
          <Text key="context" color={getUsageColor(metrics.contextWindowUsage, theme)} dimColor>
            ({Math.round(metrics.contextWindowUsage * 100)}%)
          </Text>
        );
      case 'cached':
        if (!metrics?.currentCachedTokens || metrics.currentCachedTokens <= 0) return null;
        return (
          <Text key="cached" color={theme.tokens.green} dimColor>
            Cached: {formatTokens(metrics.currentCachedTokens)}
          </Text>
        );
      case 'requests':
        if (!metrics?.llmCallCount || metrics.llmCallCount <= 0) return null;
        return (
          <Text key="requests" color={theme.tokens.magenta} dimColor>
            Req: {metrics.llmCallCount}
          </Text>
        );
      case 'tools':
        if (!metrics?.toolCallCount || metrics.toolCallCount <= 0) return null;
        return (
          <Text key="tools" color={theme.tokens.blue} dimColor>
            Tools: {metrics.toolCallCount}
          </Text>
        );
      case 'cost':
        if (!metrics?.totalCost || metrics.totalCost <= 0) return null;
        return (
          <Text key="cost" color={theme.tokens.cyan} dimColor>
            ${formatCost(metrics.totalCost)}
          </Text>
        );
      case 'lsp':
        if (lspTotal <= 0) return null;
        return (
          <Text
            key="lsp"
            color={lspConnected > 0 ? theme.tokens.green : lspConnecting > 0 ? theme.tokens.yellow : theme.tokens.gray}
            dimColor
          >
            LSP: {lspConnected}/{lspTotal}
          </Text>
        );
      case 'gitBranch':
        if (!workingDirectory) return null;
        return (
          <React.Fragment key="gitBranch">
            <Text color={theme.footer.currentDir}>{formatDirectory(workingDirectory)}</Text>
            <Text dimColor color={theme.footer.gitBranch}>
              {gitBranch && `:${gitBranch}`}
            </Text>
          </React.Fragment>
        );
      case 'keybindings':
        return (
          <Text key="keybindings" dimColor>
            <Text color={theme.colors.accent}>/</Text> command{' · '}
            <Text color={theme.colors.accent}>ESC×2</Text> stop
          </Text>
        );
      default:
        return null;
    }
  };

  /** Render a group of segments joined by ' | ' separators. */
  const renderGroup = (segs: StatuslineSegment[], isNotificationRow: boolean) => {
    // Notification replaces everything on row 0 left
    if (isNotificationRow && notification) {
      return <Text color={theme.tokens.yellow}>{notification}</Text>;
    }

    // Collect special prefix items
    const prefixNodes: React.ReactNode[] = [];
    if (vimModeEnabled && segs.some((s) => s === 'model' || s === 'session' || s === 'thinking' || s === 'sudo')) {
      prefixNodes.push(
        <Text key="vim" color={theme.footer.status} dimColor>
          {vimMode === 'insert' ? '-- INSERT --' : '-- NORMAL --'}
        </Text>,
      );
    }
    if (currentProfile && currentProfile !== 'default' && segs.some((s) => s === 'model')) {
      prefixNodes.push(
        <Text key="profile" color={theme.footer.status} dimColor>
          {currentProfile}
        </Text>,
      );
    }

    // Render each segment
    const segNodes = segs.map(renderSegment).filter(Boolean) as React.ReactElement[];

    const allNodes = [...prefixNodes, ...segNodes];
    if (allNodes.length === 0) return null;

    // Join with ' | '
    return (
      <>
        {allNodes.map((node, idx) => (
          <React.Fragment key={(node as React.ReactElement).key ?? idx}>
            {idx > 0 && (
              <Text dimColor>{' | '}</Text>
            )}
            {node}
          </React.Fragment>
        ))}
      </>
    );
  };

  return (
    <Box justifyContent="space-between" flexDirection="column" flexShrink={0}>
      {rows.map((row, rowIdx) => {
        const { left, right } = partitionRow(row);

        return (
          <Box key={rowIdx} justifyContent="space-between" flexWrap="wrap">
            {/* Left side */}
            <Box>
              {renderGroup(left, rowIdx === 0)}
            </Box>
            {/* Right side */}
            <Box alignSelf="flex-end" flexGrow={1} justifyContent="flex-end">
              {renderGroup(right, false)}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export const Footer = React.memo(FooterComponent);
