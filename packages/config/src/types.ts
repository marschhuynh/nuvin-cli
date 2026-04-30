export const THINKING_LEVELS = {
  OFF: "OFF",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[keyof typeof THINKING_LEVELS];

export type ApiKeyAuth = {
  type: "apiKey";
  apiKey: string;
  authScheme?: ChatModelAuthScheme;
};
export type OAuthAuth = {
  type: "oauth";
  access: string;
  refresh: string;
  expires?: number;
  authScheme?: ChatModelAuthScheme;
};
export type AuthMethod = ApiKeyAuth | OAuthAuth;

export interface ModelDefinition {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export type ModelConfig = false | true | string | string[] | ModelDefinition[];

export interface ProviderConfig {
  apiKey?: string;
  token?: string;
  defaultModel?: string;
  smallModel?: string;
  currentAuth?: string;
  auth?: AuthMethod[];
  surface?: ChatModelSurface;
  baseUrl?: string;
  models?: ModelConfig;
  customHeaders?: Record<string, string>;
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
  type: "none" | "bearer" | "oauth";
  token?: string;
  oauth?: MCPOAuthConfig;
}

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: "stdio" | "http";
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
  enabled?: boolean;
  directories?: string[];
  exclude?: string[];
}

export interface AgentsSettings {
  enabled?: boolean;
  includeDefaults?: boolean;
  directories?: string[];
}

export type AgentDefinitionSourceScope =
  | "builtin"
  | "direct"
  | "env"
  | "explicit"
  | "global"
  | "local"
  | "profile";

export interface AgentDefinitionSource {
  scope: AgentDefinitionSourceScope;
  path: string;
  directory?: string;
  kind?: "custom" | "default";
}

export interface AgentDefinitionReference {
  id: string;
  name: string;
  description: string;
  enabled?: boolean;
  model?: string;
  tools?: string[];
  source: AgentDefinitionSource;
}

export interface SerializedAgentDefinition extends AgentDefinitionReference {
  systemPrompt: string;
}

export interface AgentDirectorySource {
  scope: AgentDefinitionSourceScope;
  path: string;
  kind: "custom" | "default";
  sourcePath?: string;
}

export interface UIThemeSettings {
  mode?: "auto" | "dark" | "light";
  colorLevel?: "auto" | "none" | "ansi16" | "ansi256" | "truecolor";
  backgrounds?: "auto" | "on" | "off";
  messageStyle?: "plain" | "boxed";
}

export type StatuslineSegment =
  | "model"
  | "session"
  | "thinking"
  | "sudo"
  | "tokens"
  | "context"
  | "cached"
  | "requests"
  | "tools"
  | "cost"
  | "lsp"
  | "gitBranch"
  | "keybindings"
  | "memory"
  | "rss";

export type StatuslineRow = (StatuslineSegment | "|")[];

export interface StatuslineConfig {
  rows?: [StatuslineRow, StatuslineRow];
}

export interface MemorySettings {
  version?: 2;
  retrieval?: {
    engine?: "bm25";
    candidateLimit?: number;
    activeCandidateLimit?: number;
    activeEnabled?: boolean;
    maxQueriesPerTurn?: number;
    coreInjectTokenBudget?: number;
    injectTokenBudget?: number;
    minScore?: number;
    freshnessHalfLifeDays?: number;
  };
  extraction?: {
    enabled?: boolean;
    provider?: string;
    model?: string;
    sensitiveFilter?: boolean;
  };
  index?: {
    persisted?: boolean;
    flushIntervalMs?: number;
  };
  enabled?: boolean;
  saveTool?: boolean;
  model?: string;
  provider?: string;
  maxInjectionTokens?: number;
  backgroundExtraction?: boolean;
}

export interface RecentModel {
  provider: string;
  model: string;
  usedAt: number;
}

export interface LSPServerEntry {
  disabled?: boolean;
  command?: string;
  args?: string[];
  rootMarkers?: string[];
  [key: string]: unknown;
}

export interface LSPConfig {
  enabled?: boolean;
  servers?: Record<string, LSPServerEntry>;
}

export type ChatModelSurface =
  | "anthropic-messages"
  | "openai-chat-completions"
  | "openai-responses"
  | "openai-responses-ws";

export type ChatModelAuthScheme = "bearer" | "x-api-key";

export interface CLIConfig {
  activeProvider?: string;
  activeModel?: string;
  apiKey?: string;
  providers?: Record<string, ProviderConfig>;
  mcp?: MCPSettings;
  skills?: SkillsSettings;
  agents?: AgentsSettings;
  skillsEnabled?: Record<string, boolean>;
  memory?: MemorySettings;
  session?: {
    memPersist?: boolean;
    persistEventLog?: boolean;
    persistHttpLog?: boolean;
  };
  requireToolApproval?: boolean;
  thinking?: ThinkingLevel;
  streamingChunks?: boolean;
  agentsEnabled?: Record<string, boolean>;
  recentModels?: RecentModel[];
  lsp?: LSPConfig;
  ui?: {
    theme?: UIThemeSettings;
    statusline?: StatuslineConfig;
  };
  tools?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ConfigScope = "global" | "local" | "explicit" | "env" | "direct";
export type ConfigFormat = "json" | "yaml";

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

export interface ConfigChangeEvent {
  config: CLIConfig;
  changedScopes: ConfigScope[];
}

export type ConfigChangeListener = (event: ConfigChangeEvent) => void;
