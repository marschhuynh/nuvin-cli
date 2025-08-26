import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { AgentSettings } from '@/types';

interface AgentState {
  agents: AgentSettings[];
  activeAgentId: string;
  addAgent: (agent: AgentSettings) => void;
  updateAgent: (agent: AgentSettings) => void;
  deleteAgent: (id: string) => void;
  setActiveAgent: (id: string) => void;
  reset: () => void;
}

const defaultAgents: AgentSettings[] = [];

export const useAgentStore = create<AgentState>()(
  persist(
    devtools((set) => ({
      agents: defaultAgents,
      activeAgentId: defaultAgents?.[0]?.id,
      addAgent: (agent) => set((state) => ({ agents: [...state.agents, agent] })),
      updateAgent: (agent) =>
        set((state) => ({
          agents: state.agents.map((a) => (a.id === agent.id ? agent : a)),
        })),
      deleteAgent: (id) =>
        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id),
        })),
      setActiveAgent: (id) => set(() => ({ activeAgentId: id })),
      reset: () => set({ agents: defaultAgents, activeAgentId: defaultAgents?.[0]?.id }),
    })),
    {
      name: 'agent-storage',
    },
  ),
);
