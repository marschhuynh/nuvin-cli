import { useInput } from '@/contexts/InputContext/index.js';
import type { AgentInfo } from './AgentModal.js';
import type { AgentModalState, AgentModalActions } from './useAgentModalState.js';

interface UseAgentModalKeyboardProps {
  visible: boolean;
  agents: AgentInfo[];
  state: AgentModalState;
  actions: AgentModalActions;
  onClose: () => void;
  onAgentStatusChange?: (agentName: string, enabled: boolean) => void;
  onAgentCreate?: () => void;
  onAgentDelete?: (agentName: string) => void;
  onAgentEdit?: (agentName: string) => void;
}

export const useAgentModalKeyboard = ({
  visible,
  agents,
  state,
  actions,
  onClose,
  onAgentStatusChange,
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
          if (currentAgent.name) {
            const newValue = state.localEnabledAgents[currentAgent.name] === false;
            actions.toggleAgent(currentAgent.name);
            onAgentStatusChange?.(currentAgent.name, newValue);
          }
        }
        return;
      }

      // Enter - Toggle or select
      if (key.return) {
        if (agents[state.selectedAgentIndex]) {
          const currentAgent = agents[state.selectedAgentIndex];
          const newValue = state.localEnabledAgents[currentAgent.name] === false;
          actions.toggleAgent(currentAgent.name);
          onAgentStatusChange?.(currentAgent.name, newValue);
        }
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
            onAgentEdit?.(currentAgent.name);
          }
        }
        return;
      }

      // X - Delete agent (custom agents only)
      if (input === 'x' || input === 'X') {
        if (agents[state.selectedAgentIndex]) {
          const currentAgent = agents[state.selectedAgentIndex];
          if (!currentAgent.isDefault) {
            actions.removeAgent(currentAgent.name);
            onAgentDelete?.(currentAgent.name);
          }
        }
        return;
      }
    },
    { isActive: visible },
  );
};
