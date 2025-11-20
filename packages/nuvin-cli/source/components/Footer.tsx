import React from 'react';
import { Box, Text } from 'ink';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import type { MessageMetadata } from '@/adapters/index.js';
import type { ProviderKey } from '@/const.js';
import { useNotification } from '@/hooks/useNotification.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { THINKING_LEVELS } from '@/config/types.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { useConfig } from '@/contexts/ConfigContext.js';
import { useExplainMode } from '@/contexts/ExplainModeContext.js';

type FooterProps = {
  status: string;
  lastMetadata?: MessageMetadata | null;
  accumulatedCost?: number;
  toolApprovalMode?: boolean;
  vimModeEnabled?: boolean;
  vimMode?: 'insert' | 'normal';
  workingDirectory?: string;
};

const FooterComponent: React.FC<FooterProps> = ({
  status: _status,
  lastMetadata,
  accumulatedCost = 0,
  vimModeEnabled = false,
  vimMode = 'insert',
  workingDirectory,
}) => {
  const { notification } = useNotification();
  const { theme } = useTheme();
  const { toolApprovalMode } = useToolApproval();
  const { explainMode } = useExplainMode();
  const { get, getCurrentProfile } = useConfig();

  const thinking = get<string>('thinking');
  const provider = get<ProviderKey>('activeProvider');
  const model = get<string>('model');
  const currentProfile = getCurrentProfile?.();

  return (
    <Box
      justifyContent="space-between"
      flexDirection="column"
      borderStyle="round"
      borderTopDimColor
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
    >
      <Box justifyContent="space-between">
        {explainMode ? (
          <Text color={theme.tokens.yellow} bold>
            Ctrl+E to toggle
          </Text>
        ) : notification ? (
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
                currentProfile && currentProfile !== 'default' ? currentProfile : null, // Only show if not default
                `${provider}:${model}`,
                thinking && thinking !== THINKING_LEVELS.OFF ? `Thinking: ${thinking}` : '',
                !toolApprovalMode ? 'SUDO' : '',
              ]
                .filter(Boolean)
                .join(' | ')}
            </Text>
          </Box>
        )}
        {!explainMode && lastMetadata?.totalTokens ? (
          <Box>
            <Text color={theme.footer.model} dimColor bold>
              Tokens:
            </Text>
            <Text color={theme.footer.model} bold>
              {' '}
              {formatTokens(lastMetadata.totalTokens)}
            </Text>
            <Text color={theme.footer.model} dimColor>
              {' '}
              (↑{formatTokens(lastMetadata.promptTokens)} ↓{formatTokens(lastMetadata.completionTokens)})
            </Text>
            {lastMetadata.cachedTokens !== undefined && lastMetadata.cachedTokens > 0 && (
              <Text color={theme.tokens.green} dimColor>
                {' '}
                | Cached: {formatTokens(lastMetadata.cachedTokens)}
              </Text>
            )}
            {accumulatedCost > 0 && (
              <Text color={theme.tokens.cyan} dimColor>
                {' '}
                | ${formatCost(accumulatedCost)}
              </Text>
            )}
          </Box>
        ) : null}
      </Box>
      {workingDirectory && (
        <Box paddingX={1} paddingTop={0} backgroundColor={theme.footer.infoBg} justifyContent="space-between">
          <Box>
            <Text color={theme.footer.currentDir}>{formatDirectory(workingDirectory)}</Text>
            <Text dimColor color={theme.footer.gitBranch}>
              {getGitBranch(workingDirectory) && `:${getGitBranch(workingDirectory)}`}
            </Text>
          </Box>
          <Box>
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

const formatTokens = (tokens: number | null | undefined): string => {
  if (tokens == null) return '-';
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
};

const formatCost = (cost: number): string => {
  if (cost === 0) return '0.00';
  if (cost < 0.01) return cost.toFixed(4);
  if (cost < 1) return cost.toFixed(3);
  return cost.toFixed(2);
};

const formatDirectory = (dir: string): string => {
  const home = os.homedir();
  return dir.replace(home, '~');
};

const getGitBranch = (dir: string): string | null => {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

export const Footer = React.memo(FooterComponent);
