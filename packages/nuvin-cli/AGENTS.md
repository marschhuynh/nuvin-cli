# AGENTS.md

This file provides guidance to Nuvin cli when working with code in this repository.

## Common Development Commands

```bash
# Build the project
pnpm build

# Development mode with watch
pnpm dev

# Run CLI in development (uses tsx for hot reload)
pnpm run:dev

# Run tests
pnpm test                    # Run all tests
pnpm test -- --watch         # Watch mode
pnpm test <testname>         # Run tests matching pattern (e.g., pnpm test eventProcessor)

# Lint and format
pnpm lint                    # Check code style with Biome
pnpm format                  # Auto-fix formatting issues
```

## CLI Entry Points and Subcommands

The CLI is invoked via `source/cli.tsx` using `meow` for argument parsing. Three subcommand families exist:

**Config subcommand:** `nuvin config <get|set|list|help>`
**Profile subcommand:** `nuvin profile <list|create|delete|switch|show|clone|help>`
**MCP subcommand:** `nuvin mcp <list|add|remove|show|enable|disable|test|help>`

Run without subcommand to enter interactive TUI mode.

## High-Level Architecture

This is a React/Ink-based terminal TUI application. The CLI uses a layered architecture with React components managing UI state while business logic lives in services that interface with `@nuvin/nuvin-core`.

### Entry Flow (`cli.tsx`)
1. `meow` parses CLI flags early (version, demo, config, profile, mcp subcommands)
2. `--profile` flag extracted before subcommand processing
3. Environment variables processed into provider configs (openrouter, anthropic, zai, deepinfra, github)
4. `ConfigManager` loads layered config (global < local < explicit < env < direct)
5. Commands registered via `registerCommands()` (core + custom)
6. React/Ink renders App with nested context providers

### Component Hierarchy
```
<ThemeProvider>
  <AltModeProvider>
    <StdoutDimensionsProvider>
      <InputProvider>
        <ConfigProvider>
          <NotificationProvider>
            <ToolApprovalProvider>
              <CommandProvider>
                <ConfigBridge>
                  <App>  (or AppVirtualized with --alt flag)
                    <ChatDisplay>
                    <InteractionArea>
                    <Footer>
```

### Key Services

| Service | Responsibility |
|---------|---------------|
| `OrchestratorManager` | Main orchestrator lifecycle, session management, LLM factory, context window monitoring |
| `MCPServerManager` | MCP server lifecycle, tool discovery, reconnection logic |
| `SessionMetricsService` | Token usage, cost tracking, response time metrics |
| `LLMFactory` | Creates LLM instances per provider with auth resolution |
| `EventBus` | Typed event emitter for cross-component communication |
| `ConfigManager` | Singleton for layered config loading and merging |

### Event-Driven Communication (`eventBus`)

The `eventBus` (a `TypedEventBus` wrapping Node's `EventEmitter`) enables loose coupling between components. Key events:

- `ui:line` / `ui:lines:set` / `ui:lines:clear` - Chat message updates
- `ui:keyboard:ctrlc` / `ui:keyboard:paste` - Keyboard shortcuts
- `conversation:created` - New session created (after /new or summary)
- `ui:header:refresh` - Force header re-render (terminal resize)
- `command:sudo:toggle` - Sudo mode state change
- `custom-command:execute` - User-defined command execution
- `mcp:serversChanged` - MCP server config changed

### Configuration System

Priority order (later overrides earlier):
1. Global: `~/.nuvin-cli/config.{yaml,json}`
2. Workspace: `./.nuvin-cli/config.{yaml,json}`
3. Explicit: `--config path/to/file`
4. Environment: `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, etc. (processed at startup into 'env' scope)
5. Direct: CLI flags (`--provider`, `--model`, etc.)

The `ConfigManager` singleton provides `load()`, `loadConfig()`, and `getConfig()` for accessing merged configuration.

### Profile System

Profiles enable switching between multiple configurations:
- Stored in `~/.nuvin-cli/profiles/`
- Managed via `nuvin profile <list|create|delete|switch|show|clone>` subcommands
- `--profile` flag overrides active profile for single session

### Command System

Commands are registered in `modules/commands/definitions/index.ts`. Each command:
- Has a handler function that receives the orchestrator and input
- Can be function-based or component-based (rendering UI)
- Is accessible via `/commandName` syntax

Core commands: `/new`, `/clear`, `/exit`, `/help`, `/history`, `/export`, `/model`, `/auth`, `/sudo`, `/thinking`, `/mcp`, `/agent`, `/command`, `/summary`, `/vim`.

### Memory and Sessions

- Default: In-memory until first explicit session
- Lazy initialization: Persisted session created on first user message when `memPersist: true`
- Session dir: `~/.nuvin-cli/sessions/<sessionId>/`
- Each agent (main + specialists) has separate `history.<agentId>.json` files
- Use `--history <path>` or `--resume` to load existing sessions

### Orchestrator Lifecycle (`OrchestratorStatus`)

```
INITIALIZING → READY ↔ ERROR
```

The orchestrator is initialized via `orchestratorManager.init(config, handlers)`. UI hooks (`useOrchestrator`) subscribe to status changes.

### Multi-Agent Delegation

Specialist agents (code-reviewer, quality-tester, etc.) are:
- Loaded from agent registry (`~/.nuvin-cli/agents/`)
- Configured via `agentsEnabled` in config
- Each gets isolated memory and conversation context
- Delegated via `assign_task` tool or `/agent` command

### MCP Integration

MCP servers extend available tools:
- Configured via `~/.nuvin-cli/.nuvin_mcp.json` or inline in config.yaml
- Managed via `nuvin mcp <list|add|remove|show|enable|disable|test>` subcommands
- Use `/mcp` in TUI to see connected servers and available tools

### Demo Mode

`--demo <path/to/history.json>` replays a saved conversation without API calls. Useful for testing UI behavior.

### Alt Mode (Virtualized Rendering)

`--alt` flag enables experimental virtualized list rendering for large conversation histories. Uses `AppVirtualized` instead of `AppLegacy`.

### Error Handling and Crash Recovery

- `uncaughtException` and `unhandledRejection` handlers write crash exports to `nuvin-crash-export-*.json`
- Cleanup function resets terminal modes (alt screen, mouse, paste, keyboard)
- Error boundary component wraps UI for component-level error recovery

## Providers and Authentication

Supported providers: `openrouter`, `anthropic`, `github`, `zai`, `deepinfra`, `echo` (testing).

Auth methods: API key (via `auth[].api-key` or env vars), OAuth (Anthropic).

## Build System

- **tsup**: Bundles TypeScript to ESM `dist/` with minification
- **Biome**: Linting and formatting (configured in `biome.json`)
- **Vitest**: Test runner with React component testing via `ink-testing-library`
- **Path alias**: `@` → `./source` (configured in tsup, vitest, and tsconfig)

## Key Type Definitions

- `OrchestratorConfig`: `{ memPersist?, sessionId?, sessionDir?, streamingChunks? }`
- `UIHandlers`: `{ appendLine, updateLine, updateLineMetadata, handleError }`
- `MessageLine`: `{ id, type: 'user'|'assistant'|'system'|'error', content, metadata? }`
