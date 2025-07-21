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

const defaultAgents: AgentSettings[] = [
  {
    id: '1',
    name: 'General Assistant',
    persona: 'helpful',
    responseLength: 'medium',
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 2048,
    systemPrompt:
      'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.',
    agentType: 'local',
  },
  {
    id: '2',
    name: 'Code Reviewer',
    persona: 'analytical',
    responseLength: 'detailed',
    temperature: 0.3,
    topP: 0.9,
    maxTokens: 3000,
    systemPrompt:
      'You are a senior software engineer specializing in code reviews. Analyze code for best practices, potential bugs, security issues, and suggest improvements. Be thorough and constructive in your feedback.',
    agentType: 'local',
  },
  {
    id: '3',
    name: 'Creative Writer',
    persona: 'creative',
    responseLength: 'long',
    temperature: 1.2,
    topP: 1.0,
    maxTokens: 4000,
    systemPrompt:
      'You are a creative writing assistant. Help users with storytelling, character development, plot ideas, and creative expression. Be imaginative and inspiring while maintaining narrative coherence.',
    agentType: 'local',
  },
  {
    id: '4',
    name: 'Business Analyst',
    persona: 'professional',
    responseLength: 'detailed',
    temperature: 0.4,
    topP: 0.8,
    maxTokens: 2500,
    systemPrompt:
      'You are a professional business analyst. Provide strategic insights, market analysis, and business recommendations. Focus on data-driven decisions and practical solutions.',
    agentType: 'local',
  },
  {
    id: '5',
    name: 'Casual Buddy',
    persona: 'casual',
    responseLength: 'short',
    temperature: 0.8,
    topP: 1.0,
    maxTokens: 1500,
    systemPrompt:
      'You are a friendly, casual conversation partner. Keep responses relaxed and conversational. Use a warm, approachable tone and feel free to use everyday language.',
    agentType: 'local',
  },
  {
    id: '6',
    name: 'Technical Tutor',
    persona: 'helpful',
    responseLength: 'detailed',
    temperature: 0.5,
    topP: 0.9,
    maxTokens: 3500,
    systemPrompt:
      'You are a patient technical tutor. Explain complex concepts in simple terms, provide step-by-step guidance, and encourage learning. Break down difficult topics into manageable parts.',
    agentType: 'local',
  },
];

export const useAgentStore = create<AgentState>()(
  persist(
    devtools((set) => ({
      agents: defaultAgents,
      activeAgentId: defaultAgents[0].id,
      addAgent: (agent) =>
        set((state) => ({ agents: [...state.agents, agent] })),
      updateAgent: (agent) =>
        set((state) => ({
          agents: state.agents.map((a) => (a.id === agent.id ? agent : a)),
        })),
      deleteAgent: (id) =>
        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id),
        })),
      setActiveAgent: (id) => set(() => ({ activeAgentId: id })),
      reset: () =>
        set({ agents: defaultAgents, activeAgentId: defaultAgents[0].id }),
    })),
    {
      name: 'agent-storage',
    },
  ),
);
