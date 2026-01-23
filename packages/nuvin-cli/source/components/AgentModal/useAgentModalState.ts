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
  toggleAgent: (agentName: string) => void;
  enableAllAgents: (agents: AgentInfo[]) => Record<string, boolean>;
  disableAllAgents: (agents: AgentInfo[]) => Record<string, boolean>;
  removeAgent: (agentName: string) => void;
  isAgentEnabled: (agentName: string) => boolean;
  getEnabledCount: (agents: AgentInfo[]) => number;
}

export const useAgentModalState = (
  agents: AgentInfo[],
  enabledAgents: Record<string, boolean> = {},
  initialSelectedIndex?: number,
) => {
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(() => {
    if (initialSelectedIndex !== undefined && initialSelectedIndex >= 0 && initialSelectedIndex < agents.length) {
      return initialSelectedIndex;
    }
    return 0;
  });
  const [focusPanel, setFocusPanel] = useState<'agents' | 'details'>('agents');
  const [localEnabledAgents, setLocalEnabledAgents] = useState<Record<string, boolean>>(() => ({ ...enabledAgents }));

  useEffect(() => {
    setLocalEnabledAgents({ ...enabledAgents });
  }, [enabledAgents]);

  useEffect(() => {
    if (initialSelectedIndex !== undefined && initialSelectedIndex >= 0 && initialSelectedIndex < agents.length) {
      setSelectedAgentIndex(initialSelectedIndex);
    }
  }, [initialSelectedIndex, agents.length]);

  useEffect(() => {
    if (agents.length === 0) {
      setSelectedAgentIndex(0);
      setFocusPanel('agents');
    } else if (selectedAgentIndex >= agents.length) {
      setSelectedAgentIndex(Math.max(0, agents.length - 1));
    }
  }, [agents.length, selectedAgentIndex]);

  const toggleAgent = (agentName: string) => {
    const newEnabledAgents = { ...localEnabledAgents };
    const currentValue = newEnabledAgents[agentName];
    newEnabledAgents[agentName] = currentValue === false;
    setLocalEnabledAgents(newEnabledAgents);
  };

  const enableAllAgents = (agents: AgentInfo[]) => {
    const newEnabledAgents = { ...localEnabledAgents };
    agents.forEach((agent) => {
      newEnabledAgents[agent.name] = true;
    });
    setLocalEnabledAgents(newEnabledAgents);
    return newEnabledAgents;
  };

  const disableAllAgents = (agents: AgentInfo[]) => {
    const newEnabledAgents = { ...localEnabledAgents };
    agents.forEach((agent) => {
      newEnabledAgents[agent.name] = false;
    });
    setLocalEnabledAgents(newEnabledAgents);
    return newEnabledAgents;
  };

  const removeAgent = (agentName: string) => {
    const newEnabledAgents = { ...localEnabledAgents };
    delete newEnabledAgents[agentName];
    setLocalEnabledAgents(newEnabledAgents);
  };

  const isAgentEnabled = (agentName: string) => {
    return localEnabledAgents[agentName] !== false;
  };

  const getEnabledCount = (agents: AgentInfo[]) => {
    return agents.filter((agent) => isAgentEnabled(agent.name)).length;
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
