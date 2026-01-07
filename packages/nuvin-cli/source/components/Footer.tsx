import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { MetricsSnapshot } from '@/services/SessionMetricsService.js';
import type { ProviderKey } from '@/const.js';
import { useNotification } from '@/hooks/useNotification.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { THINKING_LEVELS } from '@/config/types.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { useConfig } from '@/contexts/ConfigContext.js';
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
          <Box alignSelf="flex-end">
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
          </Box>
        ) : null}
      </Box>
      {workingDirectory && (
        <Box paddingTop={0} justifyContent="space-between" flexWrap="wrap" overflow="hidden">
          <Box>
            <Text color={theme.footer.currentDir}>{formatDirectory(workingDirectory)}</Text>
            <Text dimColor color={theme.footer.gitBranch}>
              {gitBranch && `:${gitBranch}`}
            </Text>
          </Box>
          <Box alignSelf="flex-end" flexGrow={1} justifyContent="flex-end">
            <Text dimColor>
              <Text color={theme.colors.accent}>/</Text> command{' · '}
              <Text color={theme.colors.accent}>ESC×2</Text> stop{' · '}
              <Text color={theme.colors.accent}>Ctrl+E</Text> show detail
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export const Footer = React.memo(FooterComponent);
