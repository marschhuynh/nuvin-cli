import { z } from "zod";

import type { CLIConfig } from "./types.js";

const chatModelAuthSchemeSchema = z.enum(["bearer", "x-api-key"]);

const apiKeyAuthSchema = z
  .object({
    type: z.literal("apiKey"),
    apiKey: z.string(),
    authScheme: chatModelAuthSchemeSchema.optional(),
  })
  .passthrough();

const oauthAuthSchema = z
  .object({
    type: z.literal("oauth"),
    access: z.string(),
    refresh: z.string(),
    expires: z.number().optional(),
    authScheme: chatModelAuthSchemeSchema.optional(),
  })
  .passthrough();

const authMethodSchema = z.union([apiKeyAuthSchema, oauthAuthSchema]);

const modelDefinitionSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
  })
  .passthrough();

const modelConfigSchema = z.union([
  z.literal(false),
  z.literal(true),
  z.string(),
  z.array(z.string()),
  z.array(modelDefinitionSchema),
]);

const chatModelSurfaceSchema = z.enum([
  "anthropic-messages",
  "openai-chat-completions",
  "openai-responses",
  "openai-responses-ws",
]);

const providerConfigSchema = z
  .object({
    apiKey: z.string().optional(),
    token: z.string().optional(),
    defaultModel: z.string().optional(),
    smallModel: z.string().optional(),
    currentAuth: z.string().optional(),
    auth: z.array(authMethodSchema).optional(),
    surface: chatModelSurfaceSchema.optional(),
    baseUrl: z.string().optional(),
    models: modelConfigSchema.optional(),
    customHeaders: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

const mcpServerConfigSchema = z
  .object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    transport: z.enum(["stdio", "http"]).optional(),
    url: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    prefix: z.string().optional(),
    timeoutMs: z.number().optional(),
    enabled: z.boolean().optional(),
    auth: z
      .object({
        type: z.enum(["none", "bearer", "oauth"]),
        token: z.string().optional(),
        oauth: z
          .object({
            clientId: z.string().optional(),
            clientMetadataUrl: z.string().optional(),
            authorizationServer: z.string().optional(),
            scopes: z.array(z.string()).optional(),
            tokenStorageKey: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const mcpSettingsSchema = z
  .object({
    servers: z.record(z.string(), mcpServerConfigSchema).optional(),
    allowedTools: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
    defaultTimeoutMs: z.number().optional(),
  })
  .passthrough();

const skillsSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    directories: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  })
  .passthrough();

const agentsSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    includeDefaults: z.boolean().optional(),
    directories: z.array(z.string()).optional(),
  })
  .passthrough();

const uiThemeSettingsSchema = z
  .object({
    mode: z.enum(["auto", "dark", "light"]).optional(),
    colorLevel: z.enum(["auto", "none", "ansi16", "ansi256", "truecolor"]).optional(),
    backgrounds: z.enum(["auto", "on", "off"]).optional(),
    messageStyle: z.enum(["plain", "boxed"]).optional(),
  })
  .passthrough();

const statuslineSegmentSchema = z.enum([
  "model",
  "session",
  "thinking",
  "sudo",
  "tokens",
  "context",
  "cached",
  "requests",
  "tools",
  "cost",
  "lsp",
  "gitBranch",
  "keybindings",
  "memory",
  "rss",
]);

const statuslineItemSchema = z.union([statuslineSegmentSchema, z.literal("|")]);
const statuslineRowSchema = z.array(statuslineItemSchema);

const statuslineConfigSchema = z
  .object({
    rows: z.tuple([statuslineRowSchema, statuslineRowSchema]).optional(),
  })
  .passthrough();

const memorySettingsSchema = z
  .object({
    version: z.literal(2).optional(),
    retrieval: z
      .object({
        engine: z.literal("bm25").optional(),
        candidateLimit: z.number().optional(),
        activeCandidateLimit: z.number().optional(),
        activeEnabled: z.boolean().optional(),
        maxQueriesPerTurn: z.number().optional(),
        coreInjectTokenBudget: z.number().optional(),
        injectTokenBudget: z.number().optional(),
        minScore: z.number().optional(),
        freshnessHalfLifeDays: z.number().optional(),
      })
      .passthrough()
      .optional(),
    extraction: z
      .object({
        enabled: z.boolean().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
        sensitiveFilter: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    index: z
      .object({
        persisted: z.boolean().optional(),
        flushIntervalMs: z.number().optional(),
      })
      .passthrough()
      .optional(),
    enabled: z.boolean().optional(),
    saveTool: z.boolean().optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
    maxInjectionTokens: z.number().optional(),
    backgroundExtraction: z.boolean().optional(),
  })
  .passthrough();

const recentModelSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    usedAt: z.number(),
  })
  .passthrough();

const lspServerEntrySchema = z
  .object({
    disabled: z.boolean().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    rootMarkers: z.array(z.string()).optional(),
  })
  .passthrough();

const lspConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    servers: z.record(z.string(), lspServerEntrySchema).optional(),
  })
  .passthrough();

export const cliConfigSchema = z
  .object({
    activeProvider: z.string().optional(),
    activeModel: z.string().optional(),
    apiKey: z.string().optional(),
    providers: z.record(z.string(), providerConfigSchema).optional(),
    mcp: mcpSettingsSchema.optional(),
    skills: skillsSettingsSchema.optional(),
    agents: agentsSettingsSchema.optional(),
    skillsEnabled: z.record(z.string(), z.boolean()).optional(),
    memory: memorySettingsSchema.optional(),
    session: z
      .object({
        memPersist: z.boolean().optional(),
        persistEventLog: z.boolean().optional(),
        persistHttpLog: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    requireToolApproval: z.boolean().optional(),
    thinking: z.enum(["OFF", "LOW", "MEDIUM", "HIGH"]).optional(),
    streamingChunks: z.boolean().optional(),
    agentsEnabled: z.record(z.string(), z.boolean()).optional(),
    recentModels: z.array(recentModelSchema).optional(),
    lsp: lspConfigSchema.optional(),
    ui: z
      .object({
        theme: uiThemeSettingsSchema.optional(),
        statusline: statuslineConfigSchema.optional(),
      })
      .passthrough()
      .optional(),
    tools: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export function parseCliConfig(input: unknown): CLIConfig {
  return cliConfigSchema.parse(input) as CLIConfig;
}

export type SafeParseResult =
  | { success: true; data: CLIConfig }
  | { success: false; error: z.ZodError };

export function safeParseCliConfig(input: unknown): SafeParseResult {
  const result = cliConfigSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as CLIConfig };
  }
  return { success: false, error: result.error };
}
