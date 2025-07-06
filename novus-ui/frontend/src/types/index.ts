export interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface Conversation {
  id: number;
  title: string;
  timestamp: string;
  active?: boolean;
}

export interface ModelConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  systemPrompt: string;
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  enabled: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: AgentTool[];
  status: 'active' | 'inactive' | 'busy';
  lastUsed?: string;
}

export interface AgentConfig {
  selectedAgent: string;
  agents: AgentSettings[];
}

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
}

export interface AgentSettings {
  id: string;
  name: string;
  persona: 'helpful' | 'professional' | 'creative' | 'analytical' | 'casual';
  responseLength: 'short' | 'medium' | 'long' | 'detailed';
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  agentType: 'local' | 'remote';
  modelConfig: ModelConfig;
  // Optional properties to make it compatible with Agent interface where needed
  description?: string;
  tools?: AgentTool[];
  status?: 'active' | 'inactive' | 'busy';
  lastUsed?: string;
}
