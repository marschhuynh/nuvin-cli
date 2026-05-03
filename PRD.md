# Product Requirements Document: Nuvin CLI

## Product Overview

**Product Vision:** Nuvin CLI is a headless, extensible agentic coding assistant for the terminal — a TypeScript-first toolkit whose middleware-based loop can be composed, intercepted, and embedded into any host application without sacrificing a polished React/Ink TUI experience.

**Target Users:**
- Primary: Software engineers and tooling authors who want a programmable, scriptable agent that runs locally in the terminal.
- Secondary: Platform/infra teams embedding `@nuvin/agent-core` as a headless engine inside CI, bots, or custom UIs.

**Business Objectives:**
- Establish `@nuvin/agent-core` as a reference open architecture for agentic loops (interfaces-first, FP-first).
- Drive adoption through a best-in-class TUI (`@nuvin/cli`) demonstrating the engine's capabilities.
- Enable a plugin ecosystem (tools, providers, skills, MCP servers) without core forks.

**Success Metrics:**
- Installs and weekly active CLI sessions.
- Number of community-contributed plugins, providers, and tools.
- Mean turns-per-session and tool-approval acceptance rate.
- p95 first-token latency and end-of-turn latency.
- Test coverage and zero-regression rate across milestones.

## User Personas

### Persona 1: "Riley" — The Power CLI Developer
- **Demographics:** Senior engineer, 28–45, lives in tmux + editor, fluent in TypeScript.
- **Goals:** Pair with an agent on real codebases; control approvals; script repeatable workflows.
- **Pain Points:** GUI-only assistants disrupt flow; opaque agents hide tool calls; lack of extensibility.
- **User Journey:** Installs `nuvin`, configures providers, runs in repo, approves tools, extends via `loopMiddleware.use()`.

### Persona 2: "Sam" — The Platform/Tooling Engineer
- **Demographics:** Staff engineer building internal devtools and bots.
- **Goals:** Embed an agentic loop into CI, internal chatops, or a custom UI; swap providers; add org-specific tools.
- **Pain Points:** Frameworks that conflate UI with engine; heavy dependencies; brittle abstractions.
- **User Journey:** Imports `@nuvin/agent-core`, registers custom tools/providers, hooks events, ships internally.

### Persona 3: "Jordan" — The Curious Power User
- **Demographics:** Developer/tech lead exploring agentic workflows.
- **Goals:** Understand what the agent is doing; resume sessions; use slash commands and skills.
- **Pain Points:** Black-box behavior; lost context between runs; no inspectability.
- **User Journey:** Launches TUI, browses streamed thinking, opens WebSocket event viewer, resumes prior sessions.

## Feature Requirements

| Feature | Description | User Stories | Priority | Acceptance Criteria | Dependencies |
|---|---|---|---|---|---|
| **Headless Engine (`@nuvin/agent-core`)** | Composable middleware pipeline over immutable `TurnContext` with typed event bus. | As a tooling engineer, I embed the loop into my host. | Must | End-to-end run without UI deps; `TurnContext` immutability enforced in dev. | TypeScript, Zod |
| **Extensible Inner Loop** | `loopMiddleware.use()` registers middleware between built-in stages. | As Riley, I intercept before-request and after-response. | Must | `use()` throws post-lock; 3 interception boundary tests pass. | Core pipeline |
| **React/Ink TUI (`@nuvin/cli`)** | Full-screen TUI: virtualized history, multi-line input, markdown, approvals, abort. | As Jordan, I want a polished terminal UX. | Must | All 8 message roles render; abort + approval via keyboard. | @nuvin/ink, Zustand |
| **Multi-Provider Support** | Config-driven registry: `anthropic`, `openai`, `zai`, `zai-api`, `mock`. | As Sam, I add a provider via JSON. | Must | New provider added with no TS changes; streaming + tool calls work. | `providers.json` |
| **Built-in Tools (7)** | `file_read`, `file_new`, `file_edit`, `bash_tool`, `grep_tool`, `glob_tool`, `ls_tool`. | As Riley, I want safe file/shell ops with approval. | Must | Path traversal blocked; approval gating works; abort returns `errResult`. | Tool registry |
| **Tool Approval UX** | Promise-based approval queue with TUI overlay. | As Riley, I allow/deny each tool call. | Must | Approve/deny via keyboard; headless-compatible queue. | Core, Ink |
| **Streaming + Thinking Display** | Streamed tokens, thinking blocks, parallel tool dispatch. | As Jordan, I see what the agent is doing live. | Must | Streaming renders incrementally; thinking visually distinct. | LLM adapters |
| **Abort & Exit Controls** | Esc×2 abort current turn; Ctrl+C×2 exit. | As Riley, I cancel a runaway turn instantly. | Must | Abort returns `errResult`; bash uses SIGTERM→1s→SIGKILL. | Core, Ink |
| **WebSocket Event Viewer** | Localhost-only, token-auth WS for live `EventBus` inspection. | As Sam, I debug agent runs externally. | Should | Token-auth required; events emitted in real time. | Core EventBus |
| **Plugin System** | Discover from npm + local dirs; register tools/providers/event handlers. | As Sam, I distribute org tools via npm. | Should | Plugins load at startup; failures isolated; manifest validated. | `PluginManifest` |
| **Session Persistence** | Save/resume conversations across restarts. | As Jordan, I resume yesterday's session. | Should | Sessions persist to disk; resume restores history + state. | Storage adapter |
| **Layered Config** | CLI flags > env vars > workspace > global. | As Riley, I override per-repo settings. | Should | Resolution order documented; precedence tested. | Config loader |
| **Slash Commands** | `/help`, `/new`, `/clear`, `/exit`, `/models`, `/history`. | As Jordan, I control the session inline. | Should | Each command works in TUI; tab-completion available. | TUI input |
| **Specialist Sub-Agents** | Forked contexts with own tools/instructions. | As Riley, I delegate sub-tasks. | Could | Sub-agent runs isolated; results merge back. | Core, tools |
| **Skills System** | Reusable markdown instruction packages. | As Jordan, I install skills like extensions. | Could | Skills discoverable and composable; loaded into prompt. | Plugin system |
| **Long-Term Memory** | BM25-indexed topic storage. | As Jordan, I want the agent to recall prior work. | Could | Memory persists across sessions; retrieval tested. | `MemoryPort` |
| **Hooks System** | Shell scripts intercepting lifecycle events. | As Sam, I gate tool calls via shell. | Could | Hooks run at lifecycle points; non-zero exit blocks. | EventBus |
| **MCP Integration** | stdio + HTTP MCP servers. | As Sam, I plug ecosystem MCP servers. | Could | MCP tools listed and callable; transport tests pass. | Plugin system |
| **LSP Integration** | Code intelligence via LSP. | As Riley, I want symbol-aware edits. | Could | LSP tool calls return symbols/diagnostics. | LSP client |
| **Context Compaction** | Observation masking + windowed history. | As Jordan, long sessions stay coherent. | Could | Compaction reduces tokens without breaking turns. | Core |
| **Web Search Tool** | Google CSE-backed search. | As Riley, the agent can look things up. | Could | Search returns ranked results; rate-limited. | External API |
| **Vim Mode in TextInput** | Normal/insert modes, motions. | As Riley, I edit input vim-style. | Won't (now) | Deferred. | Ink input |
| **Paste Detection** | Bracketed paste mode. | As Jordan, large pastes don't break input. | Could | Paste batched as a single insert. | Ink input |
| **Thinking Block Toggle** | Collapse/expand thinking sections. | As Jordan, I declutter the view. | Could | Toggle via keyboard; state persists per turn. | TUI |

## User Flows

### Flow 1: First-Time Setup
1. User installs `nuvin` (`pnpm dlx` or global install).
2. User sets API keys via env vars or config file.
3. User runs `nuvin` in a project directory.
4. TUI launches; footer shows model, memory, working directory.
   - Alternative: missing API key → friendly error with config instructions.
   - Error state: invalid provider name → list available providers.

### Flow 2: Single Turn With Tool Approval
1. User types a request and submits.
2. Agent streams thinking + assistant text.
3. Agent requests a tool (e.g., `file_edit`); approval overlay appears.
4. User approves or denies via keyboard.
   - Alternative: deny → agent receives denial, replans.
   - Error state: tool fails → `errResult` shown; agent decides next action.
5. Agent finalizes response; turn ends.

### Flow 3: Abort & Exit
1. During a long turn, user presses Esc once (warning), then Esc again.
2. Loop aborts; in-flight tools terminated; results persisted as errors.
3. User can submit a new turn immediately.
   - To exit: Ctrl+C×2 cleanly shuts down.

### Flow 4: Embedding `@nuvin/agent-core` (Sam)
1. Sam imports `createLoopMiddleware()` and `loopMiddleware.use()`.
2. Registers custom tools/providers and event subscribers.
3. Calls the pipeline programmatically and consumes events.
   - Error state: `use()` after first turn → `MiddlewareRegistrationError`.

## Non-Functional Requirements

### Performance
- **First-token latency:** p95 ≤ provider baseline + 100ms overhead.
- **TUI render frequency:** EventBus → store batched at 16ms.
- **Concurrent tools:** parallel dispatch via `Promise.all`.

### Security
- **Authentication:** API keys via env or config; never logged.
- **Authorization:** Tool approval gating for all side-effecting tools.
- **Data Protection:** Path traversal protection; WS endpoint localhost-only with token auth.
- **Reference:** See "Full Stack Security Guide for Vibe Coders 🛡️" for cross-cutting security practices.

### Compatibility
- **Runtime:** Node.js 20+.
- **OS:** macOS, Linux; Windows via WSL (best-effort native).
- **Terminals:** Modern terminals supporting truecolor + Unicode (iTerm2, Alacritty, Kitty, Windows Terminal).

### Accessibility
- **Compliance:** Keyboard-only operation across the entire TUI.
- **Specifics:** No mouse-required interactions; high-contrast theme path; screen-reader friendly output mode (future).

## Technical Specifications

### Frontend (TUI)
- **Stack:** React 19, `@nuvin/ink` (Ink v6 fork), Zustand.
- **Design system:** ThemeContext + StdoutDimensionsContext.
- **Responsive:** FlexLayout adapts to terminal width/height.

### Backend / Engine
- **Stack:** TypeScript strict, ESM-only, Zod 4.
- **Architecture:** Koa-style middleware pipeline; immutable `TurnContext`; typed `EventBus`.
- **Providers:** Anthropic, OpenAI-compatible, Zai, Zai-API, Mock — via `providers.json`.

### Infrastructure
- **Build:** tsup (ESM) per package; pnpm workspaces.
- **Testing:** vitest unit/integration; @microsoft/tui-test E2E in real PTY.
- **Distribution:** npm-published packages; `nuvin` CLI binary.

## Analytics & Monitoring

- **Key Metrics:** turn count, tool usage, abort frequency, provider error rate, p95 latency.
- **Events:** all `EventBus` events (`loop:*`, `llm:*`, `tool:*`, `stage:*`).
- **Dashboards:** opt-in local dashboards via WS event viewer; org-side via embedded host.
- **Alerting:** N/A in CLI; consumers wire alerting via event subscribers.

## Release Planning

### MVP (v1.0) — Shipped
- **Features:** Monorepo, pipeline, EventBus, 4 providers, 7 tools, readline REPL, approval, abort.
- **Success Criteria:** Full agentic loop runs end-to-end with streaming + tool calls.

### v2.0 — Shipped
- **Features:** Full React/Ink TUI, virtualized history, markdown, ToolCallViewer, WS event viewer, E2E tests.

### v2.1 — Shipped (2026-04-15)
- **Features:** Extensible inner loop with `loopMiddleware.use()`; per-iteration metadata; iteration events.

### v2.1+ (Active Backlog)
- Plugin system, session persistence, layered config, slash commands, specialist agents, skills, long-term memory, hooks, MCP, LSP, context compaction, web search, paste detection, thinking toggle.

## Open Questions & Assumptions

- **Question 1:** Plugin distribution channel — npm only, or also a curated registry?
- **Question 2:** Session storage format — JSONL, SQLite, or pluggable?
- **Question 3:** How are skills versioned and resolved across workspace/global scopes?
- **Assumption 1:** Users have Node.js 20+ and a modern terminal.
- **Assumption 2:** Users provide their own provider API keys.
- **Assumption 3:** Headless core is sufficient for non-TUI hosts without a separate SDK package.

## Appendix

### Competitive Analysis
- **Claude Code / Codex CLI:** Strong UX, vendor-locked loop; Nuvin differentiates via headless core + extensibility.
- **Aider:** Strong git-aware editing; Nuvin offers broader tool/provider extensibility and a typed event model.
- **LangChain agents:** Heavy abstractions; Nuvin keeps providers behind thin ports.

### User Research Findings
- Power users demand visibility into thinking and tool calls.
- Approval friction must be low (single keypress) or users disable safety entirely.
- Embedding teams reject frameworks that bundle UI with engine.

### AI Conversation Insights
- **AI-Generated Edge Cases:** mid-stream abort, denied tool replan loop, provider 429 backoff, multi-tool partial failure, terminal resize during render.
- **AI-Suggested Improvements:** explicit middleware lock semantics; iteration-level metadata; event ownership tables.

### Glossary
- **TurnContext:** Immutable per-turn context flowing through the middleware pipeline.
- **EventBus:** Typed pub/sub channel emitting lifecycle events (`loop:*`, `llm:*`, `tool:*`).
- **loopMiddleware.use():** Extension point registering middleware inside the inner agentic loop.
- **Approval Queue:** Promise-based push/pull queue gating tool execution.

---
*Generated from `prd-guide.md` template; tailored to the Nuvin CLI project state as of v2.1.*
