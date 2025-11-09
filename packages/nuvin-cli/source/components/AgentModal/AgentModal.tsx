import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { AgentTemplate } from '@nuvin/nuvin-core';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { useAgentModalState } from './useAgentModalState.js';
import { useAgentModalKeyboard } from './useAgentModalKeyboard.js';
import { AgentList } from './AgentList.js';
import { AgentDetails } from './AgentDetails.js';

export interface AgentInfo extends AgentTemplate {
  isDefault: boolean;
}

interface AgentModalProps {
  visible: boolean;
  agents: AgentInfo[];
  enabledAgents?: Record<string, boolean>;
  initialSelectedIndex?: number;
  onClose: () => void;
  onAgentStatusChange?: (agentId: string, enabled: boolean) => void;
  onAgentBatchStatusChange?: (config: Record<string, boolean>) => void;
  onAgentCreate?: () => void;
  onAgentDelete?: (agentId: string) => void;
  onAgentEdit?: (agentId: string) => void;
}

export const AgentModal: React.FC<AgentModalProps> = ({
  visible,
  agents,
  enabledAgents = {},
  initialSelectedIndex,
  onClose,
  onAgentStatusChange,
  onAgentBatchStatusChange,
  onAgentCreate,
  onAgentDelete,
  onAgentEdit,
}) => {
  const { theme } = useTheme();

  const state = useAgentModalState(agents, enabledAgents, initialSelectedIndex);

  useAgentModalKeyboard({
    visible,
    agents,
    state,
    actions: state,
    onClose,
    onAgentStatusChange,
    onAgentBatchStatusChange,
    onAgentCreate,
    onAgentDelete,
    onAgentEdit,
  });

  if (!visible) return null;

  const currentAgent = agents[state.selectedAgentIndex];

  return (
    <AppModal
      visible={visible}
      title="Agent Configuration"
      titleColor={theme.colors.primary}
      type="default"
      onClose={undefined}
      closeOnEscape={false}
      paddingX={2}
      paddingY={1}
    >
      {/* <AgentModalHelp focusPanel={state.focusPanel} /> */}

      <Box marginBottom={1} flexDirection="column">
        <Text color={theme.history.help} dimColor>
          ↑↓ navigate • Space/Enter toggle • ESC exit
        </Text>
        <Box>
          <HelpText
            segments={[
              { text: 'A', highlight: true },
              { text: ' enable all • ' },
              { text: 'D', highlight: true },
              { text: ' disable all • ' },
              { text: 'N', highlight: true },
              { text: ' new agent • ' },
              { text: 'E', highlight: true },
              { text: ' edit (custom only) • ' },
              { text: 'X', highlight: true },
              { text: ' delete (custom only)' },
            ]}
          />
        </Box>
      </Box>

      {agents.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.history.help}>No agents configured. Press N to create a new agent.</Text>
        </Box>
      ) : (
        <Box flexDirection="row">
          <AgentList
            agents={agents}
            selectedAgentIndex={state.selectedAgentIndex}
            isAgentEnabled={state.isAgentEnabled}
            onAgentSelect={state.setSelectedAgentIndex}
          />

          <AgentDetails agent={currentAgent} isAgentEnabled={state.isAgentEnabled} />
        </Box>
      )}
    </AppModal>
  );
};

export default AgentModal;
