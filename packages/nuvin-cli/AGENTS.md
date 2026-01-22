# AGENTS.md

This file provides guidance to Nuvin cli when working with code in this repository.

## Common Development Commands

```bash
# Build the project
pnpm build                    # Full build with type check
SKIP_TYPE_CHECK=1 pnpm build  # Faster build without type check

# Development mode with watch
pnpm dev

# Run CLI in development (uses tsx for hot reload)
pnpm run:dev

# Run tests
pnpm test                     # Run all tests once
pnpm test -- --watch          # Watch mode
pnpm test -- --ui             # Vitest UI mode
pnpm test <pattern>           # Run tests matching pattern
pnpm test eventProcessor      # Run all eventProcessor tests
pnpm test OrchestratorManager # Run specific test file

# Lint and format
pnpm lint                     # Check code style with Biome
pnpm format                   # Auto-fix formatting issues

# Clean build artifacts
pnpm clean                    # Remove dist/ directory
```

## Creating New Commands

Commands are registered in `source/modules/commands/definitions/`. Each command file exports a `register*Command` function:

```typescript
// source/modules/commands/definitions/mycommand.ts
import type { CommandRegistry } from '@/modules/commands/types.js';

export function registerMyCommand(registry: CommandRegistry) {
  registry.register({
    id: '/mycommand',           // Command invocation: /mycommand
    type: 'function',           // 'function' | 'component'
    description: 'Description',
    category: 'session',        // For grouping in help
    async handler({ eventBus, orchestratorManager, config }) {
      // Command logic here
      eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'info',
        content: 'Command executed',
      });
    },
  });
}
```

Then register in `source/modules/commands/definitions/index.ts`:

```typescript
import { registerMyCommand } from './mycommand.js';

export async function registerCommands(orchestratorManager: OrchestratorManager) {
  // ...existing commands
  registerMyCommand(commandRegistry);
}
```

**Component-based commands** render interactive UI:
```typescript
registry.register({
  id: '/interactive',
  type: 'component',
  description: 'Interactive command',
  category: 'config',
  Component: () => import('@/components/MyComponent.js'),
});
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
1. Global: `~/.nuvin/config.{yaml,json}`
2. Workspace: `./.nuvin/config.{yaml,json}`
3. Explicit: `--config path/to/file`
4. Environment: `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, etc. (processed at startup into 'env' scope)
5. Direct: CLI flags (`--provider`, `--model`, etc.)

The `ConfigManager` singleton provides `load()`, `loadConfig()`, and `getConfig()` for accessing merged configuration.

### Profile System

Profiles enable switching between multiple configurations:
- Stored in `~/.nuvin/profiles/`
- Managed via `nuvin profile <list|create|delete|switch|show|clone>` subcommands
- `--profile` flag overrides active profile for single session

### Command System

Commands are registered in `modules/commands/definitions/index.ts`. Each command:
- Has a handler function that receives the orchestrator and input
- Can be function-based or component-based (rendering UI)
- Is accessible via `/commandName` syntax

**Command Structure:**
```typescript
// Function-based command
export const command = {
  id: 'commandName',
  handler: async ({ orchestrator, input, args }) => {
    // Command logic
  }
};

// Component-based command (interactive UI)
export const command = {
  id: 'commandName',
  Component: () => {
    // Interactive component
  }
};
```

**Core Commands:**
- Session: `/new`, `/clear`, `/exit`
- Info: `/help`, `/history`, `/export`, `/summary`
- Config: `/model`, `/auth`, `/sudo`, `/thinking`
- Features: `/mcp`, `/agent`, `/skills`, `/command`, `/vim`

**Custom Commands:**
Users can define custom commands in `~/.nuvin/commands/` that are loaded via `CustomCommandLoader`.

### Memory and Sessions

- Default: In-memory until first explicit session
- Lazy initialization: Persisted session created on first user message when `memPersist: true`
- Session dir: `~/.nuvin/sessions/<sessionId>/`
- Each agent (main + specialists) has separate `history.<agentId>.json` files
- Use `--history <path>` or `--resume` to load existing sessions

**Session Lifecycle Hook (`useSessionManagement`):**
- `loadHistoryFromFile(path)` - Load conversation from JSON file
- `exportToFile(path, messages)` - Export current conversation
- `createNewSession(config)` - Start fresh session with optional sessionId
- Session info tracked via `SessionInfo[]` in state

**Session Metrics:**
`SessionMetricsService` tracks:
- Token usage per session
- Cost calculations
- Response times
- Tool execution counts
- Subscribe to updates: `sessionMetricsService.subscribe((conversationId, snapshot) => {})`

### Orchestrator Lifecycle (`OrchestratorStatus`)

```
INITIALIZING → READY ↔ ERROR
```

The orchestrator is initialized via `orchestratorManager.init(config, handlers)`. UI hooks (`useOrchestrator`) subscribe to status changes.

### Multi-Agent Delegation

Specialist agents (code-reviewer, quality-tester, etc.) are:
- Loaded from agent registry (`~/.nuvin/agents/`)
- Configured via `agentsEnabled` in config
- Each gets isolated memory and conversation context
- Delegated via `assign_task` tool or `/agent` command

### MCP Integration

MCP servers extend available tools:
- Configured via `~/.nuvin/.nuvin_mcp.json` or inline in config.yaml
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

The build process (`scripts/build.js`) runs in stages:

1. **TypeScript type check**: `npx tsc --noEmit` (skip with `SKIP_TYPE_CHECK=1`)
2. **Bundle with tsup**: ESM output to `dist/` with minification
3. **Code obfuscation**: JavaScript Obfuscator for production builds
4. **Version generation**: Auto-generated version file
5. **README copy**: README.md copied to dist for npm publication

```bash
# Standard build (includes type check)
pnpm build

# Build without type checking (faster for iteration)
SKIP_TYPE_CHECK=1 pnpm build

# Development build with watch
pnpm dev
```

**Build Tools:**
- **tsup**: Bundles TypeScript to ESM `dist/` with minification
- **Biome**: Linting and formatting
- **Vitest**: Test runner with React component testing via `ink-testing-library`
- **Path alias**: `@` → `./source` (configured in tsup, vitest, tsconfig, and esbuild)
- **React Compiler**: Enabled via Babel plugin (`babel-plugin-react-compiler`)

**TypeScript Configuration:**
- Strict mode enabled with all strict checks
- Target: ES2020, Module: ESNext
- JSX: automatic (React 19)
- No unused locals/parameters allowed

## Testing Patterns

The codebase uses Vitest with `ink-testing-library` for React component testing.

### Component Testing

```typescript
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';

// Mock child components to simplify output verification
vi.mock('../../source/components/MessageLine.js', () => ({
  MessageLine: ({ message }) => <Text>[Message {message.id}]</Text>,
}));

describe('ChatDisplay', () => {
  it('renders messages correctly', () => {
    const { lastFrame } = render(<ChatDisplay messages={messages} />);
    expect(lastFrame()).toContain('[Message msg-1]');
  });
});
```

### Service Testing

```typescript
// Mock ConfigManager before importing services
const { mockConfigManager } = vi.hoisted(() => ({
  mockConfigManager: {
    getConfig: vi.fn(() => ({ activeProvider: 'openrouter' })),
    get: vi.fn(() => undefined),
  },
}));

vi.mock('../source/config/manager.js', () => ({
  ConfigManager: { getInstance: vi.fn(() => mockConfigManager) },
}));

import { OrchestratorManager } from '../source/services/OrchestratorManager.js';
```

### Test File Organization

- `tests/components/*.test.tsx` - React/Ink component tests
- `tests/*.test.ts` - Service and utility tests
- Tests excluded from Vitest: `tests/inputArea.test.ts`, `tests/utils.test.ts` (these use AVA)

## Service Architecture

### Singleton Pattern

Key services use singleton instances for application-wide state:

- `orchestratorManager` - `source/services/OrchestratorManager.ts:1294`
- `sessionMetricsService` - `source/services/SessionMetricsService.ts:72`
- `skillsService` - `source/services/SkillsService.ts:466`
- `eventBus` - `source/services/EventBus.ts` (TypedEventBus wrapping Node EventEmitter)

### LSP Integration

The LSP service (`source/services/lsp/`) provides code intelligence:

- **client.ts** - JSONRPC-based LSP client
- **server.ts** - Manages LSP server processes
- **language.ts** - Language ID mappings
- **index.ts** - Main LSP service with diagnostics support

LSP diagnostics are emitted via `eventBus` on `lsp:diagnostics` event.

### Event-Driven Best Practices

When working with the event bus:

1. **Always unsubscribe** in cleanup functions to prevent memory leaks
2. **Use typed events** - all events defined in `EventMap` type
3. **Emit with payloads** - events can include typed data for context

```typescript
useEffect(() => {
  const handler = (payload) => { /* handle event */ };
  eventBus.on('ui:line', handler);
  return () => eventBus.off('ui:line', handler);
}, []);
```

## Path Alias System

The `@` alias maps to `./source` and is configured in:
- `tsconfig.json` - TypeScript resolution
- `vitest.config.ts` - Test module resolution
- `tsup.config.ts` - Build-time bundling
- `esbuildOptions` - JSX/alias resolution

Usage:
```typescript
import { MyComponent } from '@/components/MyComponent.js';
import { myUtil } from '@/utils/myUtil.js';
```

**Important:** Always use `.js` extensions in imports (ESM requirement).

## React Compiler

The project uses React Compiler (via `babel-plugin-react-compiler`) for automatic optimizations. This means:
- Manual `useMemo`/`useCallback` are less critical
- Component renders are automatically optimized
- Some hooks may need `// biome-ignore` for dependency warnings (see `useOrchestrator.ts:1`)

## Key Type Definitions

- `OrchestratorConfig`: `{ memPersist?, sessionId?, sessionDir?, streamingChunks? }`
- `UIHandlers`: `{ appendLine, updateLine, updateLineMetadata, handleError }`
- `MessageLine`: `{ id, type: 'user'|'assistant'|'system'|'error', content, metadata? }`
- `OrchestratorStatus`: `'Initializing' | 'Ready' | 'Error'` (enum)
- `CLIConfig`: Full configuration shape with providers, MCP, skills, session settings
- `AuthMethod`: `{ type: 'api-key', 'api-key': string }` or `{ type: 'oauth', access, refresh, expires? }`
