import type React from 'react';
import { useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import type { AgentInfo } from './AgentModal.js';

interface AgentListProps {
  agents: AgentInfo[];
  isAgentEnabled: (agentName: string) => boolean;
  onAgentSelect: (index: number) => void;
  onToggle?: (agentName: string) => void;
  onEdit?: (agentName: string) => void;
  onNew?: () => void;
  maxHeight?: number;
  flexGrow?: number;
  focus?: boolean;
  showStatus?: boolean;
}

export const AgentList: React.FC<AgentListProps> = ({
  agents,
  isAgentEnabled,
  onAgentSelect,
  onToggle,
  onEdit,
  onNew,
  focus = true,
  showStatus = true,
}) => {
  const { theme } = useTheme();

  const getEnabledCount = () => {
    return agents.filter((agent) => isAgentEnabled(agent.name)).length;
  };

  const comboBoxItems = useMemo<ComboBoxItem[]>(
    () =>
      agents.map((agent) => ({
        label: agent.name,
        value: agent.name,
      })),
    [agents],
  );

  const renderAgentItem = useCallback(
    (item: ComboBoxItem, isSelected: boolean) => {
      const agent = agents.find((a) => a.name === item.value);
      if (!agent) return null;

      const enabled = isAgentEnabled(agent.name);
      const statusColor = showStatus ? (enabled ? theme.tokens.green : theme.tokens.red) : theme.tokens.green;
      const statusIcon = showStatus ? (enabled ? '✓' : '✗') : '✓';
      const accentColor = theme.colors.accent;
      const isBuiltin = agent.isDefault;
      const location = agent.location || (isBuiltin ? 'built-in' : 'local');
      const isMainAgent = agent.name === 'nuvin';

      // Determine location badge color
      const locationColor =
        location === 'built-in' ? theme.tokens.blue : location === 'global' ? theme.tokens.yellow : theme.tokens.cyan;

      const params: React.ReactNode[] = [];

      if (agent.max_tokens) {
        params.push(
            <Text key="max_tokens">
              <Text dimColor>max_tokens: </Text>
              <Text color={theme.colors.text}>{agent.max_tokens}</Text>
            </Text>,
          );
      }
      if (agent.temperature !== undefined) {
        params.push(
            <Text key="temperature">
              <Text dimColor>temperature: </Text>
              <Text color={theme.colors.text}>{agent.temperature}</Text>
            </Text>,
          );
      }
      if (agent.top_p !== undefined) {
        params.push(
            <Text key="top_p">
              <Text dimColor>top_p: </Text>
              <Text color={theme.colors.text}>{agent.top_p}</Text>
            </Text>,
          );
      }

      return (
        <Box flexDirection="column">
          <Box>
            <Text color={statusColor} bold>
              {statusIcon}
            </Text>
            <Text> </Text>
            <Text color={isSelected ? accentColor : undefined}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? accentColor : theme.colors.text} bold={isSelected}>
              {agent.name}
            </Text>
            <Text dimColor> </Text>
            {isMainAgent ? (
              <Text color={theme.tokens.magenta} bold>
                [main]
              </Text>
            ) : (
              <Text color={locationColor} dimColor>
                [{location}]
              </Text>
            )}
          </Box>
          {isSelected && (
            <Box flexDirection="column">
              {agent.description && (
                <Box
                  marginLeft={4}
                  borderStyle={'single'}
                  borderTop={false}
                  borderBottom={false}
                  borderRight={false}
                  borderLeft
                  borderDimColor
                  paddingX={1}
                  height={2}
                  overflow="hidden"
                >
                  <Text dimColor wrap="wrap">
                    {agent.description}
                  </Text>
                </Box>
              )}
              <Box marginLeft={4}>
                <Text dimColor wrap="wrap">
                  └─{' '}
                </Text>
                {params.length > 0 &&
                  params.map((param, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: <i> is fine here since params are static
                    <Text key={i}>
                      {param}
                      {i < params.length - 1 && <Text dimColor> - </Text>}
                    </Text>
                  ))}
              </Box>
            </Box>
          )}
        </Box>
      );
    },
    [agents, isAgentEnabled, theme, showStatus],
  );

  const handleSelect = useCallback(
    (item: ComboBoxItem) => {
      const agent = agents.find((a) => a.name === item.value);
      if (agent) {
        onEdit?.(agent.name);
      }
    },
    [agents, onEdit],
  );

  const handleSpace = useCallback(
    (item: ComboBoxItem) => {
      const agent = agents.find((a) => a.name === item.value);
      if (agent) {
        onToggle?.(agent.name);
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
