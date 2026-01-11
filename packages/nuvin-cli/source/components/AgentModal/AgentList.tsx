import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { ScrollableSelectList, type ScrollableSelectItem } from '@/components/ScrollableSelectList/index.js';
import type { AgentInfo } from './AgentModal.js';

interface AgentListProps {
  agents: AgentInfo[];
  selectedAgentIndex: number;
  isAgentEnabled: (agentId: string) => boolean;
  onAgentSelect: (index: number) => void;
  maxHeight?: number;
  flexGrow?: number;
  focus?: boolean;
}

export const AgentList: React.FC<AgentListProps> = ({
  agents,
  selectedAgentIndex,
  isAgentEnabled,
  onAgentSelect,
  maxHeight,
  flexGrow,
  focus = true,
}) => {
  const { theme } = useTheme();

  const getEnabledCount = () => {
    return agents.filter((agent) => isAgentEnabled(agent.id)).length;
  };

  const items: ScrollableSelectItem<AgentInfo>[] = agents.map((agent) => ({
    key: agent.id,
    value: agent,
  }));

  const renderItem = (agent: AgentInfo, isSelected: boolean) => {
    const enabled = isAgentEnabled(agent.id);
    const statusColor = enabled ? theme.tokens.green : theme.tokens.red;
    const statusIcon = enabled ? '✓' : '✗';
    const accentColor = theme.colors.accent;

    const params: React.ReactNode[] = [];
    if (agent.maxTokens) {
      params.push(
        <Text key="max_tokens">
          <Text dimColor>max_tokens: </Text>
          <Text color="white">{agent.maxTokens}</Text>
        </Text>,
      );
    }
    if (agent.temperature !== undefined) {
      params.push(
        <Text key="temperature">
          <Text dimColor>temperature: </Text>
          <Text color="white">{agent.temperature}</Text>
        </Text>,
      );
    }
    if (agent.topP !== undefined) {
      params.push(
        <Text key="top_p">
          <Text dimColor>top_p: </Text>
          <Text color="white">{agent.topP}</Text>
        </Text>,
      );
    }

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={statusColor} bold>
            {statusIcon}
          </Text>
          <Text> </Text>
          <Text color={isSelected ? accentColor : undefined}>
            {isSelected ? '› ' : '  '}
          </Text>
          <Text color={isSelected ? accentColor : 'white'} bold={isSelected}>
            {agent.name}
          </Text>
          {params.length > 0 && (
            <>
              <Text dimColor> - </Text>
              {params.map((param, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: params have stable internal keys
                <Text key={i}>
                  {param}
                  {i < params.length - 1 && <Text dimColor> - </Text>}
                </Text>
              ))}
            </>
          )}
        </Box>
        <Box marginLeft={4}>
          <Text dimColor wrap="wrap">
            └─ {agent.description}
          </Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width="100%" flexGrow={flexGrow} overflow="hidden">
      <Box marginBottom={1} flexShrink={0}>
        <Text color={theme.tokens.cyan} bold>
          Agents ({getEnabledCount()}/{agents.length})
        </Text>
      </Box>

      <ScrollableSelectList
        items={items}
        selectedIndex={selectedAgentIndex}
        onHighlight={(_, index) => onAgentSelect(index)}
        renderItem={renderItem}
        focus={focus}
        maxHeight={maxHeight}
        flexGrow={!maxHeight ? 1 : undefined}
      />
    </Box>
  );
};
