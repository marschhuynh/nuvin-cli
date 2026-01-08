import { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { AppModal } from '@/components/AppModal.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useConfig } from '@/contexts/ConfigContext.js';
import { sessionMetricsService, type MetricsSnapshot } from '@/services/SessionMetricsService.js';
import { LSP } from '@/services/lsp/index.js';
import type { LSPStatus } from '@/services/lsp/types.js';
import { formatTokens, formatCost } from '@/utils/formatters.js';

const StatModal = ({ deactivate, context }: CommandComponentProps) => {
  const { theme } = useTheme();
  const { get } = useConfig();
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [lspStatus, setLspStatus] = useState<LSPStatus[]>([]);

  const orchestratorManager = context.orchestratorManager;
  const conversationId = orchestratorManager?.getConversationContext().getActiveConversationId();

  useEffect(() => {
    if (conversationId) {
      setMetrics(sessionMetricsService.getSnapshot(conversationId));
    }

    LSP.status().then(setLspStatus);
  }, [conversationId]);

  const provider = get<string>('activeProvider');
  const model = get<string>('model');

  return (
    <AppModal visible={true} title="Session Statistics" onClose={deactivate} closeOnEscape={true} closeOnEnter={true}>
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text color={theme.tokens.yellow} bold>
            Model
          </Text>
          <Text>
            Provider: <Text color={theme.tokens.cyan}>{provider}</Text>
          </Text>
          <Text>
            Model: <Text color={theme.tokens.cyan}>{model}</Text>
          </Text>
        </Box>

        {metrics && (
          <Box flexDirection="column">
            <Text color={theme.tokens.yellow} bold>
              Token Usage
            </Text>
            <Text>
              Current Request: <Text color={theme.tokens.green}>{formatTokens(metrics.currentTokens)}</Text>
              {metrics.contextWindowUsage !== undefined && (
                <Text color={theme.tokens.gray}> ({Math.round(metrics.contextWindowUsage * 100)}% of context)</Text>
              )}
            </Text>
            <Text>
              {'  '}↑ Prompt: <Text color={theme.tokens.blue}>{formatTokens(metrics.currentPromptTokens)}</Text>
            </Text>
            <Text>
              {'  '}↓ Completion:{' '}
              <Text color={theme.tokens.magenta}>{formatTokens(metrics.currentCompletionTokens)}</Text>
            </Text>
            {metrics.currentCachedTokens > 0 && (
              <Text>
                {'  '}Cached: <Text color={theme.tokens.green}>{formatTokens(metrics.currentCachedTokens)}</Text>
              </Text>
            )}
            <Text>
              Total Session: <Text color={theme.tokens.green}>{formatTokens(metrics.totalTokens)}</Text>
            </Text>
          </Box>
        )}

        {metrics && (
          <Box flexDirection="column">
            <Text color={theme.tokens.yellow} bold>
              Activity
            </Text>
            <Text>
              LLM Calls: <Text color={theme.tokens.cyan}>{metrics.llmCallCount}</Text>
            </Text>
            <Text>
              Tool Calls: <Text color={theme.tokens.cyan}>{metrics.toolCallCount}</Text>
            </Text>
            {metrics.totalCost > 0 && (
              <Text>
                Estimated Cost: <Text color={theme.tokens.green}>${formatCost(metrics.totalCost)}</Text>
              </Text>
            )}
          </Box>
        )}

        <Box flexDirection="column">
          <Text color={theme.tokens.yellow} bold>
            LSP Servers {lspStatus.length > 0 ? `(${lspStatus.length})` : ''}
          </Text>
          {lspStatus.length === 0 ? (
            <Text color={theme.tokens.gray}>No LSP servers connected</Text>
          ) : (
            lspStatus.map((server) => (
              <Text key={`${server.serverID}-${server.root}`}>
                <Text color={server.status === 'connected' ? theme.tokens.green : theme.tokens.yellow}>●</Text>{' '}
                <Text color={theme.tokens.cyan}>{server.serverName}</Text>
                <Text color={theme.tokens.gray}> ({server.root})</Text>
              </Text>
            ))
          )}
        </Box>
      </Box>
    </AppModal>
  );
};

export function registerStatCommand(registry: CommandRegistry) {
  registry.register({
    id: '/stat',
    type: 'component',
    description: 'Show session statistics (tokens, LSP, costs)',
    category: 'ui',
    component: StatModal,
  });
}
