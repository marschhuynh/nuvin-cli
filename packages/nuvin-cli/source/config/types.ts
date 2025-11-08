import type { MCPConfig } from '@nuvin/nuvin-core';
import type { ProviderKey } from './const';

export const THINKING_LEVELS = {
  OFF: 'OFF',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[keyof typeof THINKING_LEVELS];

export type AuthMethod =
  | { type: 'api-key'; 'api-key': string }
  | { type: 'oauth'; access: string; refresh: string; expires?: number };

export interface ProviderConfig {
  /** API key or access token for the provider (legacy) */
  apiKey?: string;
  /** Alias for apiKey to support different naming conventions (legacy) */
  token?: string;
  /** Provider-specific model override */
  model?: string;
  /** Default model to use when this provider is active */
  defaultModel?: string;
  /** Current active auth method type */
  'current-auth'?: string;
  /** Array of authentication methods */
  auth?: AuthMethod[];
  /** OAuth configuration (legacy) */
  oauth?: {
    type?: string;
    access?: string;
    refresh?: string;
    expires?: number;
  };
  /** Arbitrary provider-specific extras */
  [key: string]: unknown;
}

export interface CLIConfig {
  /** Currently active provider */
  activeProvider?: ProviderKey;

  /** Explicit model override */
  model?: string;
  /** Provider-specific configuration */
  providers?: Record<string, ProviderConfig>;
  /** Loose map of provider tokens (provider -> token) */
  tokens?: Record<string, string>;
  /** General API key fallback */
  apiKey?: string;
  /** MCP configuration (embedded definition or path) */
  mcp?: {
    configPath?: string;
    servers?: MCPConfig['mcpServers'];
  };
  /** Session persistence options */
  session?: {
    memPersist?: boolean;
    persistEventLog?: boolean;
    persistHttpLog?: boolean;
  };
  /** Require manual approval before tool execution */
  requireToolApproval?: boolean;
  /** Thinking display and reasoning effort: OFF | LOW | MEDIUM | HIGH */
  thinking?: ThinkingLevel;
  /** Enable streaming chunks display (show response as it arrives) */
  streamingChunks?: boolean;
  /** MCP server tool allowlist (serverId -> toolName -> allowed) */
  mcpAllowedTools?: Record<string, Record<string, boolean>>;
  /** Path to MCP config file (legacy/deprecated - use mcp.configPath) */
  mcpConfigPath?: string;
  /** Enabled specialist agents (agentId -> enabled) */
  agentsEnabled?: Record<string, boolean>;
  /** Allow additional custom keys */
  [key: string]: unknown;
}

export type ConfigScope = 'global' | 'local' | 'explicit' | 'env' | 'direct';
export type ConfigFormat = 'json' | 'yaml';

export interface ConfigSource {
  scope: ConfigScope;
  path: string;
  format: ConfigFormat;
  data: CLIConfig;
}

export interface ConfigLoadOptions {
  explicitPath?: string;
  cwd?: string;
}

export interface ConfigLoadResult {
  config: CLIConfig;
  sources: ConfigSource[];
}
