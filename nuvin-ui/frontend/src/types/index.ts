export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface Conversation {
  id: string;
  title: string;
  timestamp: string;
  active?: boolean;
  summary?: string;
}

export interface ModelConfig {
  model: string;
  maxTokens: number;
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
  name: string; // Custom name for the provider instance
  type: string; // Provider type (OpenAI, Anthropic, GitHub, etc.)
  apiKey: string;
  activeModel: ModelConfig;
}

export interface AgentSettings {
  id: string;
  name: string;
  persona: 'helpful' | 'professional' | 'creative' | 'analytical' | 'casual';
  responseLength: 'short' | 'medium' | 'long' | 'detailed';
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string;
  agentType: 'local' | 'remote';
  url?: string; // URL for remote A2A agents
  // Authentication for remote A2A agents
  auth?: {
    type: 'bearer' | 'apikey' | 'basic' | 'none';
    token?: string; // For bearer tokens or API keys
    username?: string; // For basic auth
    password?: string; // For basic auth
    headerName?: string; // Custom header name for API keys (default: 'Authorization')
  };
  // Optional properties to make it compatible with Agent interface where needed
  description?: string;
  tools?: AgentTool[];
  status?: 'active' | 'inactive' | 'busy';
  lastUsed?: string;
}
