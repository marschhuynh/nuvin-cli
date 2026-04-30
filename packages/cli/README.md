# @nuvin/cli

A full-featured terminal UI (TUI) coding assistant built with **React** and **Ink**. It provides an interactive, streaming chat interface in your terminal that connects to LLM providers (Anthropic, OpenAI-compatible) and gives the assistant a suite of workspace tools — file reading/writing, search, shell execution, and more — with a human-in-the-loop approval system for safety-critical operations.

---

## Features

- **Interactive Terminal UI** — Full-screen TUI with virtualized message list, scrolling, keyboard navigation, and alt-screen buffer support.
- **Streaming Responses** — Real-time streaming of assistant text, reasoning, and tool output as they arrive.
- **Workspace Tools** — Built-in tools for file inspection (`FileRead`, `Ls`, `Glob`, `Grep`), file editing (`FileEdit`, `FileNew`), and shell execution (`Bash`).
- **Human-in-the-Loop Approvals** — Tool calls that modify state (e.g., `Bash`, `FileEdit`, `FileNew`) require explicit user approval before execution. Read-only tools (`FileRead`, `Ls`, `Glob`, `Grep`) are auto-approved.
- **Delegated Agents** — Pluggable agent delegation system (`AssignTask`) for spawning specialist sub-agents (code review, debugging, planning, etc.) with nested message rendering.
- **Rich Markdown Rendering** — Terminal-optimized markdown with syntax highlighting, table rendering, emoji support, and configurable text reflow.
- **Theming Engine** — Adaptive light/dark theme with automatic terminal color-depth detection, background fills, dim variants for modals, and full customization via config/env variables.
- **Diff View** — Inline file-diff rendering for `FileEdit` tool calls showing additions, removals, and context lines with color-coded highlighting.
- **Customizable Chat Model** — Configurable LLM provider with support for Anthropic Messages API, OpenAI-compatible endpoints, bearer/API-key auth schemes, and reasoning effort settings.

---

## Architecture

```
src/
├── index.ts                          # Entry point — boots the app
├── root.tsx                          # Main bootstrap: config, model, agent, render
├── app.tsx                           # Root React component — state, events, approvals
├── components/
│   ├── Header.tsx                    # Top bar: brand, cwd, model name, approval mode
│   ├── Composer.tsx                  # User input field with busy/idle states
│   ├── MessageList.tsx               # Virtualized scrollable message list
│   ├── MessageRow.tsx                # Renders a single message (text or tool)
│   ├── ToolMessageRow.tsx            # Tool-specific message rendering
│   ├── ApprovalModal.tsx             # Modal for approving/denying tool calls
│   ├── StatusFooter.tsx              # Footer with hints + live memory usage
│   ├── Modal.tsx                     # Generic modal overlay component
│   ├── ChildMessagesContext.tsx       # Context for nested delegation messages
│   └── tool-renders/                 # Per-tool renderers
│       ├── BashToolRender.tsx
│       ├── FileReadToolRender.tsx
│       ├── FileEditToolRender.tsx
│       ├── FileNewToolRender.tsx
│       ├── FileDiffView.tsx          # Inline diff display
│       ├── GlobToolRender.tsx
│       ├── GrepToolRender.tsx
│       ├── LsToolRender.tsx
│       ├── AssignTaskToolRender.tsx
│       ├── UnknownToolRender.tsx
│       └── ...
└── lib/
    ├── agent-channel.ts              # Event bridge between Agent and React UI
    ├── approvals/
    │   └── queue.ts                  # Approval queue with FIFO processing
    ├── chat/
    │   └── model.ts                  # Chat model factory (provider config, auth)
    ├── diagnostics/
    │   └── memory.ts                 # Memory tracking & diagnostics
    ├── markdown/                     # Markdown → terminal rendering pipeline
    │   ├── cache.ts
    │   ├── provider.ts               # Cached Marked instance management
    │   ├── render.ts
    │   └── renderers/
    │       ├── terminal-renderer.ts
    │       ├── code-highlighter.ts
    │       ├── table-renderer.ts
    │       ├── list-renderer.ts
    │       ├── text-reflow.ts
    │       ├── emoji-processor.ts
    │       └── text-utils.ts
    ├── messages/
    │   └── state.ts                  # Immutable message state machine
    ├── theme/
    │   ├── runtime.ts                # Theme resolution (light/dark, color depth)
    │   └── store.ts                  # Zustand theme store with dim support
    └── tools/
        └── argsRenderer.ts           # Tool argument formatting for approval UI
```

### Key Design Patterns

| Pattern | Description |
|---------|-------------|
| **Agent Channel** | Decouples the imperative `Agent` (constructed before React mounts) from the UI via an `EventEmitter`-based channel. The agent publishes events and requests tool decisions; `<App />` subscribes and resolves approvals. |
| **Immutable State** | All message and approval state transitions use pure functions that return new state objects, composed inside React's `setState`. |
| **Virtualized List** | Only visible messages are rendered (with overscan), using `@nuvin/ink-virtualized-list` for efficient scrolling through long conversations. |
| **Singleton Theme Store** | A Zustand store (not React Context) holds the resolved theme, enabling both React hook access (`useTheme()`) and vanilla JS snapshots (`getTheme()`). |
| **Cached Markdown Provider** | `Marked` instances are cached by config key (width, tokens, reflow) to avoid re-creating the parser pipeline on every render frame. |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 22
- **npm**, **pnpm**, or **yarn** (monorepo workspace setup with `pnpm` recommended)

### Install Dependencies

```bash
pnpm install
```

### Development

```bash
# Run in dev mode with hot reload
pnpm dev

# Run with file watcher
pnpm dev:watch
```

### Build

```bash
pnpm build
```

Output is written to `dist/`. The CLI entry point is `dist/index.js`.

### Run Tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch
```

Test files are co-located alongside source files using the `.test.ts` / `.test.tsx` convention, run via [Vitest](https://vitest.dev/).

---

## Configuration

### Config File

The CLI loads configuration from a `config.yaml` (or the path resolved by `@nuvin/config`). Example:

```yaml
database:
  host: localhost
  port: 5432
  name: myapp_db

server:
  port: 9000
  timeout: 60
  debug: true
  ssl_enabled: true

features:
  - login
  - signup
  - profile
  - dashboard
  - api_integration
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `API_KEY` | LLM provider API key (fallback if not in config) |
| `NUVIN_THEME_MODE` | Force `"dark"` or `"light"` theme |
| `NUVIN_THEME_BACKGROUNDS` | Background fills: `"on"`, `"off"`, or `"auto"` |
| `NUVIN_MESSAGE_STYLE` | Message styling: `"plain"` or `"tinted"` |
| `FORCE_COLOR` | Force color level (`0`=none, `1`=16-color, `2`=256-color, `3`=truecolor) |
| `NO_COLOR` | Disable all colors |
| `COLORFGBG` | Auto-detect light/dark terminal background |

---

## Approval System

Tool calls fall into two categories:

| Category | Tools | Behavior |
|----------|-------|----------|
| **Auto-approved** | `FileRead`, `Ls`, `Glob`, `Grep` | Execute immediately without prompting |
| **Requires approval** | `Bash`, `FileEdit`, `FileNew`, `AssignTask` | Pauses for user decision |

When a tool requires approval, the **Approval Modal** appears with:

- **Tool name & parameters** — scrollable argument display
- **Yes** (1) — approve this call
- **No** (2) — deny this call
- **Yes, for this session** (3) — auto-approve this tool for the rest of the session
- **Comment input** (4) — submit a change request / denial reason

Navigate with `Tab`, confirm with `Enter`, dismiss with `Escape`.

---

## Theming

The theme system automatically adapts to your terminal:

1. **Mode** — Detects light vs. dark background via `COLORFGBG` or `NUVIN_THEME_MODE`
2. **Color Level** — Reads `FORCE_COLOR` / `NO_COLOR` or probes `stdout.getColorDepth()`
3. **Backgrounds** — Enables colored surface fills only when truecolor/256-color is available (off by default in light mode)
4. **Dim Variant** — When a modal opens, all background colors blend toward a neutral target so the overlay stands out

The theme is accessible via `useTheme()` in React components or `getTheme()` in vanilla code.

---

## Delegated Agents

The CLI supports a pluggable agent delegation system. Agent definitions are discovered from configured directories and can be enabled/disabled per profile. When enabled, the coordinator agent can delegate subtasks to specialists:

- **Code Reviewer** — Reviews code for quality, bugs, and best practices
- **React Senior Dev** — Expert React/TypeScript/CSS implementation
- **News Collector** — Gathers current news and updates
- **GSD Agents** — Planning, execution, verification, debugging workflows

Delegated agents run with their own tool set and publish events back through the `AgentChannel`, rendered as nested messages under the parent `AssignTask` tool call.

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@nuvin/agent-core` | Agent runtime, tool definitions, chat model abstractions |
| `@nuvin/config` | Configuration management, profiles, env loading |
| `@nuvin/ink` | React-based terminal rendering (fork of Ink) |
| `@nuvin/ink-input` | Keyboard input handling |
| `@nuvin/ink-text-input` | Text input component |
| `@nuvin/ink-virtualized-list` | Virtualized scrolling list |
| `react` / `react-dom` | UI framework |
| `zustand` | Lightweight state management (theme store) |
| `marked` | Markdown parsing |
| `chalk` | Terminal color utilities |
| `cli-highlight` | Syntax highlighting |
| `vitest` | Test framework |

---

## License

Private — All rights reserved.
