import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { MetricsSnapshot } from '@/services/SessionMetricsService.js';
import type { ProviderKey } from '@/const.js';
import type { LspStatusInfo, LspServerStatus } from '@/services/EventBus.js';
import { useNotification } from '@/hooks/useNotification.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { StatuslineSegment } from '@/config/types.js';
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

const LEFT_ALIGNED = new Set<StatuslineSegment>(['model', 'session', 'thinking', 'sudo', 'gitBranch']);
const RIGHT_ALIGNED = new Set<StatuslineSegment>(['tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp', 'keybindings']);

export const DEFAULT_STATUSLINE_ROWS: [StatuslineSegment[], StatuslineSegment[]] = [
  ['model', 'session', 'thinking', 'sudo', 'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp'],
  ['gitBranch', 'keybindings'],
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

  const rows = get<[StatuslineSegment[], StatuslineSegment[]]>('ui.statusline.rows') ?? DEFAULT_STATUSLINE_ROWS;

  const partitionRow = (row: StatuslineSegment[]) => ({
    left: row.filter((s) => LEFT_ALIGNED.has(s)),
    right: row.filter((s) => RIGHT_ALIGNED.has(s)),
  });

  // Build the status string for the left side
  const hasStatusSegments = (leftSegs: StatuslineSegment[]) =>
    leftSegs.some((s) => s === 'model' || s === 'session' || s === 'thinking' || s === 'sudo');

  const renderStatusString = (leftSegs: StatuslineSegment[]) => {
    const parts: (string | null)[] = [
      currentProfile && currentProfile !== 'default' ? currentProfile : null,
      leftSegs.includes('model') ? `${provider}:${model}` : null,
      leftSegs.includes('session') && sessionId ? `Session: ${sessionId}` : null,
      leftSegs.includes('thinking') && thinking && thinking !== THINKING_LEVELS.OFF ? `Thinking: ${thinking}` : null,
      leftSegs.includes('sudo') && !toolApprovalMode ? 'SUDO' : null,
    ].filter(Boolean);
    return parts.join(' | ');
  };

  const renderMetricSegment = (seg: StatuslineSegment): React.ReactNode => {
    switch (seg) {
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
            {' '}
            ({Math.round(metrics.contextWindowUsage * 100)}%)
          </Text>
        );
      case 'cached':
        if (!metrics?.currentCachedTokens || metrics.currentCachedTokens <= 0) return null;
        return (
          <Text key="cached" color={theme.tokens.green} dimColor>
            {' '}
            | Cached: {formatTokens(metrics.currentCachedTokens)}
          </Text>
        );
      case 'requests':
        if (!metrics?.llmCallCount || metrics.llmCallCount <= 0) return null;
        return (
          <Text key="requests" color={theme.tokens.magenta} dimColor>
            {' '}
            | Req: {metrics.llmCallCount}
          </Text>
        );
      case 'tools':
        if (!metrics?.toolCallCount || metrics.toolCallCount <= 0) return null;
        return (
          <Text key="tools" color={theme.tokens.blue} dimColor>
            {' '}
            | Tools: {metrics.toolCallCount}
          </Text>
        );
      case 'cost':
        if (!metrics?.totalCost || metrics.totalCost <= 0) return null;
        return (
          <Text key="cost" color={theme.tokens.cyan} dimColor>
            {' '}
            | ${formatCost(metrics.totalCost)}
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
            {' '}
            | LSP: {lspConnected}/{lspTotal}
          </Text>
        );
      default:
        return null;
    }
  };

  return (
    <Box justifyContent="space-between" flexDirection="column" flexShrink={0}>
      {rows.map((row, rowIdx) => {
        const { left, right } = partitionRow(row);
        const hasStatus = hasStatusSegments(left);
        const statusStr = hasStatus ? renderStatusString(left) : '';
        const hasGitBranch = left.includes('gitBranch') && !!workingDirectory;
        const hasKeybindings = right.includes('keybindings');

        return (
          <Box key={rowIdx} justifyContent="space-between" flexWrap="wrap">
            {/* Left side */}
            <Box>
              {rowIdx === 0 && notification ? (
                <Text color={theme.tokens.yellow}>{notification}</Text>
              ) : (
                <>
                  {hasStatus && (
                    <>
                      {vimModeEnabled && (
                        <Text color={theme.footer.status} dimColor>
                          {vimMode === 'insert' ? '-- INSERT --' : '-- NORMAL --'}
                          {' | '}
                        </Text>
                      )}
                      <Text color={theme.footer.status} dimColor>
                        {statusStr}
                      </Text>
                    </>
                  )}
                  {hasGitBranch && (
                    <>
                      <Text color={theme.footer.currentDir}>{formatDirectory(workingDirectory!)}</Text>
                      <Text dimColor color={theme.footer.gitBranch}>
                        {gitBranch && `:${gitBranch}`}
                      </Text>
                    </>
                  )}
                </>
              )}
            </Box>
            {/* Right side */}
            <Box alignSelf="flex-end" flexGrow={1} justifyContent="flex-end">
              {right.filter((s) => s !== 'keybindings').map((s) => renderMetricSegment(s))}
              {hasKeybindings && (
                <Text dimColor>
                  <Text color={theme.colors.accent}>/</Text> command{' · '}
                  <Text color={theme.colors.accent}>ESC×2</Text> stop
                </Text>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export const Footer = React.memo(FooterComponent);
