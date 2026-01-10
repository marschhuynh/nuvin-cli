import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { CompleteAgent } from '@nuvin/nuvin-core';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { useAgentModalState } from './useAgentModalState.js';
import { useAgentModalKeyboard } from './useAgentModalKeyboard.js';
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

export const AgentModal: React.FC<AgentModalProps> = ({
  visible,
  agents,
  enabledAgents = {},
  initialSelectedIndex,
  onClose,
  onAgentStatusChange,
  onAgentCreate,
  onAgentDelete,
  onAgentEdit,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const state = useAgentModalState(agents, enabledAgents, initialSelectedIndex);

  useAgentModalKeyboard({
    visible,
    agents,
    state,
    actions: state,
    onClose,
    onAgentStatusChange,
    onAgentCreate,
    onAgentDelete,
    onAgentEdit,
  });

  if (!visible) return null;

  const listMaxHeight = Math.max(10, rows - 10);

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1}>
      <HelpText
        segments={[
          { text: '↑↓' },
          { text: ' navigate • ' },
          { text: 'Space/Enter' },
          { text: ' toggle • ' },
          { text: 'N', highlight: true },
          { text: ' new • ' },
          { text: 'E', highlight: true },
          { text: ' edit • ' },
          { text: 'X', highlight: true },
          { text: ' delete • ' },
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
      onClose={undefined}
      closeOnEscape={false}
      paddingX={2}
      paddingY={1}
      footer={footerContent}
    >
      {agents.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.history.help}>No agents configured. Press N to create a new agent.</Text>
        </Box>
      ) : (
        <AgentList
          agents={agents}
          selectedAgentIndex={state.selectedAgentIndex}
          isAgentEnabled={state.isAgentEnabled}
          onAgentSelect={state.setSelectedAgentIndex}
          maxHeight={listMaxHeight}
          focus={true}
        />
      )}
    </AppModal>
  );
};

export default AgentModal;
