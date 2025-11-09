import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { AgentInfo } from './AgentModal.js';

interface AgentDetailsProps {
  agent: AgentInfo | undefined;
  isAgentEnabled: (agentId: string) => boolean;
}

export const AgentDetails: React.FC<AgentDetailsProps> = ({ agent }) => {
  const { theme } = useTheme();

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text color={theme.history.unselected}>Details</Text>
      </Box>

      {!agent ? (
        <Text color={theme.history.help}>Select an agent to view details</Text>
      ) : (
        <Box flexDirection="column">
          <Box marginBottom={1} height={5}>
            <Text>{agent.description}</Text>
          </Box>

          <Box flexDirection="column">
            <Text color={theme.history.help} dimColor>
              ID:
            </Text>
            <Text>{agent.id}</Text>
          </Box>

          <Box flexDirection="column">
            <Text color={theme.history.help} dimColor>
              Tools:
            </Text>
            <Text>{agent.tools?.join(', ') || 'None'}</Text>
          </Box>

          {agent.temperature !== undefined && (
            <Box flexDirection="column">
              <Text color={theme.history.help} dimColor>
                Temperature:
              </Text>
              <Text>{agent.temperature}</Text>
            </Box>
          )}

          {agent.maxTokens !== undefined && (
            <Box flexDirection="column">
              <Text color={theme.history.help} dimColor>
                Max Tokens:
              </Text>
              <Text>{agent.maxTokens}</Text>
            </Box>
          )}

          <Box flexDirection="column">
            <Text color={theme.history.help} dimColor>
              Model:
            </Text>
            <Text>{agent.model ?? 'Inherited'}</Text>
          </Box>

          {!agent.isDefault ? (
            <Box marginTop={1}>
              <Text color="yellow" dimColor>
                Press E to edit or X to delete this agent
              </Text>
            </Box>
          ) : (
            <Box marginTop={1}>
              <Text color={theme.history.help} dimColor>
                Default agents cannot be edited or deleted
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
