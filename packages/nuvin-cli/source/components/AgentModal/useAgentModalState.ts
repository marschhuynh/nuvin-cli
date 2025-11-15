import { useState, useEffect } from 'react';
import type { AgentInfo } from './AgentModal.js';

export interface AgentModalState {
  selectedAgentIndex: number;
  focusPanel: 'agents' | 'details';
  localEnabledAgents: Record<string, boolean>;
}

export interface AgentModalActions {
  setSelectedAgentIndex: (index: number) => void;
  setFocusPanel: (panel: 'agents' | 'details') => void;
  setLocalEnabledAgents: (agents: Record<string, boolean>) => void;
  toggleAgent: (agentId: string) => void;
  enableAllAgents: (agents: AgentInfo[]) => Record<string, boolean>;
  disableAllAgents: (agents: AgentInfo[]) => Record<string, boolean>;
  removeAgent: (agentId: string) => void;
  isAgentEnabled: (agentId: string) => boolean;
  getEnabledCount: (agents: AgentInfo[]) => number;
}

export const useAgentModalState = (
  agents: AgentInfo[],
  enabledAgents: Record<string, boolean> = {},
  initialSelectedIndex?: number,
) => {
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(() => {
    // Use initialSelectedIndex if provided and valid, otherwise default to 0
    if (initialSelectedIndex !== undefined && initialSelectedIndex >= 0 && initialSelectedIndex < agents.length) {
      return initialSelectedIndex;
    }
    return 0;
  });
  const [focusPanel, setFocusPanel] = useState<'agents' | 'details'>('agents');
  const [localEnabledAgents, setLocalEnabledAgents] = useState<Record<string, boolean>>(() => ({ ...enabledAgents }));

  // Sync local state with prop changes
  useEffect(() => {
    setLocalEnabledAgents({ ...enabledAgents });
  }, [enabledAgents]);

  // Update selectedAgentIndex when initialSelectedIndex changes (for restoration)
  useEffect(() => {
    if (initialSelectedIndex !== undefined && initialSelectedIndex >= 0 && initialSelectedIndex < agents.length) {
      setSelectedAgentIndex(initialSelectedIndex);
    }
  }, [initialSelectedIndex, agents.length]);

  // Reset selections when agents change
  useEffect(() => {
    if (agents.length === 0) {
      setSelectedAgentIndex(0);
      setFocusPanel('agents');
    } else if (selectedAgentIndex >= agents.length) {
      setSelectedAgentIndex(Math.max(0, agents.length - 1));
    }
  }, [agents.length, selectedAgentIndex]);

  const toggleAgent = (agentId: string) => {
    const newEnabledAgents = { ...localEnabledAgents };
    const currentValue = newEnabledAgents[agentId];
    newEnabledAgents[agentId] = currentValue === false;
    setLocalEnabledAgents(newEnabledAgents);
  };

  const enableAllAgents = (agents: AgentInfo[]) => {
    const newEnabledAgents = { ...localEnabledAgents };
    agents.forEach((agent) => {
      newEnabledAgents[agent.id] = true;
    });
    setLocalEnabledAgents(newEnabledAgents);
    return newEnabledAgents;
  };

  const disableAllAgents = (agents: AgentInfo[]) => {
    const newEnabledAgents = { ...localEnabledAgents };
    agents.forEach((agent) => {
      newEnabledAgents[agent.id] = false;
    });
    setLocalEnabledAgents(newEnabledAgents);
    return newEnabledAgents;
  };

  const removeAgent = (agentId: string) => {
    const newEnabledAgents = { ...localEnabledAgents };
    delete newEnabledAgents[agentId];
    setLocalEnabledAgents(newEnabledAgents);
  };

  const isAgentEnabled = (agentId: string) => {
    return localEnabledAgents[agentId] !== false;
  };

  const getEnabledCount = (agents: AgentInfo[]) => {
    return agents.filter((agent) => isAgentEnabled(agent.id)).length;
  };

  return {
    selectedAgentIndex,
    focusPanel,
    localEnabledAgents,
    setSelectedAgentIndex,
    setFocusPanel,
    setLocalEnabledAgents,
    toggleAgent,
    enableAllAgents,
    disableAllAgents,
    removeAgent,
    isAgentEnabled,
    getEnabledCount,
  };
};
