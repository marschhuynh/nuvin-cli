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

export interface ModelDefinition {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export type ModelConfig = false | true | string | string[] | ModelDefinition[];

export interface ProviderConfig {
  /** API key or access token for the provider (legacy) */
  apiKey?: string;
  /** Alias for apiKey to support different naming conventions (legacy) */
  token?: string;
  /** Provider-specific model override */
  model?: string;
  /** Default model to use when this provider is active */
  defaultModel?: string;
  /** Small/cheap model for utility tasks (topic generation, summaries) */
  smallModel?: string;
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
  /** Provider type (openai-compat, anthropic-compat, or openai-response-compat) */
  type?: 'openai-compat' | 'anthropic-compat' | 'openai-response-compat';
  /** Custom base URL for the provider */
  baseUrl?: string;
  /** Model configuration (false, true, endpoint path, or model list) */
  models?: ModelConfig;
  /** Custom HTTP headers to send with every request */
  customHeaders?: Record<string, string>;
  /** Arbitrary provider-specific extras */
  [key: string]: unknown;
}

export interface MCPOAuthConfig {
  clientId?: string;
  clientMetadataUrl?: string;
  authorizationServer?: string;
  scopes?: string[];
  tokenStorageKey?: string;
}

export interface MCPAuthConfig {
  type: 'none' | 'bearer' | 'oauth';
  token?: string;
  oauth?: MCPOAuthConfig;
}

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
  url?: string;
  headers?: Record<string, string>;
  prefix?: string;
  timeoutMs?: number;
  enabled?: boolean;
  auth?: MCPAuthConfig;
}

export interface MCPSettings {
  servers?: Record<string, MCPServerConfig>;
  allowedTools?: Record<string, Record<string, boolean>>;
  defaultTimeoutMs?: number;
}

export interface SkillsSettings {
  /** Enable/disable skills feature (default: true) */
  enabled?: boolean;
  /** Additional directories to search for skills */
  directories?: string[];
  /** Skill names to exclude */
  exclude?: string[];
  /** Per-skill permission: 'allow' | 'ask' | 'deny' */
  permissions?: Record<string, 'allow' | 'ask' | 'deny'>;
}

export interface UIThemeSettings {
  /** Theme mode selection */
  mode?: 'auto' | 'dark' | 'light';
  /** Terminal color level strategy */
  colorLevel?: 'auto' | 'none' | 'ansi16' | 'ansi256' | 'truecolor';
  /** Background coloring strategy */
  backgrounds?: 'auto' | 'on' | 'off';
}

export type StatuslineSegment =
  | 'model'
  | 'session'
  | 'thinking'
  | 'sudo'
  | 'tokens'
  | 'context'
  | 'cached'
  | 'requests'
  | 'tools'
  | 'cost'
  | 'lsp'
  | 'gitBranch'
  | 'keybindings';

/** A row of statusline items. '|' is a separator dividing left-aligned from right-aligned segments. */
export type StatuslineRow = (StatuslineSegment | '|')[];

export interface StatuslineConfig {
  /** Two rows of statusline items. '|' separates left from right within each row.
   * Segments not listed in either row are hidden. */
  rows?: [StatuslineRow, StatuslineRow];
}

export interface MemorySettings {
  /** Enable/disable long-term memory (default: true) */
  enabled?: boolean;
  /** Maximum tokens to inject from memory into system prompt (default: 2000) */
  maxInjectionTokens?: number;
  /** Enable background memory extraction after each turn (default: true) */
  backgroundExtraction?: boolean;
  /** Enable the memory_save tool for explicit agent memory creation (default: true) */
  saveTool?: boolean;
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
  /** MCP configuration */
  mcp?: MCPSettings;
  /** Skills configuration */
  skills?: SkillsSettings;
  /** Long-term memory configuration */
  memory?: MemorySettings;
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
  /** Enabled specialist agents (agentId -> enabled) */
  agentsEnabled?: Record<string, boolean>;
  /** UI customization options */
  ui?: {
    theme?: UIThemeSettings;
    statusline?: StatuslineConfig;
  };
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
  profile?: string;
}

export interface ConfigLoadResult {
  config: CLIConfig;
  sources: ConfigSource[];
}
