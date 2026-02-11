# AGENTS.md

This file provides guidance to Nuvin cli when working with code in this repository.

## Commands

All commands run from the monorepo root unless noted.

```bash
# Build (must build core before cli — core is a workspace dependency)
pnpm build                # Build core then cli (sequential)
pnpm build:core           # Build only nuvin-core
pnpm build:cli            # Build only nuvin-cli

# Development
pnpm run:dev              # Run CLI in dev mode (tsx, no build needed)
pnpm dev                  # Watch mode (tsup rebuild on change)
pnpm run:prod             # Run production build (dist/cli.js)

# Testing
pnpm test                 # Run all tests (core then cli, both vitest)
pnpm --filter @nuvin/nuvin-cli test                    # CLI tests only
pnpm --filter @nuvin/nuvin-core test                   # Core tests only
cd packages/nuvin-cli && pnpm exec vitest run tests/manager.test.ts  # Single test file
cd packages/nuvin-core && pnpm exec vitest run src/tests/base-llm.test.ts  # Single core test

# Linting & formatting (Biome, not ESLint/Prettier)
pnpm lint                 # Biome lint (CLI package)
pnpm format               # Biome format changed files

# Faster builds (skip tsc --noEmit)
SKIP_TYPE_CHECK=1 pnpm build

# Release (changesets)
pnpm changeset            # Create changeset
pnpm version-packages     # Bump versions
pnpm release              # Publish to npm
```

**Biome rules:** 2-space indent, single quotes, 120-char line width, `noExplicitAny: error`. Config at root `biome.json`.

## Monorepo Structure

```
packages/
├── nuvin-core/    # Headless orchestration engine (LLM, tools, agents, MCP)
├── nuvin-cli/     # Terminal UI application (React/Ink TUI)
└── ink/           # Forked Ink (custom Yoga layout, position: absolute/sticky, z-index)
```

- **pnpm workspaces** with `workspace:^` / `workspace:*` references
- The root `package.json` overrides `ink` → `npm:@nuvin/ink@6.6.4` globally so all packages use the fork
- Build order matters: `nuvin-core` → `nuvin-cli` (cli imports core)

## Architecture

### nuvin-core (Hexagonal / Ports & Adapters)

The core is a headless library with no terminal or React dependencies. All external concerns are abstracted behind **port interfaces** in `src/ports.ts`:

| Port | Purpose |
|------|---------|
| `LLMPort` | LLM completion (generate + stream) |
| `LLMFactory` | Create LLM instances from config |
| `ToolPort` | Tool definitions + execution |
| `MemoryPort<T>` | Key-value conversation storage |
| `MetadataPort<T>` | Key-value metadata storage |
| `EventPort` | Emit `AgentEvent` (the single event stream) |
| `MetricsPort` | Token/cost/timing metrics |
| `ContextBuilder` | Convert history → provider messages |
| `HookPort` | Lifecycle hooks (before/after tool calls) |

**`AgentOrchestrator`** (`src/orchestrator.ts`, ~1200 lines) is the central class. It receives all ports via constructor injection and runs the message loop: user message → LLM call → tool execution → loop until done. It emits `AgentEvent` for every lifecycle transition.

**`AgentEvent`** types (`AgentEventTypes` enum in `src/ports.ts`): `MessageStarted`, `ToolCalls`, `ToolApprovalRequired`, `ToolResult`, `AssistantChunk`, `AssistantMessage`, `StreamFinish`, `Done`, `Error`, `SubAgent*`, `UserQuestion*`.

**Tool system:** Each tool implements `FunctionTool` interface (`src/tools/types.ts`) with `definition()` and `execute()`. `ToolRegistry` (`src/tools.ts`) wraps tools into a `ToolPort`. `CompositeToolPort` merges multiple tool ports (base + MCP tools).

**LLM providers:** `BaseLLM` (`src/llm-providers/base-llm.ts`) provides OpenAI-compatible implementation. Specialized subclasses for Anthropic (AI SDK and compat), GitHub. New OpenAI-compatible providers can be added via `llm-provider-config.json` without code changes.

**Delegation system** (`src/delegation/`): `DelegationService` spawns sub-agent orchestrators with their own memory, tools, and LLM. `AgentRegistry` manages agent templates. The `AssignTool` coordinates delegation lifecycle.

### nuvin-cli (React/Ink TUI)

**Entry:** `source/cli.tsx` → parses CLI args (meow), loads config, renders `<App />` inside nested React context providers.

**Provider hierarchy:**
```
ThemeProvider → StdoutDimensionsProvider → ConfigProvider →
NotificationProvider → ToolApprovalProvider → CommandProvider →
UserQuestionProvider → AltModeProvider → ConfigBridge → App
```

**Key singletons** (module-level exports, not React state):
- `OrchestratorManager` (`source/services/OrchestratorManager.ts`) — creates/manages `AgentOrchestrator`, bridges CLI config to core ports
- `EventBus` (`source/services/EventBus.ts`) — typed pub/sub for UI events (separate from core's `AgentEvent`)
- `commandRegistry` (`source/modules/commands/registry.ts`) — slash command registration

**Event bridging:** `UIEventAdapter` (`source/adapters/`) implements core's `EventPort`, receives `AgentEvent` from the orchestrator, transforms them into `MessageLine` objects via `eventProcessor.ts`, and emits UI events on `EventBus` for React components.

**Command system:** Commands in `source/modules/commands/definitions/` are either function commands (handler returns) or component commands (render React component as overlay). Two types registered via `commandRegistry.register()`.

**ACP server mode:** `source/acp/` implements Agent Communication Protocol over stdio JSON-RPC. Entry via `nuvin --acp`. Reuses same config resolution and tool system as the TUI.

### Configuration System

Layered config with priority (highest wins): CLI flags → env vars → explicit file (`--config`) → workspace (`./.nuvin/config.yaml`) → global (`~/.nuvin/config.yaml`).

`ConfigManager` (`source/config/manager.ts`) is a singleton with profile support. Profiles store isolated configs at `~/.nuvin/profiles/<name>/`.

## Key Conventions

- **Path alias:** `@/*` → `source/*` (in tsup, vitest, and tsconfig)
- **ESM-only:** Both packages use `"type": "module"`. Imports need `.js` extensions in core.
- **TypeScript strict mode** enabled in both packages. Target ES2020.
- **React Compiler:** CLI uses `babel-plugin-react-compiler` (configured in vitest.config.ts and tsup)
- **Markdown as modules:** `.md` files imported as text strings via custom loader

## Testing

- **nuvin-core:** Vitest, pure Node environment. Tests at `src/tests/**/*.test.ts`.
- **nuvin-cli:** Vitest + `@vitejs/plugin-react`. Tests at `tests/**/*.test.{ts,tsx}`. Node environment (not jsdom — terminal UI).
- Two legacy tests use AVA and are excluded from vitest: `tests/inputArea.test.ts`, `tests/utils.test.ts`.
- React component tests use `ink-testing-library` for render output verification.
- Core tests with `--typecheck` flag enabled (validates types during test run).

## Build Pipeline

Both packages use `tsup` → `scripts/build.js`:
1. Optional `tsc --noEmit` type check (skip with `SKIP_TYPE_CHECK=1`)
2. `tsup` compiles to `dist/` (ESM, Node 18 target, minified)
3. JavaScript obfuscator applied to output `.js` files
4. Version info generated
