import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AgentSettings } from '@/types'

interface AgentState {
  agents: AgentSettings[]
  activeAgentId: string
  addAgent: (agent: AgentSettings) => void
  updateAgent: (agent: AgentSettings) => void
  deleteAgent: (id: string) => void
  setActiveAgent: (id: string) => void
  reset: () => void
}

const defaultAgents: AgentSettings[] = [
  {
    id: '1',
    name: 'General Assistant',
    persona: 'helpful',
    responseLength: 'medium',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.',
    agentType: 'local',
    modelConfig: {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.'
    }
  },
  {
    id: '2',
    name: 'Code Reviewer',
    persona: 'analytical',
    responseLength: 'detailed',
    temperature: 0.3,
    maxTokens: 3000,
    systemPrompt: 'You are a senior software engineer specializing in code reviews. Analyze code for best practices, potential bugs, security issues, and suggest improvements. Be thorough and constructive in your feedback.',
    agentType: 'local',
    modelConfig: {
      model: 'gpt-3.5-turbo',
      temperature: 0.3,
      maxTokens: 3000,
      topP: 1,
      systemPrompt: 'You are a senior software engineer specializing in code reviews. Analyze code for best practices, potential bugs, security issues, and suggest improvements. Be thorough and constructive in your feedback.'
    }
  },
  {
    id: '3',
    name: 'Creative Writer',
    persona: 'creative',
    responseLength: 'long',
    temperature: 1.2,
    maxTokens: 4000,
    systemPrompt: 'You are a creative writing assistant. Help users with storytelling, character development, plot ideas, and creative expression. Be imaginative and inspiring while maintaining narrative coherence.',
    agentType: 'local',
    modelConfig: {
      model: 'gpt-3.5-turbo',
      temperature: 1.2,
      maxTokens: 4000,
      topP: 1,
      systemPrompt: 'You are a creative writing assistant. Help users with storytelling, character development, plot ideas, and creative expression. Be imaginative and inspiring while maintaining narrative coherence.'
    }
  },
  {
    id: '4',
    name: 'Business Analyst',
    persona: 'professional',
    responseLength: 'detailed',
    temperature: 0.4,
    maxTokens: 2500,
    systemPrompt: 'You are a professional business analyst. Provide strategic insights, market analysis, and business recommendations. Focus on data-driven decisions and practical solutions.',
    agentType: 'local',
    modelConfig: {
      model: 'gpt-3.5-turbo',
      temperature: 0.4,
      maxTokens: 2500,
      topP: 1,
      systemPrompt: 'You are a professional business analyst. Provide strategic insights, market analysis, and business recommendations. Focus on data-driven decisions and practical solutions.'
    }
  },
  {
    id: '5',
    name: 'Casual Buddy',
    persona: 'casual',
    responseLength: 'short',
    temperature: 0.8,
    maxTokens: 1500,
    systemPrompt: 'You are a friendly, casual conversation partner. Keep responses relaxed and conversational. Use a warm, approachable tone and feel free to use everyday language.',
    agentType: 'local',
    modelConfig: {
      model: 'gpt-3.5-turbo',
      temperature: 0.8,
      maxTokens: 1500,
      topP: 1,
      systemPrompt: 'You are a friendly, casual conversation partner. Keep responses relaxed and conversational. Use a warm, approachable tone and feel free to use everyday language.'
    }
  },
  {
    id: '6',
    name: 'Technical Tutor',
    persona: 'helpful',
    responseLength: 'detailed',
    temperature: 0.5,
    maxTokens: 3500,
    systemPrompt: 'You are a patient technical tutor. Explain complex concepts in simple terms, provide step-by-step guidance, and encourage learning. Break down difficult topics into manageable parts.',
    agentType: 'local',
    modelConfig: {
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
      maxTokens: 3500,
      topP: 1,
      systemPrompt: 'You are a patient technical tutor. Explain complex concepts in simple terms, provide step-by-step guidance, and encourage learning. Break down difficult topics into manageable parts.'
    }
  }
]

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      agents: defaultAgents,
      activeAgentId: defaultAgents[0].id,
      addAgent: (agent) =>
        set((state) => ({ agents: [...state.agents, agent] })),
      updateAgent: (agent) =>
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agent.id ? agent : a
          )
        })),
      deleteAgent: (id) =>
        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id)
        })),
      setActiveAgent: (id) =>
        set(() => ({ activeAgentId: id })),
      reset: () => set({ agents: defaultAgents, activeAgentId: defaultAgents[0].id })
    }),
    {
      name: 'agent-storage'
    }
  )
)
