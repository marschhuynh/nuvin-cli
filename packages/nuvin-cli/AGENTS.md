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

## High-Level Architecture

This is a React/Ink-based terminal TUI application. The CLI uses a layered architecture with React components managing UI state while business logic lives in services that interface with `@nuvin/nuvin-core`.

### Entry Flow (`cli.tsx`)
1. `meow` parses CLI flags early
2. `ConfigManager` loads layered config (global < local < explicit < env < direct)
3. Environment variables are processed into the `env` config scope
4. Providers are registered (environment variables → CLI flags)
5. React/Ink renders the App component with nested context providers

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
                  <App>  (or AppVirtualized)
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
4. Environment: `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, etc.
5. Direct: CLI flags (`--provider`, `--model`, etc.)

The `ConfigManager` singleton provides `load()`, `loadConfig()`, and `getConfig()` for accessing merged configuration.

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
