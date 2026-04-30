import { delimiter } from "node:path";
import { describe, expect, it } from "vitest";

import { loadEnvConfig, resolveConfigDirName } from "./env.js";

describe("loadEnvConfig", () => {
  it("maps provider api key environment variables into provider auth config", () => {
    expect(
      loadEnvConfig({
        OPENROUTER_API_KEY: "or",
        ANTHROPIC_API_KEY: "ant",
        GITHUB_ACCESS_TOKEN: "gh",
        DEEPINFRA_API_KEY: "deep",
        ZAI_API_KEY: "zai",
        MOONSHOT_API_KEY: "moon",
        MINIMAX_API_KEY: "mini",
        KIMI_API_KEY: "kimi",
      }),
    ).toMatchObject({
      providers: {
        openrouter: { auth: [{ type: "apiKey", apiKey: "or" }], currentAuth: "apiKey" },
        anthropic: { auth: [{ type: "apiKey", apiKey: "ant" }], currentAuth: "apiKey" },
        github: { auth: [{ type: "apiKey", apiKey: "gh" }], currentAuth: "apiKey" },
        deepinfra: { auth: [{ type: "apiKey", apiKey: "deep" }], currentAuth: "apiKey" },
        zai: { auth: [{ type: "apiKey", apiKey: "zai" }], currentAuth: "apiKey" },
        moonshot: { auth: [{ type: "apiKey", apiKey: "moon" }], currentAuth: "apiKey" },
        minimax: { auth: [{ type: "apiKey", apiKey: "mini" }], currentAuth: "apiKey" },
        kimi: { auth: [{ type: "apiKey", apiKey: "kimi" }], currentAuth: "apiKey" },
      },
    });
  });

  it("maps API_KEY and MODEL onto top-level apiKey + activeModel", () => {
    expect(
      loadEnvConfig({
        API_KEY: "top-key",
        MODEL: "glm-4.7",
      }),
    ).toMatchObject({
      apiKey: "top-key",
      activeModel: "glm-4.7",
    });
  });

  it("maps theme env into ui.theme", () => {
    expect(
      loadEnvConfig({
        NUVIN_THEME_MODE: "light",
        NUVIN_THEME_BACKGROUNDS: "off",
        NUVIN_MESSAGE_STYLE: "plain",
      }),
    ).toMatchObject({
      ui: { theme: { mode: "light", backgrounds: "off", messageStyle: "plain" } },
    });
  });

  it("splits NUVIN_SKILLS_PATH using path.delimiter", () => {
    const path = ["/a/b", "/c/d"].join(delimiter);
    expect(loadEnvConfig({ NUVIN_SKILLS_PATH: path })).toMatchObject({
      skills: { directories: ["/a/b", "/c/d"] },
    });
  });

  it("disables lsp when NUVIN_DISABLE_LSP is truthy", () => {
    expect(loadEnvConfig({ NUVIN_DISABLE_LSP: "true" })).toMatchObject({
      lsp: { enabled: false },
    });
    expect(loadEnvConfig({ NUVIN_DISABLE_LSP: "0" })).not.toHaveProperty("lsp");
  });

  it("resolves the config directory name from NUVIN_CONFIG_DIR_NAME", () => {
    expect(resolveConfigDirName({ NUVIN_CONFIG_DIR_NAME: ".nuvin-dev" })).toBe(".nuvin-dev");
    expect(resolveConfigDirName({})).toBe(".nuvin");
  });

  it("preserves Google CSE tool env passthrough", () => {
    const config = loadEnvConfig({
      GOOGLE_CSE_KEY: "k1",
      GOOGLE_CSE_CX: "cx1",
    }) as Record<string, unknown>;
    expect(config.tools).toEqual({ webSearch: { googleCseKey: "k1", googleCseCx: "cx1" } });
  });

  it("trims empty strings to undefined", () => {
    const config = loadEnvConfig({
      API_KEY: "   ",
      MODEL: "",
    });
    expect(config.apiKey).toBeUndefined();
    expect(config.activeModel).toBeUndefined();
  });
});
