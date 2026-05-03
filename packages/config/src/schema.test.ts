import { describe, expect, it } from "vitest";

import { parseCliConfig } from "./schema.js";

describe("parseCliConfig", () => {
  it("accepts the reference config shape", () => {
    const config = parseCliConfig({
      activeProvider: "openrouter",
      activeModel: "openai/gpt-4o",
      providers: {
        openrouter: {
          auth: [{ type: "apiKey", apiKey: "sk-test", authScheme: "bearer" }],
          currentAuth: "apiKey",
          defaultModel: "openai/gpt-4o",
          smallModel: "openai/gpt-4o-mini",
          baseUrl: "https://openrouter.ai/api/v1",
          surface: "openai-chat-completions",
          models: true,
          customHeaders: { "HTTP-Referer": "https://example.test" },
        },
      },
      mcp: {
        servers: {
          filesystem: {
            command: "npx",
            args: ["@modelcontextprotocol/server-filesystem", "."],
            env: { TEST: "1" },
            enabled: true,
            timeoutMs: 120000,
          },
        },
        allowedTools: { filesystem: { read_file: true } },
      },
      skills: { enabled: true, directories: ["/tmp/skills"], exclude: ["draft"] },
      agents: {
        enabled: true,
        includeDefaults: true,
        directories: ["./team-agents"],
      },
      skillsEnabled: { local: true },
      memory: {
        version: 2,
        enabled: true,
        saveTool: true,
        retrieval: {
          engine: "bm25",
          candidateLimit: 20,
          activeCandidateLimit: 5,
          activeEnabled: true,
          maxQueriesPerTurn: 2,
          coreInjectTokenBudget: 250,
          injectTokenBudget: 1200,
          minScore: 0.15,
          freshnessHalfLifeDays: 30,
        },
        extraction: {
          enabled: true,
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          sensitiveFilter: true,
        },
        index: { persisted: true, flushIntervalMs: 1000 },
      },
      session: { memPersist: true, persistEventLog: true, persistHttpLog: false },
      requireToolApproval: true,
      thinking: "MEDIUM",
      streamingChunks: true,
      agentsEnabled: { coder: true },
      recentModels: [{ provider: "openrouter", model: "openai/gpt-4o", usedAt: 1 }],
      lsp: { enabled: true, servers: { tsserver: { disabled: false } } },
      ui: {
        theme: {
          mode: "auto",
          colorLevel: "auto",
          backgrounds: "auto",
          messageStyle: "plain",
        },
        statusline: {
          rows: [
            ["model", "|", "tokens"],
            ["gitBranch", "|", "lsp"],
          ],
        },
      },
      tools: { webSearch: { googleCseKey: "k", googleCseCx: "cx" } },
      unknownFutureKey: { preserved: true },
    });

    expect(config.activeProvider).toBe("openrouter");
    expect(config.activeModel).toBe("openai/gpt-4o");
    expect(config.unknownFutureKey).toEqual({ preserved: true });
    expect(config.providers?.openrouter?.surface).toBe("openai-chat-completions");
    expect(config.providers?.openrouter?.auth?.[0]?.authScheme).toBe("bearer");
    expect(config.agents?.directories).toEqual(["./team-agents"]);
  });
});
