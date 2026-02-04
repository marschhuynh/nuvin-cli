#!/usr/bin/env node
import { render } from 'ink';
import meow from 'meow';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { AuthMethod } from './config/types.js';
import AppVirtualized from './app-virtualized.js';
import AppLegacy from './app.js';
import { NotificationProvider } from './contexts/NotificationContext.js';
import { ToolApprovalProvider } from './contexts/ToolApprovalContext.js';
import { UserQuestionProvider } from './contexts/UserQuestionContext.js';
import { CommandProvider } from './modules/commands/provider.js';
import { registerCommands } from './modules/commands/definitions/index.js';
import { ConfigProvider } from './contexts/ConfigContext.js';
import { ConfigBridge } from './components/ConfigBridge.js';
import { ThemeProvider } from './contexts/ThemeContext.js';
import { StdoutDimensionsProvider } from './contexts/StdoutDimensionsContext.js';
import { InputProvider, defaultMiddleware } from './contexts/InputContext/index.js';

import { getVersionInfo } from './utils/version.js';
import { runConfigMigration } from './utils/config-migration.js';
import { ConfigManager, type CLIConfig, type ProviderKey } from './config/index.js';
import { ConfigCliHandler } from './config/cli-handler.js';
import { orchestratorManager } from './services/OrchestratorManager.js';
import ansiEscapes from 'ansi-escapes';
import { AltModeProvider } from './contexts/AltModeContext.js';

const ENTER_ALT_SCREEN = '\x1b[?1049h';
const EXIT_ALT_SCREEN = '\x1b[?1049l';
const KITTY_KEYBOARD_DISABLE = '\x1b[<u';
const MOUSE_MODE_DISABLE = '\x1b[?1006l\x1b[?1002l\x1b[?1000l';
const BRACKETED_PASTE_DISABLE = '\x1b[?2004l';

// Cleanup function to reset all terminal modes
const cleanupTerminal = (isAlt: boolean | undefined) => {
  console.log(KITTY_KEYBOARD_DISABLE);
  console.log(MOUSE_MODE_DISABLE);
  console.log(BRACKETED_PASTE_DISABLE);

  if (isAlt) {
    console.log(EXIT_ALT_SCREEN);
  }
};

declare global {
  // var __clipboardFiles: Buffer[] | undefined;
  var __fullClear: () => void;
}

console.log('\x1b[?2004h');

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

// TODO: Remove migration call after v1.x release
await runConfigMigration();

const nuvinDir = path.join(os.homedir(), '.nuvin');
try {
  if (!fs.existsSync(nuvinDir)) {
    fs.mkdirSync(nuvinDir, { recursive: true });
  }
} catch (_error) {
  // Silent fail
}

const cli = meow(
  `
  Nuvin

  Welcome to Nuvin! Transform your natural language requests into automated coding tasks
  with intelligent AI agent workflows. Build faster with your AI coding assistant.

  Usage
    $ nuvin [options]
    $ nuvin config <command> [options]
    $ nuvin profile <command> [options]
    $ nuvin mcp <command> [options]
    $ nuvin --demo <path/to/history.json>

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
    profile help                Show profile command help

  MCP Commands
    mcp list                    List configured MCP servers
    mcp add <name> [options]    Add a new MCP server
    mcp remove <name>           Remove an MCP server
    mcp show <name>             Show server details
    mcp enable <name>           Enable a server
    mcp disable <name>          Disable a server
    mcp test <name>             Test server connection
    mcp help                    Show MCP command help

  Configuration Options
    --provider NAME     Choose AI provider: openrouter | deepinfra | github | zai | anthropic | echo
    --config PATH       Merge configuration from file (JSON or YAML)
    --model NAME        Specify model (e.g., gpt-4o, claude-sonnet-4-5)
    --api-key KEY       Your API key for authentication (OpenRouter, Zai)
    --reasoning-effort  Set reasoning effort for o1 models: low | medium | high (default: medium)
    --history PATH      Load conversation history from file on startup
    --profile NAME      Use specific profile (overrides active profile)
    --resume, -r        Resume the most recent session
    --alt               Use virtualized rendering (experimental)
    --acp               Run as ACP server (for editor integration)

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
      apiKey: { type: 'string' },
      reasoningEffort: { type: 'string' },
      version: { type: 'boolean', alias: 'v' },
      demo: { type: 'string' },
      history: { type: 'string' },
      profile: { type: 'string' },
      resume: { type: 'boolean', alias: 'r' },
      alt: { type: 'boolean' },
      acp: { type: 'boolean' },
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

  // Handle ACP mode - run as server without UI
  if (cli.flags.acp) {
    const { createACPServer } = await import('./acp/index.js');
    const { NuvinACPHandler } = await import('./acp/handler.js');

    const server = createACPServer({
      agentName: 'Nuvin',
      agentVersion: getVersionInfo().version,
    });

    const handler = new NuvinACPHandler();
    server.setHandler(handler);

    // Handle process signals
    process.on('SIGINT', () => {
      server.dispose();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      server.dispose();
      process.exit(0);
    });

    // Start the server (this will block until process exits)
    server.start();
    return; // Don't render React UI
  }

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

  // Extract --profile flag BEFORE processing subcommands
  const normalizedProfile = ensureString(cli.flags.profile as string | undefined);

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

  if (cli.flags.alt) {
    process.stdout.write(ENTER_ALT_SCREEN);
  }

  // Handle config subcommand
  if (cli.input.length > 0 && cli.input[0] === 'config') {
    const configHandler = new ConfigCliHandler();
    // Pass the original process.argv instead of processed cli.input to preserve flags
    const configArgs = cli.input.slice(1);
    await configHandler.handleConfigCommand(configArgs, normalizedProfile);
    process.exit(0);
  }

  // Handle profile subcommand
  if (cli.input.length > 0 && cli.input[0] === 'profile') {
    const { ProfileCliHandler } = await import('./config/profile-handler.js');
    const profileHandler = new ProfileCliHandler();
    const profileArgs = cli.input.slice(1);
    await profileHandler.handleProfileCommand(profileArgs, normalizedProfile);
    process.exit(0);
  }

  // Handle mcp subcommand
  if (cli.input.length > 0 && cli.input[0] === 'mcp') {
    const { MCPCliHandler } = await import('./config/mcp-handler.js');
    const mcpHandler = new MCPCliHandler();
    // Use raw process.argv to preserve unknown flags like --oauth, --auth-server
    const mcpStartIndex = process.argv.indexOf('mcp');
    const mcpArgs = mcpStartIndex !== -1 ? process.argv.slice(mcpStartIndex + 1) : cli.input.slice(1);
    await mcpHandler.handleMCPCommand(mcpArgs, normalizedProfile);
    process.exit(0);
  }

  const configManager = ConfigManager.getInstance();

  const normalizedExplicitConfig = ensureString(cli.flags.config as string | undefined);

  let fileConfig: CLIConfig = {};
  try {
    const { config: loadedConfig } = await configManager.load({
      explicitPath: normalizedExplicitConfig,
      profile: normalizedProfile,
    });
    fileConfig = loadedConfig;
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

  // Pre-load sessions before rendering to avoid re-renders
  const { scanAvailableSessions, getSessionDir } = await import('./hooks/useSessionManagement.js');
  let initialSessions: Awaited<ReturnType<typeof scanAvailableSessions>> | null = null;
  try {
    initialSessions = await scanAvailableSessions(5, normalizedProfile);
  } catch (_error) {
    initialSessions = [];
  }

  // Handle history flag or --resume
  let historyPath = ensureString(cli.flags.history as string | undefined);
  const resumeFlag = cli.flags.resume;

  if (resumeFlag && !historyPath) {
    if (initialSessions && initialSessions.length > 0) {
      const latestSession = initialSessions[0];
      historyPath = path.join(getSessionDir(latestSession.sessionId, normalizedProfile), 'history.cli.json');
    } else {
      console.warn('No previous sessions found to resume.');
    }
  }

  // Register commands (including custom commands)
  await registerCommands(orchestratorManager);

  console.log(ansiEscapes.clearTerminal);

  const App = cli.flags.alt ? AppVirtualized : AppLegacy;

  const { waitUntilExit } = render(
    <ThemeProvider>
      <AltModeProvider altMode={cli.flags.alt}>
        <StdoutDimensionsProvider>
          <InputProvider middleware={defaultMiddleware}>
            <ConfigProvider initialConfig={mergedConfig}>
              <NotificationProvider>
                <UserQuestionProvider orchestratorManager={orchestratorManager}>
                  <ToolApprovalProvider
                    orchestratorManager={orchestratorManager}
                    requireToolApproval={finalRequireToolApproval}
                    onError={(msg) => console.error(msg)}
                  >
                    <CommandProvider>
                      <ConfigBridge>
                        <App
                          memPersist={finalMemPersist}
                          thinking={thinkingSetting}
                          historyPath={historyPath}
                          initialSessions={initialSessions}
                        />
                      </ConfigBridge>
                    </CommandProvider>
                  </ToolApprovalProvider>
                </UserQuestionProvider>
              </NotificationProvider>
            </ConfigProvider>
          </InputProvider>
        </StdoutDimensionsProvider>
      </AltModeProvider>
    </ThemeProvider>,
    {
      exitOnCtrlC: false,
      patchConsole: true,
      incrementalRendering: true,
      maxFps: 60,
    },
  );

  await waitUntilExit();

  cleanupTerminal(cli.flags.alt);
  process.exit(0);
})();
