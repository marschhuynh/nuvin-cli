# AGENTS.md

This file provides guidance to Nuvin cli when working with code in this repository.

## Development Commands

### Prerequisites
- **Node.js 18+** required (see `package.json` engines field)
- **ESM-only package** - Uses `"type": "module"`, all imports must use `.js` extensions

### Build and Development
```bash
# Full build (type check → compile → obfuscate)
pnpm build

# Skip type checking for faster iterations
SKIP_TYPE_CHECK=1 pnpm build

# Development mode with watch
pnpm dev

# Run CLI in development (before build)
pnpm run:dev

# Run built CLI
pnpm run:prod

# Clean build artifacts
pnpm clean

# Build all workspace packages (from repo root)
cd ../.. && pnpm build           # Build both nuvin-core and nuvin-cli
pnpm build:cli                   # Build only CLI
pnpm build:core                  # Build only core
```

### Testing
```bash
# Run all tests (includes core package)
pnpm test

# Watch mode for rapid development
pnpm test:watch

# Run specific test file
pnpm tests/command-queue.test.ts

# Run tests matching pattern
pnpm test -- --grep "command"
```

**Note:** Some legacy tests use AVA instead of Vitest:
- `tests/inputArea.test.ts`
- `tests/utils.test.ts`

These are excluded in `vitest.config.ts` and should eventually be migrated.

### Code Quality
```bash
# Lint with Biome (from repo root or package)
pnpm lint

# Auto-format with Biome
pnpm format
```

**Biome Configuration:**
- 2-space indentation
- Single quotes for JavaScript/TypeScript
- 120 character line width
- Located at `/Users/marsch/Projects/nuvin-space-public/biome.json`

### Publishing
```bash
# Build for publishing (no type check)
pnpm prepack

# Changeset workflow (from repo root)
pnpm changeset                   # Create a changeset
pnpm version-packages            # Bump versions
pnpm release                     # Publish to npm
```

## High-Level Architecture

### Monorepo Structure

This package is part of a monorepo with workspace dependencies:

```
/Users/marsch/Projects/nuvin-space-public/
├── packages/
│   ├── ink/              # Patched Ink workspace dependency
│   ├── nuvin-core/       # Core orchestrator engine (workspace:^)
│   └── nuvin-cli/        # This package
├── pnpm-workspace.yaml   # Workspace config
└── biome.json            # Shared linting/formatting config
```

**Critical:** When making changes, build dependencies first:
```bash
cd ../.. && pnpm build:core && pnpm build:cli
```

### Core Technologies
- **React/Ink** - Terminal UI framework for interactive CLI experiences
  - Custom patched version: `workspace:@nuvin/ink@*` in `packages/ink/`
  - React Compiler enabled via `babel-plugin-react-compiler` (see `vitest.config.ts`)
  - Automatic JSX with `react-jsx` runtime
- **@nuvin/nuvin-core** - Orchestrator engine, LLM providers, tool system, agent registry
  - Workspace dependency: `workspace:^`
  - Located in `packages/nuvin-core/`
  - **Must build together with CLI package** - see Workspace Build Workflow below
- **TypeScript** - Strict mode enabled, path aliases configured (`@/*` → `source/*`)
  - Target: ES2020, Module: ESNext, Resolution: bundler
  - All imports must use `.js` extensions (ESM-only package)
- **Event-driven architecture** - All inter-component communication via `TypedEventBus`
- **Biome** - Linting and formatting (not ESLint/Prettier)
  - Config at `/Users/marsch/Projects/nuvin-space-public/biome.json`
  - 2-space indentation, single quotes, 120 char line width
- **Vitest** - Test runner with React plugin and `@vitejs/plugin-react`
  - Environment: Node (not jsdom) - terminal UI requires real TTY

### Application Flow

```
cli.tsx (entry point)
    ↓
ConfigManager.load() → merges configs in priority order
    ↓
Render <App /> wrapped in provider hierarchy:
    ThemeProvider → StdoutDimensionsProvider → ConfigProvider →
    NotificationProvider → ToolApprovalProvider → CommandProvider →
    UserQuestionProvider → AltModeProvider → ConfigBridge
    ↓
App.tsx initializes useOrchestrator() hook
    ↓
OrchestratorManager.init() → creates AgentOrchestrator + MCPServerManager
    ↓
User interaction loop: InputArea → useHandleSubmit → OrchestratorManager →
    AgentOrchestrator → LLM Provider → Tool execution →
    UIEventAdapter → EventBus → ChatDisplay
```

### Key Architectural Patterns

**Singleton Services**
- **`OrchestratorManager`** (`source/services/OrchestratorManager.ts`) - Central coordinator for agent lifecycle, LLM creation, session management, MCP server management
- **`EventBus`** (`source/services/EventBus.ts`) - Typed event emitter for all UI updates, tool approvals, keyboard events, command lifecycle
- **`commandRegistry`** (`source/modules/commands/registry.ts`) - Slash command registration and execution
- **`ConfigManager.getInstance()`** (`source/config/manager.ts`) - Layered configuration with profile support

**Event Bus (Central Communication)**
- All components communicate through `source/services/EventBus.ts`
- Typed events with `EventMap` defining all possible events
- Use `eventBus.emit()` and `eventBus.on()` for pub/sub patterns
- Key events: `ui:*`, `agent:*`, `lsp:*`, `command:*`, `mcp:*`, `conversation:*`

**Layered Configuration System**
Configuration priority (higher overrides lower):
1. Global config (`~/.nuvin/config.yaml`)
2. Workspace config (`./.nuvin/config.yaml`)
3. Explicit file (`--config path/to/file.yaml`)
4. Environment variables (processed at startup in `cli.tsx`)
5. CLI flags (highest priority)

Managed by `ConfigManager` singleton with profile support.

**Multi-Agent Architecture**
- Main orchestrator agent handles user interaction and task routing
- Specialist agents spawned via `assign_task` tool with isolated contexts
- Agent registry in `@nuvin/nuvin-core` with configuration-based enabling/disabling
- Session resumption supported for all agents

**Command System**
Two command types:
- **Function commands** - Direct execution via handler function
- **Component commands** - Render React components in TUI overlay

Commands defined in `source/modules/commands/definitions/` with lifecycle hooks:
- `initialize()` - Called on registration
- `beforeInvoke()` - Pre-execution validation/setup
- `afterInvoke()` - Post-execution cleanup
- `onExit()` - When command deactivated

**Adapter Layer Pattern**
`source/adapters/ui-event-adapter.ts` bridges orchestrator events to UI events.
Translates core events into `MessageLine` objects for rendering.

**Profile System**
- Multiple isolated configuration profiles
- Default profile: `~/.nuvin/`
- Custom profiles: `~/.nuvin/profiles/<name>/`
- Managed by `ProfileManager` with runtime switching

**MCP Integration**
Model Context Protocol servers provide extensible tools:
- Configured in `config.yaml` under `mcp.servers`
- Managed by `MCPServerManager`
- Tools exposed with configurable prefixes (e.g., `mcp_filesystem_read_file`)
- Per-server tool permissions via `mcp.allowedTools`

### Service Layer

Core services in `source/services/`:
- **OrchestratorManager** - Agent lifecycle, conversation management, LLM interaction
- **EventBus** - Typed event pub/sub system
- **MCPServerManager** - MCP server lifecycle and tool exposure
- **LLMFactory** - Provider instantiation and auth handling
- **SkillsService** - Dynamic skill loading and execution
- **SessionMetricsService** - Token usage, cost tracking, context window monitoring
- **LSP** - Language Server Protocol integration for code intelligence

### Context Providers

React contexts in `source/contexts/`:
- **ConfigContext** - Live configuration with profile switching
- **ToolApprovalContext** - Sudo mode for manual tool approval
- **UserQuestionContext** - Agent→User question prompts
- **NotificationContext** - Toast notifications
- **ThemeContext** - Terminal theme and color tokens
- **AltModeContext** - Alternate input mode tracking
- **InputContext** - Keyboard input with middleware chain

### Message Flow

User input → InputArea → useHandleSubmit → OrchestratorManager
  → AgentOrchestrator (@nuvin-core) → LLM Provider
  → Tool calls → Tool execution → Results → LLM
  → Stream chunks → UIEventAdapter → EventBus → ChatDisplay

### Adding New Features

**New Command:**
```typescript
// source/modules/commands/definitions/my-command.ts
export const myCommand: FunctionCommand = {
  id: '/my-command',
  description: 'Does something useful',
  type: 'function',
  handler: async (ctx) => {
    // Access orchestrator, config, eventBus
    await ctx.orchestratorManager?.send('Hello');
  }
};

// Register in source/modules/commands/definitions/index.ts
registry.register(myCommand);
```

**New Tool:**
Tools defined in `@nuvin/nuvin-core` workspace package.
Add to `baseEnabledTools` array in `OrchestratorManager.ts:69-84`.

**New Event:**
Add to `EventMap` in `source/services/EventBus.ts` with type safety.

**New Provider:**
1. Add provider config schema in `source/config/types.ts`
2. Add to `ProviderKey` type in `source/config/providers.ts`
3. Implement auth handler in `source/config/cli-handler.ts`
4. Add LLM factory logic in `source/services/LLMFactory.ts`

### File Organization Conventions

- **Components/** - Reusable React/Ink UI components
- **Modules/commands/** - Command system (registry, definitions, hooks)
- **Adapters/** - Bridges between core systems and UI
- **Contexts/** - React context providers
- **Hooks/** - Custom React hooks (use-prefixed)
- **Services/** - Business logic and external system integration
- **Utils/** - Pure utility functions (no side effects)
- **Config/** - Configuration loading, validation, persistence

### Testing Approach

- **Vitest** for unit/integration tests (`tests/*.test.ts`, `tests/*.test.tsx`)
- **React Test Renderer** for component testing
- Test mocks in `tests/helpers/` and `tests/testUtils/`
- Environment: Node (not jsdom) - terminal UI requires real TTY
- Component tests use ink-testing-library for rendered output verification

### Build Process

1. **Type check** - `tsc --noEmit` (skippable via `SKIP_TYPE_CHECK=1`)
2. **Compile** - `tsup` bundles to `dist/` (ESM, Node 18 target, minified)
3. **Obfuscate** - JavaScript obfuscator applied to all `.js` files
4. **Version** - Generate version info
5. **Copy README** - Include documentation in dist

### Critical Integration Points

- **@nuvin/nuvin-core** - Workspace dependency, must build together
- **Ink** - Workspace dependency, patched for virtualization
- **Biome** - Linting/formatting, not ESLint/Prettier
- **Vitest** - Test runner, not Jest
- **TypeScript paths** - `@/*` aliases must resolve to `source/*`

### Common Patterns

**Session Persistence:**
Conversations stored in `.history/<session-id>/history.json` when `memPersist: true`.

**Streaming Responses:**
LLM responses streamed via chunks, rendered incrementally in `ChatDisplay`.

**Tool Approval:**
When `requireToolApproval: true`, tools wait for user approval via `ToolApprovalPrompt`.

**LSP Integration:**
Language servers spawned per workspace, diagnostics streamed to UI via events.

**Error Handling:**
Global handlers in `cli.tsx` catch uncaught exceptions/unhandled rejections.
Export crash logs as `nuvin-crash-export-*.json`.

**Authentication:**
Provider auth via environment variables or config. OAuth flows for Anthropic/GitHub.

### Environment Variables for Development

```bash
# Provider API keys
OPENROUTER_API_KEY=sk-or-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GITHUB_ACCESS_TOKEN=ghp_xxx

# Optional web search
GOOGLE_CSE_KEY=xxx
GOOGLE_CSE_CX=xxx

# Development
SKIP_TYPE_CHECK=1  # Faster builds
```

### Debugging

- React DevTools available via `react-devtools-core` (use `--demo` mode)
- EventBus logs all typed events for debugging event flows
- `OrchestratorManager` exposes status via `getStatus()`
- Session metrics available via `SessionMetricsService.getSnapshot()`
