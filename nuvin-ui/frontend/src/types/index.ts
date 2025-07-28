// Import tool configuration from tools module
import type { PROVIDER_TYPES } from '@/lib/providers/provider-utils';
import type { AgentToolConfig } from './tools';

export interface MessageMetadata {
  model?: string;
  provider?: string;
  agentType?: 'local' | 'remote';
  agentId?: string;
  // Token usage
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  // Cost and performance
  estimatedCost?: number;
  responseTime?: number;
  // Task and tool tracking
  taskId?: string;
  toolCalls?: number;
  // OpenRouter specific metadata
  generationId?: string;
  moderationResults?: any;
  // Provider specific data
  providerMetadata?: Record<string, any>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  metadata?: MessageMetadata;
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
  type: PROVIDER_TYPES; // Provider type (OpenAI, Anthropic, GitHub, etc.)
  apiKey: string;
  apiUrl?: string;
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
  // Tool configuration
  toolConfig?: AgentToolConfig;
  // Optional properties to make it compatible with Agent interface where needed
  description?: string;
  tools?: AgentTool[];
  status?: 'active' | 'inactive' | 'busy';
  lastUsed?: string;
}

// Todo item interface
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  createdAt?: string;
  updatedAt?: string;
  conversationId?: string; // Optional: associate with a conversation
}

// Todo list summary statistics
export interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
}
