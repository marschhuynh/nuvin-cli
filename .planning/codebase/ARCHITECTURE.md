# Architecture

**Analysis Date:** 2025-03-19

## Pattern Overview

**Overall:** Hexagonal (Ports and Adapters) Architecture with Event-Driven UI

**Key Characteristics:**
- Clean separation between domain logic (`@nuvin/nuvin-core`) and terminal UI (`@nuvin/nuvin-cli`)
- Port-based abstractions for external integrations (LLM providers, tools, memory, events)
- React/Ink-based terminal UI with virtualized rendering
- Multi-agent delegation with isolated contexts
- Event-driven communication between core and UI layers
- Pipeline-based message processing with middleware hooks

## Layers

**Domain Layer (`@nuvin/nuvin-core`):**
- Purpose: Core agent orchestration, tool execution, and business logic
- Location: `packages/nuvin-core/src/`
- Contains: Agent orchestrator, tool registry, LLM providers, memory system, delegation service
- Depends on: External LLM APIs, MCP servers, filesystem
- Used by: CLI layer via imported classes and interfaces

**UI/Presentation Layer (`@nuvin/nuvin-cli`):**
- Purpose: Terminal user interface and user interaction
- Location: `packages/nuvin-cli/source/`
- Contains: React/Ink components, contexts, hooks, services
- Depends on: `@nuvin/nuvin-core`, Ink (React for CLI), various terminal libraries
- Used by: End users via CLI command

**Adapter Layer:**
- Purpose: Bridge between domain events and UI rendering
- Location: `packages/nuvin-cli/source/adapters/`
- Contains: `UIEventAdapter` for converting agent events to UI messages
- Depends on: Core events, UI components
- Used by: App component to display agent activity

**Configuration Layer:**
- Purpose: Multi-level configuration management
- Location: `packages/nuvin-cli/source/config/`
- Contains: Profile management, provider config, MCP server config
- Depends on: Filesystem, environment variables
- Used by: Both core and CLI layers

## Data Flow

**User Message Flow:**

1. User types message in `InputArea` component
2. `useHandleSubmit` hook captures input and creates `UserMessagePayload`
3. `SendPipeline` preprocesses through middleware hooks:
   - Lazy session initialization
   - LLM refresh if model changed
   - Memory injection (retrieved memories)
   - Config application
   - Context window limit enforcement
4. `AgentOrchestrator.sendMessage()` processes the message
5. LLM provider generates completion (possibly with tool calls)
6. Tool execution via `ToolRegistry` → individual tools (BashTool, FileReadTool, etc.)
7. Events emitted through `EventPort` → `UIEventAdapter`
8. `UIEventAdapter.processAgentEvent()` converts events to `MessageLine` objects
9. React state updates trigger re-render of `ChatDisplay`
10. User sees streamed response and tool execution results

**Multi-Agent Delegation Flow:**

1. Agent invokes `AssignTool` with task description
2. `DelegationService` creates specialist agent via `AgentFactory`
3. New `AgentOrchestrator` instance spawned with isolated context
4. Sub-agent executes task and emits events
5. `UIEventAdapter` tracks sub-agent state separately
6. Sub-agent results returned as tool response to parent agent
7. Parent agent incorporates results into main conversation

**Memory Flow:**

1. During send: `MemoryToolWiring` queries `MemoryStore` for relevant memories
2. `MemoryRanker` ranks memories by semantic similarity
3. Top memories injected into system prompt
4. Agent processes with memory context
5. `MemoryExtractionTool` extracts new memories from responses
6. New memories saved to `MemoryStore` (persisted if session enabled)

## Key Abstractions

**Ports (Hexagonal Architecture):**
- Purpose: Interface boundaries for external dependencies
- Examples: `LLMPort`, `ToolPort`, `MemoryPort`, `EventPort`, `MetricsPort`
- Pattern: Define interfaces in core, implement in providers
- Location: `packages/nuvin-core/src/ports.ts`

**Agent Orchestrator:**
- Purpose: Central coordinator for agent-LLM interaction
- Location: `packages/nuvin-core/src/orchestrator.ts`
- Pattern: Manages message history, tool execution, event emission
- Key methods: `sendMessage()`, `reinit()`, `swapAgent()`

**Tool Registry:**
- Purpose: Dynamic tool registration and execution
- Location: `packages/nuvin-core/src/tools.ts`
- Pattern: Tools register with schemas, orchestrator invokes by name
- Examples: `BashTool`, `FileReadTool`, `LspTool`, `WebSearchTool`

**Event System:**
- Purpose: Decouple core logic from UI rendering
- Pattern: Core emits events → Adapter processes → UI updates
- Event types: `AssistantChunk`, `ToolStart`, `ToolOutput`, `StreamFinish`
- Location: `packages/nuvin-core/src/events.ts`, `packages/nuvin-cli/source/adapters/ui-event-adapter.tsx`

## Entry Points

**CLI Entry Point:**
- Location: `packages/nuvin-cli/source/cli.tsx`
- Triggers: `nuvin` command or `node dist/cli.js`
- Responsibilities:
  - Parse CLI arguments with `meow`
  - Initialize configuration
  - Render Ink app (`AppVirtualized` or `AppLegacy`)
  - Setup global error handlers

**Core Entry Point:**
- Location: `packages/nuvin-core/src/index.ts`
- Triggers: Imported by CLI package
- Responsibilities: Export all public APIs for CLI consumption

**App Component:**
- Location: `packages/nuvin-cli/source/app-virtualized.tsx`
- Triggers: Rendered by Ink
- Responsibilities:
  - Setup React contexts (Config, Theme, Input, ToolApproval)
  - Initialize orchestrator via `useOrchestrator` hook
  - Manage message state and UI layout
  - Handle keyboard input and focus management

## Error Handling

**Strategy:** Multi-layer error handling with graceful degradation

**Patterns:**
- **Tool-level:** Tools return `{ success: false, error: ... }` results
- **Orchestrator-level:** Errors emitted as `ErrorEvent` via EventPort
- **Transport-level:** Retry logic in `RetryTransport` with exponential backoff
- **UI-level:** `ErrorBoundary` component catches React errors
- **Global-level:** Process handlers for `uncaughtException` and `unhandledRejection`

**Error Classification:**
- Retryable errors (network timeouts, rate limits) → automatic retry
- Non-retryable errors (auth failures, invalid params) → immediate error response
- Tool execution errors → returned as tool results, not exceptions

## Cross-Cutting Concerns

**Logging:** 
- Approach: Event-based via `EventPort` with `PersistingConsoleEventPort`
- HTTP requests logged to `.nuvin/sessions/{id}/http.log`
- Console events persisted to `.nuvin/sessions/{id}/console.jsonl`

**Validation:**
- Tool parameters validated with Zod schemas (`tool-validators.ts`)
- Configuration validated on load
- Type safety throughout with TypeScript

**Authentication:**
- Provider-specific: API keys, OAuth (Anthropic)
- Stored in: `~/.nuvin/profiles/{profile}/credentials.json`
- OAuth tokens managed by `TokenStorage` service

**Session Management:**
- Sessions stored in: `~/.nuvin/sessions/` or workspace `.nuvin/sessions/`
- Each session has: `console.jsonl`, `http.log`, `state.json`, `memory.json`
- Session resumption via `--resume` flag or interactive selection

**Configuration:**
- Layered: Global → Profile → Workspace → CLI flags
- Profiles managed by `ConfigManager`
- Supports: Multiple providers, models, MCP servers per profile

---

*Architecture analysis: 2025-03-19*
