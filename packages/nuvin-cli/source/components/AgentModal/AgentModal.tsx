import type React from 'react';
import { useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { CompleteAgent } from '@nuvin/nuvin-core';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { useAgentModalState } from './useAgentModalState.js';
import { AgentList } from './AgentList.js';

export interface AgentInfo extends CompleteAgent {
  isDefault: boolean;
}

interface AgentModalProps {
  visible: boolean;
  agents: AgentInfo[];
  enabledAgents?: Record<string, boolean>;
  initialSelectedIndex?: number;
  onClose: () => void;
  onAgentStatusChange?: (agentId: string, enabled: boolean) => void;
  onAgentCreate?: () => void;
  onAgentDelete?: (agentId: string) => void;
  onAgentEdit?: (agentId: string) => void;
}

export const AgentConfigurationModal: React.FC<AgentModalProps> = ({
  visible,
  agents,
  enabledAgents = {},
  initialSelectedIndex,
  onClose,
  onAgentStatusChange,
  onAgentCreate,
  onAgentEdit,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const state = useAgentModalState(agents, enabledAgents, initialSelectedIndex);

  const handleToggle = useCallback(
    (agentId: string) => {
      const newValue = state.localEnabledAgents[agentId] === false;
      state.toggleAgent(agentId);
      onAgentStatusChange?.(agentId, newValue);
    },
    [state, onAgentStatusChange],
  );

  const handleEdit = useCallback(
    (agentId: string) => {
      onAgentEdit?.(agentId);
    },
    [onAgentEdit],
  );

  if (!visible) return null;

  const modalHeight = rows - 4;

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
      <HelpText
        segments={[
          { text: '↑↓' },
          { text: ' navigate • ' },
          { text: 'Space' },
          { text: ' toggle • ' },
          { text: 'Enter' },
          { text: ' edit • ' },
          { text: 'Ctrl+N', highlight: true },
          { text: ' new • ' },
          { text: 'ESC', highlight: true },
          { text: ' exit' },
        ]}
      />
    </Box>
  );

  return (
    <AppModal
      visible={visible}
      title="Agent Configuration"
      closeOnEscape={true}
      closeOnEnter={false}
      onClose={onClose}
      paddingX={2}
      paddingY={1}
      footer={footerContent}
      height={modalHeight}
    >
      {agents.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.history.help}>No agents configured. Press N to create a new agent.</Text>
        </Box>
      ) : (
        <AgentList
          agents={agents}
          isAgentEnabled={state.isAgentEnabled}
          onAgentSelect={state.setSelectedAgentIndex}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onNew={onAgentCreate}
          flexGrow={1}
          focus={true}
        />
      )}
    </AppModal>
  );
};

export default AgentConfigurationModal;
