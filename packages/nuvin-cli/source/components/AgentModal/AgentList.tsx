import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { AgentInfo } from './AgentModal.js';

interface AgentListProps {
  agents: AgentInfo[];
  selectedAgentIndex: number;
  isAgentEnabled: (agentId: string) => boolean;
  onAgentSelect: (index: number) => void;
}

export const AgentList: React.FC<AgentListProps> = ({ agents, selectedAgentIndex, isAgentEnabled }) => {
  const { theme } = useTheme();

  const getEnabledCount = () => {
    return agents.filter((agent) => isAgentEnabled(agent.id)).length;
  };

  return (
    <Box flexDirection="column" width="30" marginRight={2}>
      <Box marginBottom={1}>
        <Text color={theme.tokens.cyan} bold>
          Agents ({getEnabledCount()}/{agents.length})
        </Text>
      </Box>

      {agents.map((agent, index) => {
        const isSelected = index === selectedAgentIndex;
        const enabled = isAgentEnabled(agent.id);
        const statusColor = enabled ? 'green' : 'red';
        const statusIcon = enabled ? '✓' : '✗';

        return (
          <Box key={agent.id} marginBottom={0} flexDirection="column">
            <Box>
              <Text color={statusColor} bold>
                {statusIcon}
              </Text>
              <Text> </Text>
              <Text
                color={isSelected ? theme.tokens.cyan : theme.history.unselected}
                bold={isSelected}
              >
                {isSelected ? '› ' : '  '}
                {agent.name}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
