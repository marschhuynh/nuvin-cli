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

export const DEFAULT_STATUSLINE_ROWS: [StatuslineSegment[], StatuslineSegment[]] = [
  ['session', 'thinking', 'sudo', 'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp'],
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

  return (
    <Box justifyContent="space-between" flexDirection="column" flexShrink={0}>
      <Box justifyContent="space-between" flexWrap="wrap">
        {notification ? (
          <Text color={theme.tokens.yellow}>{notification || ''}</Text>
        ) : (
          <Box>
            {vimModeEnabled && (
              <Text color={theme.footer.status} dimColor>
                {vimMode === 'insert' ? '-- INSERT --' : '-- NORMAL --'}
                {' | '}
              </Text>
            )}
            <Text color={theme.footer.status} dimColor>
              {[
                currentProfile && currentProfile !== 'default' ? currentProfile : null,
                `${provider}:${model}`,
                sessionId && `Session: ${sessionId}`,
                thinking && thinking !== THINKING_LEVELS.OFF ? `Thinking: ${thinking}` : '',
                !toolApprovalMode ? 'SUDO' : '',
              ]
                .filter(Boolean)
                .join(' | ')}
            </Text>
          </Box>
        )}
        {metrics?.currentTokens || metrics?.totalTokens ? (
          <Box alignSelf="flex-end" flexGrow={1} justifyContent="flex-end">
            <Text color={theme.footer.model} dimColor bold>
              Tokens:
            </Text>
            <Text color={theme.footer.model} bold>
              {' '}
              {formatTokens(metrics.currentTokens)}
            </Text>
            {metrics.contextWindowLimit && metrics.contextWindowUsage !== undefined ? (
              <Text color={getUsageColor(metrics.contextWindowUsage, theme)} dimColor>
                {' '}
                ({Math.round(metrics.contextWindowUsage * 100)}%)
              </Text>
            ) : null}
            {metrics.totalTokens > 0 && (
              <Text color={theme.footer.model} dimColor>
                {' '}
                / {formatTokens(metrics.totalTokens)}
              </Text>
            )}
            {/* <Text color={theme.footer.model} dimColor>
              {' '}
              (↑{formatTokens(metrics.currentPromptTokens)} ↓{formatTokens(metrics.currentCompletionTokens)})
            </Text> */}
            {metrics.currentCachedTokens > 0 && (
              <Text color={theme.tokens.green} dimColor>
                {' '}
                | Cached: {formatTokens(metrics.currentCachedTokens)}
              </Text>
            )}
            {metrics.llmCallCount > 0 && (
              <Text color={theme.tokens.magenta} dimColor>
                {' '}
                | Req: {metrics.llmCallCount}
              </Text>
            )}
            {metrics.toolCallCount > 0 && (
              <Text color={theme.tokens.blue} dimColor>
                {' '}
                | Tools: {metrics.toolCallCount}
              </Text>
            )}
            {metrics.totalCost > 0 && (
              <Text color={theme.tokens.cyan} dimColor>
                {' '}
                | ${formatCost(metrics.totalCost)}
              </Text>
            )}
            {lspTotal > 0 && (
              <Text
                color={
                  lspConnected > 0 ? theme.tokens.green : lspConnecting > 0 ? theme.tokens.yellow : theme.tokens.gray
                }
                dimColor
              >
                {' '}
                | LSP: {lspConnected}/{lspTotal}
              </Text>
            )}
          </Box>
        ) : null}
      </Box>
      {workingDirectory && (
        <Box paddingTop={0} justifyContent="space-between" flexWrap="wrap">
          <Box>
            <Text color={theme.footer.currentDir}>{formatDirectory(workingDirectory)}</Text>
            <Text dimColor color={theme.footer.gitBranch}>
              {gitBranch && `:${gitBranch}`}
            </Text>
          </Box>
          <Box alignSelf="flex-end" flexGrow={1} justifyContent="flex-end">
            <Text dimColor>
              <Text color={theme.colors.accent}>/</Text> command{' · '}
              <Text color={theme.colors.accent}>ESC×2</Text> stop
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export const Footer = React.memo(FooterComponent);
