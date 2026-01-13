import type React from 'react';
import { useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import type { AgentInfo } from './AgentModal.js';

interface AgentListProps {
  agents: AgentInfo[];
  isAgentEnabled: (agentId: string) => boolean;
  onAgentSelect: (index: number) => void;
  onToggle?: (agentId: string) => void;
  onEdit?: (agentId: string) => void;
  onNew?: () => void;
  maxHeight?: number;
  flexGrow?: number;
  focus?: boolean;
}

export const AgentList: React.FC<AgentListProps> = ({
  agents,
  isAgentEnabled,
  onAgentSelect,
  onToggle,
  onEdit,
  onNew,
  focus = true,
}) => {
  const { theme } = useTheme();

  const getEnabledCount = () => {
    return agents.filter((agent) => isAgentEnabled(agent.id)).length;
  };

  const comboBoxItems = useMemo<ComboBoxItem[]>(
    () =>
      agents.map((agent) => ({
        label: agent.name,
        value: agent.id,
      })),
    [agents],
  );

  const renderAgentItem = useCallback(
    (item: ComboBoxItem, isSelected: boolean) => {
      const agent = agents.find((a) => a.id === item.value);
      if (!agent) return null;

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
                  <Text key={i}>
                    {param}
                    {i < params.length - 1 && <Text dimColor> - </Text>}
                  </Text>
                ))}
              </>
            )}
          </Box>
          {isSelected && (
            <Box marginLeft={4}>
              <Text dimColor wrap="wrap">
                └─ {agent.description}
              </Text>
            </Box>
          )}
        </Box>
      );
    },
    [agents, isAgentEnabled, theme],
  );

  const handleSelect = useCallback(
    (item: ComboBoxItem) => {
      const agent = agents.find((a) => a.id === item.value);
      if (agent) {
        onEdit?.(agent.id);
      }
    },
    [agents, onEdit],
  );

  const handleSpace = useCallback(
    (item: ComboBoxItem) => {
      const agent = agents.find((a) => a.id === item.value);
      if (agent) {
        onToggle?.(agent.id);
      }
    },
    [agents, onToggle],
  );

  const handleHighlight = useCallback(
    (_item: ComboBoxItem | null, index: number) => {
      onAgentSelect(index);
    },
    [onAgentSelect],
  );

  return (
    <Box flexDirection="column" width="100%" flexGrow={1} overflow="hidden">
      <Box marginBottom={1} flexShrink={0}>
        <Text color={theme.tokens.cyan} bold>
          Agents ({getEnabledCount()}/{agents.length})
        </Text>
      </Box>

      <ComboBox
        items={comboBoxItems}
        placeholder="Search agents..."
        enableRotation={true}
        showItemCount={false}
        focus={focus}
        renderItem={renderAgentItem}
        onSelect={handleSelect}
        onHighlight={handleHighlight}
        onSpace={handleSpace}
        onNew={onNew}
      />
    </Box>
  );
};
