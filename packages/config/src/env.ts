import { delimiter } from "node:path";

import { normalizeConfigDirName } from "./constants.js";
import type { CLIConfig, ProviderConfig, UIThemeSettings } from "./types.js";

const PROVIDER_API_KEY_ENVS: Array<{ env: string; provider: string }> = [
  { env: "OPENROUTER_API_KEY", provider: "openrouter" },
  { env: "ANTHROPIC_API_KEY", provider: "anthropic" },
  { env: "GITHUB_ACCESS_TOKEN", provider: "github" },
  { env: "GITHUB_TOKEN", provider: "github" },
  { env: "DEEPINFRA_API_KEY", provider: "deepinfra" },
  { env: "ZAI_API_KEY", provider: "zai" },
  { env: "MOONSHOT_API_KEY", provider: "moonshot" },
  { env: "MINIMAX_API_KEY", provider: "minimax" },
  { env: "KIMI_API_KEY", provider: "kimi" },
  { env: "OPENAI_API_KEY", provider: "openai" },
];

function trimOrUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  const trimmed = trimOrUndefined(value);
  if (!trimmed) return undefined;
  if (/^(1|true|yes|on)$/i.test(trimmed)) return true;
  if (/^(0|false|no|off)$/i.test(trimmed)) return false;
  return undefined;
}

export function resolveConfigDirName(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeConfigDirName(trimOrUndefined(env.NUVIN_CONFIG_DIR_NAME));
}

export function loadEnvConfig(env: NodeJS.ProcessEnv = process.env): Partial<CLIConfig> {
  const config: Partial<CLIConfig> = {};
  const providers: Record<string, ProviderConfig> = {};

  for (const { env: name, provider } of PROVIDER_API_KEY_ENVS) {
    const value = trimOrUndefined(env[name]);
    if (!value) continue;
    if (providers[provider]) continue;
    providers[provider] = {
      auth: [{ type: "apiKey", apiKey: value }],
      currentAuth: "apiKey",
    };
  }

  if (Object.keys(providers).length > 0) {
    config.providers = providers;
  }

  const apiKey = trimOrUndefined(env.API_KEY);
  const model = trimOrUndefined(env.MODEL);

  if (apiKey) {
    config.apiKey = apiKey;
  }
  if (model) {
    config.activeModel = model;
  }

  const theme: UIThemeSettings = {};
  const themeMode = trimOrUndefined(env.NUVIN_THEME_MODE);
  if (themeMode === "auto" || themeMode === "dark" || themeMode === "light") {
    theme.mode = themeMode;
  }
  const themeBackgrounds = trimOrUndefined(env.NUVIN_THEME_BACKGROUNDS);
  if (themeBackgrounds === "auto" || themeBackgrounds === "on" || themeBackgrounds === "off") {
    theme.backgrounds = themeBackgrounds;
  }
  const messageStyle = trimOrUndefined(env.NUVIN_MESSAGE_STYLE);
  if (messageStyle === "plain" || messageStyle === "boxed") {
    theme.messageStyle = messageStyle;
  }
  if (Object.keys(theme).length > 0) {
    config.ui = { theme };
  }

  const skillsPath = trimOrUndefined(env.NUVIN_SKILLS_PATH);
  if (skillsPath) {
    const directories = skillsPath
      .split(delimiter)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (directories.length > 0) {
      config.skills = { ...(config.skills ?? {}), directories };
    }
  }

  const disableLsp = parseBoolean(env.NUVIN_DISABLE_LSP);
  if (disableLsp === true) {
    config.lsp = { ...(config.lsp ?? {}), enabled: false };
  }

  const cseKey = trimOrUndefined(env.GOOGLE_CSE_KEY);
  const cseCx = trimOrUndefined(env.GOOGLE_CSE_CX);
  if (cseKey || cseCx) {
    config.tools = {
      webSearch: {
        ...(cseKey ? { googleCseKey: cseKey } : {}),
        ...(cseCx ? { googleCseCx: cseCx } : {}),
      },
    };
  }

  return config;
}
