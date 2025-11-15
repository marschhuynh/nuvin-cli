import { useInput } from 'ink';
import type { AgentInfo } from './AgentModal.js';
import type { AgentModalState, AgentModalActions } from './useAgentModalState.js';

interface UseAgentModalKeyboardProps {
  visible: boolean;
  agents: AgentInfo[];
  state: AgentModalState;
  actions: AgentModalActions;
  onClose: () => void;
  onAgentStatusChange?: (agentId: string, enabled: boolean) => void;
  onAgentBatchStatusChange?: (config: Record<string, boolean>) => void;
  onAgentCreate?: () => void;
  onAgentDelete?: (agentId: string) => void;
  onAgentEdit?: (agentId: string) => void;
}

export const useAgentModalKeyboard = ({
  visible,
  agents,
  state,
  actions,
  onClose,
  onAgentStatusChange,
  onAgentBatchStatusChange,
  onAgentCreate,
  onAgentDelete,
  onAgentEdit,
}: UseAgentModalKeyboardProps) => {
  useInput(
    (input, key) => {
      if (!visible) return;

      // ESC - Close
      if (key.escape) {
        onClose();
        return;
      }

      // Arrow keys
      if (key.upArrow) {
        actions.setSelectedAgentIndex(Math.max(0, state.selectedAgentIndex - 1));
        return;
      }

      if (key.downArrow) {
        actions.setSelectedAgentIndex(Math.min(agents.length - 1, state.selectedAgentIndex + 1));
        return;
      }

      // Space - Toggle agent enabled/disabled
      if (input === ' ') {
        if (agents[state.selectedAgentIndex]) {
          const currentAgent = agents[state.selectedAgentIndex];
          if (currentAgent.id) {
            const newValue = state.localEnabledAgents[currentAgent.id] === false;
            actions.toggleAgent(currentAgent.id);
            onAgentStatusChange?.(currentAgent.id, newValue);
          }
        }
        return;
      }

      // Enter - Toggle or select
      if (key.return) {
        if (agents[state.selectedAgentIndex]) {
          const currentAgent = agents[state.selectedAgentIndex];
          const newValue = state.localEnabledAgents[currentAgent.id] === false;
          actions.toggleAgent(currentAgent.id);
          onAgentStatusChange?.(currentAgent.id, newValue);
        }
        return;
      }

      // A - Enable all agents
      if (input === 'a' || input === 'A') {
        const updatedConfig = actions.enableAllAgents(agents);
        onAgentBatchStatusChange?.(updatedConfig);
        return;
      }

      // D - Disable all agents
      if (input === 'd' || input === 'D') {
        const updatedConfig = actions.disableAllAgents(agents);
        onAgentBatchStatusChange?.(updatedConfig);
        return;
      }

      // N - Create new agent
      if (input === 'n' || input === 'N') {
        onAgentCreate?.();
        return;
      }

      // E - Edit agent (custom agents only)
      if (input === 'e' || input === 'E') {
        if (agents[state.selectedAgentIndex]) {
          const currentAgent = agents[state.selectedAgentIndex];
          if (!currentAgent.isDefault) {
            onAgentEdit?.(currentAgent.id);
          }
        }
        return;
      }

      // X - Delete agent (custom agents only)
      if (input === 'x' || input === 'X') {
        if (agents[state.selectedAgentIndex]) {
          const currentAgent = agents[state.selectedAgentIndex];
          if (!currentAgent.isDefault) {
            actions.removeAgent(currentAgent.id);
            onAgentDelete?.(currentAgent.id);
          }
        }
        return;
      }
    },
    { isActive: visible },
  );
};
