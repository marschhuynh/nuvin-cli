#!/usr/bin/env node
import { render } from 'ink';
import meow from 'meow';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { MCPConfig } from '@nuvin/nuvin-core';
import type { AuthMethod } from './config/types.js';
import App from './app.js';
import { NotificationProvider } from './contexts/NotificationContext.js';
import { ToolApprovalProvider } from './contexts/ToolApprovalContext.js';
import { CommandProvider } from './modules/commands/provider.js';
import { registerCommands } from './modules/commands/definitions/index.js';
import { ConfigProvider } from './contexts/ConfigContext.js';
import { ConfigBridge } from './components/ConfigBridge.js';
import { ThemeProvider } from './contexts/ThemeContext.js';
import { StdoutDimensionsProvider } from './contexts/StdoutDimensionsContext.js';
import { ExplainModeProvider } from './contexts/ExplainModeContext.js';

import { getVersionInfo } from './utils/version.js';
import {
  ConfigManager,
  resolveMCPDefinition,
  type CLIConfig,
  type ConfigSource,
  type ProviderKey,
} from './config/index.js';
import { ConfigCliHandler } from './config/cli-handler.js';
import { AutoUpdater } from './services/AutoUpdater.js';
import { StrictMode } from 'react';

process.stdout.write('\x1b[?2004h');

process.on('uncaughtException', (error) => {
  console.error('\n\n❌ Uncaught Exception:', error);
  console.error('The application will exit. Check for nuvin-crash-export-*.json files in the current directory.');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n\n❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  console.error('The application will exit. Check for nuvin-crash-export-*.json files in the current directory.');
  process.exit(1);
});

const nuvinCliDir = path.join(os.homedir(), '.nuvin-cli');
try {
  if (!fs.existsSync(nuvinCliDir)) {
    fs.mkdirSync(nuvinCliDir, { recursive: true });
  }
} catch (_error) {
  // console.warn(`Warning: Could not create nuvin-cli directory at ${nuvinCliDir}:`, error);
}

const cli = meow(
  `
  Nuvin

  Welcome to Nuvin! Transform your natural language requests into automated coding tasks
  with intelligent AI agent workflows. Build faster with your AI coding assistant.

  Usage
    $ nuvin-cli [options]
    $ nuvin-cli config <command> [options]
    $ nuvin-cli profile <command> [options]
    $ nuvin-cli --demo <path/to/history.json>

  Configuration Commands
    config get <key>            Get a configuration value
    config set <key> <value>    Set a configuration value
    config list                 List all configuration values
    config help                 Show config command help

  Profile Commands
    profile list                List all profiles
    profile create <name>       Create a new profile
    profile delete <name>       Delete a profile
    profile switch <name>       Switch active profile
    profile show                Show current profile info
    profile clone <src> <dst>   Clone an existing profile
    profile help                 Show profile command help

  Configuration Options
    --provider NAME     Choose AI provider: openrouter | deepinfra | github | zai | anthropic | echo
    --config PATH       Merge configuration from file (JSON or YAML)
    --model NAME        Specify model (e.g., gpt-4o, claude-sonnet-4-5)
    --api-key KEY       Your API key for authentication (OpenRouter, Zai)
    --mcp-config PATH   MCP servers configuration file (default: .nuvin_mcp.json)
    --reasoning-effort  Set reasoning effort for o1 models: low | medium | high (default: medium)
    --history PATH      Load conversation history from file on startup
    --profile NAME      Use specific profile (overrides active profile)

  Authentication Setup
    Environment variables are automatically detected and loaded at startup:
    • OPENROUTER_API_KEY - OpenRouter authentication
    • ANTHROPIC_API_KEY - Anthropic Claude authentication
    • ZAI_API_KEY - ZAI authentication
    • DEEPINFRA_API_KEY - DeepInfra authentication
    • GITHUB_ACCESS_TOKEN - GitHub Models authentication

    You can also use --api-key flag or config files for authentication.

  Configuration Examples
    $ nuvin-cli config set activeProvider openrouter --global
    $ nuvin-cli config set providers.github.token "ghp_xxxx" --local
    $ nuvin-cli config get activeProvider
    $ nuvin-cli config list

  What You Can Do
    • "Analyze my project structure and provide optimization recommendations"
    • "Review my recent git commits and suggest improvements"
    • "Find all TODO comments in my codebase and create issues"
    • "Set up automated testing for my codebase"
    • "Refactor this function to follow SOLID principles"

  Quick Start Examples
    $ nuvin-cli --provider openrouter --model openai/gpt-4o
    $ nuvin-cli --provider github
  `,
  {
    importMeta: import.meta,
    flags: {
      provider: { type: 'string' },
      config: { type: 'string' },
      model: { type: 'string' },
      mcpConfig: { type: 'string' },
      apiKey: { type: 'string' },
      reasoningEffort: { type: 'string' },
      version: { type: 'boolean', alias: 'v' },
      demo: { type: 'string' },
      history: { type: 'string' },
      profile: { type: 'string' },
    },
  },
);

(async () => {
  // Handle version flag early
  if (cli.flags.version) {
    const { version, commit } = getVersionInfo();
    console.log(`@nuvin/cli v${version} (${commit})`);
    process.exit(0);
  }

  // Check for updates and auto-upgrade if available (always enabled)
  await AutoUpdater.checkAndUpdate();

  const ensureString = (value: string | undefined): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const hasValidProviders = (config: Partial<CLIConfig>): boolean => {
    const providers = config.providers || {};
    return Object.values(providers).some(
      (p) => Array.isArray(p.auth) && p.auth.length > 0 && p.auth.some((a) => a.type === 'api-key' && a['api-key']),
    );
  };

  const processEnvironmentVariables = (): Partial<CLIConfig> => {
    const envConfig: Partial<CLIConfig> = {
      providers: {},
    };

    const openrouterKey = ensureString(process.env.OPENROUTER_API_KEY);
    if (openrouterKey && envConfig.providers) {
      envConfig.providers.openrouter = {
        auth: [{ type: 'api-key', 'api-key': openrouterKey }],
        'current-auth': 'api-key',
      };
    }

    const anthropicKey = ensureString(process.env.ANTHROPIC_API_KEY);
    if (anthropicKey && envConfig.providers) {
      envConfig.providers.anthropic = {
        auth: [{ type: 'api-key', 'api-key': anthropicKey }],
        'current-auth': 'api-key',
      };
    }

    const zaiKey = ensureString(process.env.ZAI_API_KEY);
    if (zaiKey && envConfig.providers) {
      envConfig.providers.zai = {
        auth: [{ type: 'api-key', 'api-key': zaiKey }],
        'current-auth': 'api-key',
      };
    }

    const deepinfraKey = ensureString(process.env.DEEPINFRA_API_KEY);
    if (deepinfraKey && envConfig.providers) {
      envConfig.providers.deepinfra = {
        auth: [{ type: 'api-key', 'api-key': deepinfraKey }],
        'current-auth': 'api-key',
      };
    }

    const githubToken = ensureString(process.env.GITHUB_ACCESS_TOKEN);
    if (githubToken && envConfig.providers) {
      envConfig.providers.github = {
        auth: [{ type: 'api-key', 'api-key': githubToken }],
        'current-auth': 'api-key',
      };
    }

    return envConfig;
  };

  // Handle demo mode early
  if (cli.flags.demo) {
    const demoPath = ensureString(cli.flags.demo);
    if (!demoPath) {
      console.error('Error: --demo requires a path to a history file');
      process.exit(1);
    }

    const { DemoMode } = await import('./demo-mode.js');
    const demoMode = new DemoMode(demoPath);
    await demoMode.run();
    process.exit(0);
  }

  // Handle config subcommand
  if (cli.input.length > 0 && cli.input[0] === 'config') {
    const configHandler = new ConfigCliHandler();
    // Pass the original process.argv instead of processed cli.input to preserve flags
    const configArgs = process.argv.slice(3); // Skip 'node', 'cli.js', 'config'
    await configHandler.handleConfigCommand(configArgs);
    process.exit(0);
  }

  // Handle profile subcommand
  if (cli.input.length > 0 && cli.input[0] === 'profile') {
    const { ProfileCliHandler } = await import('./config/profile-handler.js');
    const profileHandler = new ProfileCliHandler();
    // Pass the original process.argv instead of processed cli.input to preserve flags
    const profileArgs = process.argv.slice(3); // Skip 'node', 'cli.js', 'profile'
    await profileHandler.handleProfileCommand(profileArgs);
    process.exit(0);
  }

  const configManager = ConfigManager.getInstance();

  const normalizedExplicitConfig = ensureString(cli.flags.config as string | undefined);
  const normalizedProfile = ensureString(cli.flags.profile as string | undefined);

  let fileConfig: CLIConfig = {};
  let configSources: ConfigSource[] = [];
  try {
    const { config: loadedConfig, sources } = await configManager.load({
      explicitPath: normalizedExplicitConfig,
      profile: normalizedProfile,
    });
    fileConfig = loadedConfig;
    configSources = sources;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to load configuration: ${message}`);
    process.exit(1);
  }

  // Build CLI flag overrides - these take precedence over file config
  const cliOverrides: Partial<CLIConfig> = {};

  // Provider override
  const providerFromFlags = ensureString(cli.flags.provider as string | undefined);
  if (providerFromFlags) {
    const normalized = providerFromFlags.toLowerCase();
    if (
      normalized === 'openrouter' ||
      normalized === 'deepinfra' ||
      normalized === 'github' ||
      normalized === 'zai' ||
      normalized === 'anthropic' ||
      normalized === 'echo'
    ) {
      cliOverrides.activeProvider = normalized as ProviderKey;
    } else {
      console.warn(`Unknown provider '${providerFromFlags}', ignoring flag.`);
    }
  }

  // Model override
  const modelFromFlags = ensureString(cli.flags.model);
  if (modelFromFlags) {
    cliOverrides.model = modelFromFlags;
  }

  // API key override - store in provider-specific config using new auth[] format
  const apiKeyFromFlags = ensureString(cli.flags.apiKey);
  if (apiKeyFromFlags) {
    const targetProvider = cliOverrides.activeProvider || fileConfig.activeProvider;
    if (targetProvider) {
      const existingProviderConfig = fileConfig.providers?.[targetProvider];
      const existingAuth = existingProviderConfig?.auth || [];

      const updatedAuth = existingAuth.filter((a) => a.type !== 'api-key') as AuthMethod[];
      updatedAuth.push({
        type: 'api-key',
        'api-key': apiKeyFromFlags,
      });

      cliOverrides.providers = {
        ...fileConfig.providers,
        [targetProvider]: {
          ...existingProviderConfig,
          auth: updatedAuth,
          'current-auth': 'api-key',
        },
      };
    } else {
      // If no provider specified, store as general apiKey
      cliOverrides.apiKey = apiKeyFromFlags;
    }
  }

  // Reasoning effort / thinking override
  const reasoningEffortFromFlags = ensureString(cli.flags.reasoningEffort);
  if (reasoningEffortFromFlags) {
    const normalized = reasoningEffortFromFlags.toUpperCase();
    if (normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH' || normalized === 'OFF') {
      cliOverrides.thinking = normalized;
    } else {
      console.warn(`Invalid reasoning effort '${reasoningEffortFromFlags}', expected: low | medium | high | off`);
    }
  }

  // Process environment variables and load into 'env' scope
  // Priority chain: global < local < explicit < env < direct
  const envConfig = processEnvironmentVariables();
  if (hasValidProviders(envConfig)) {
    configManager.loadConfig(envConfig, 'env');
  }

  // Build direct scope config from CLI flags (highest priority)
  const directConfig: Partial<CLIConfig> = {
    session: { memPersist: true }, // Memory persistence enabled by default
  };

  // Load CLI overrides into 'direct' scope (overrides everything)
  if (Object.keys(cliOverrides).length > 0 || Object.keys(directConfig).length > 0) {
    configManager.loadConfig({ ...cliOverrides, ...directConfig }, 'direct');
  }

  // Get the final merged config (global < local < explicit < direct)
  const mergedConfig = configManager.getConfig();

  const thinkingSetting = mergedConfig.thinking;
  const finalMemPersist = mergedConfig.session?.memPersist ?? true;
  const finalRequireToolApproval = mergedConfig.requireToolApproval ?? true;

  const { configPath: configPathFromFile, servers: inlineServers } = resolveMCPDefinition(fileConfig, configSources);
  const explicitConfigPath = ensureString(cli.flags.mcpConfig);
  const defaultMcpConfigPath = path.join(nuvinCliDir, '.nuvin_mcp.json');
  const inlineMcpConfig: MCPConfig | undefined = inlineServers ? { mcpServers: inlineServers } : undefined;
  const resolvedMcpConfigPath = explicitConfigPath ?? configPathFromFile ?? defaultMcpConfigPath;
  const displayMcpConfigPath = inlineMcpConfig ? (explicitConfigPath ?? configPathFromFile) : resolvedMcpConfigPath;

  // Handle history flag
  const historyPath = ensureString(cli.flags.history as string | undefined);

  // Register commands
  registerCommands();

  const { waitUntilExit } = render(
    <StrictMode>
      <ThemeProvider>
        <StdoutDimensionsProvider>
          <ConfigProvider initialConfig={mergedConfig}>
            <NotificationProvider>
              <ToolApprovalProvider
                requireToolApproval={finalRequireToolApproval}
                onError={(msg) => console.error(msg)}
              >
                <CommandProvider>
                  <ExplainModeProvider>
                    <ConfigBridge>
                      <App
                        memPersist={finalMemPersist}
                        mcpConfigPath={displayMcpConfigPath}
                        thinking={thinkingSetting}
                        historyPath={historyPath}
                      />
                    </ConfigBridge>
                  </ExplainModeProvider>
                </CommandProvider>
              </ToolApprovalProvider>
            </NotificationProvider>
          </ConfigProvider>
        </StdoutDimensionsProvider>
      </ThemeProvider>
    </StrictMode>,
    {
      exitOnCtrlC: false,
      patchConsole: true,
      incrementalRendering: false,
      maxFps: 60,
    },
  );

  await waitUntilExit();
  process.stdout.write('\x1b[?2004l');
  process.exit(0);
})();
