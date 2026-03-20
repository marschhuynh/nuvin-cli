# Codebase Structure

**Analysis Date:** 2025-03-19

## Directory Layout

```
nuvin-space-public/
├── packages/
│   ├── nuvin-core/          # Domain logic (no UI dependencies)
│   │   ├── src/
│   │   │   ├── orchestrator.ts
│   │   │   ├── ports.ts
│   │   │   ├── tools/       # Tool implementations
│   │   │   ├── llm-providers/
│   │   │   ├── mcp/         # Model Context Protocol
│   │   │   ├── memory/      # Memory storage and retrieval
│   │   │   ├── delegation/  # Multi-agent system
│   │   │   ├── hooks/       # Lifecycle hooks
│   │   │   ├── transports/  # HTTP retry logic
│   │   │   └── prompts/
│   │   └── dist/            # Build output
│   │
│   ├── nuvin-cli/           # Terminal UI and CLI glue
│   │   ├── source/
│   │   │   ├── cli.tsx      # Entry point
│   │   │   ├── app-virtualized.tsx
│   │   │   ├── components/  # React/Ink UI components
│   │   │   ├── contexts/    # React context providers
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── services/    # CLI-specific services
│   │   │   ├── adapters/    # Core-to-UI adapters
│   │   │   ├── config/      # Configuration management
│   │   │   ├── modules/     # Feature modules (commands)
│   │   │   └── utils/
│   │   └── dist/
│   │
│   └── ink/                 # Forked Ink library (React for CLI)
│
├── design/                  # Design documents and specs
├── docs/                    # Documentation
├── .changeset/              # Changelog management
├── .claude/                 # Claude AI agent configuration
├── scripts/                 # Build and utility scripts
└── package.json             # Monorepo root
```

## Directory Purposes

**`packages/nuvin-core/`:**
- Purpose: Core domain logic for AI agent orchestration
- Contains: Agent orchestrator, tool system, LLM providers, memory, delegation
- Key files: `orchestrator.ts`, `ports.ts`, `tools.ts`, `agent-registry.ts`
- Dependencies: External LLM APIs only (no UI dependencies)

**`packages/nuvin-core/src/tools/`:**
- Purpose: Individual tool implementations (file operations, bash, web, etc.)
- Contains: 20+ tools like `BashTool`, `FileReadTool`, `LspTool`, `WebSearchTool`
- Pattern: Each tool exports a class and optional schema/validator

**`packages/nuvin-core/src/llm-providers/`:**
- Purpose: LLM provider implementations (Anthropic, GitHub, OpenAI-compatible)
- Contains: `base-llm.ts`, `llm-anthropic-aisdk.ts`, `llm-github.ts`
- Pattern: Abstract `BaseLLM` class with provider-specific implementations

**`packages/nuvin-core/src/mcp/`:**
- Purpose: Model Context Protocol client and tool integration
- Contains: MCP client, OAuth flow, tool schema conversion
- Key files: `mcp-client.ts`, `mcp-oauth.ts`, `mcp-tools.ts`

**`packages/nuvin-core/src/delegation/`:**
- Purpose: Multi-agent delegation system
- Contains: Agent factory, delegation service, agent state management
- Key files: `delegation-service.ts`, `agent-factory.ts`

**`packages/nuvin-core/src/memory/`:**
- Purpose: Memory storage, retrieval, and extraction
- Contains: `memory-store.ts`, `memory-ranker.ts`, `memory-extractor.ts`

**`packages/nuvin-cli/source/`:**
- Purpose: Terminal UI and CLI-specific logic
- Contains: React components, hooks, services, configuration
- Entry point: `cli.tsx`

**`packages/nuvin-cli/source/components/`:**
- Purpose: Reusable React/Ink UI components
- Contains: `ChatDisplay`, `InputArea`, `Footer`, `MessageLine`, modals
- Pattern: Functional components with hooks for state and interactions

**`packages/nuvin-cli/source/contexts/`:**
- Purpose: React context providers for global state
- Contains: `ConfigContext`, `ThemeContext`, `ToolApprovalContext`, `InputContext`
- Pattern: Context + Provider hook pattern

**`packages/nuvin-cli/source/services/`:**
- Purpose: CLI-specific services (orchestrator management, MCP, memory)
- Contains: `OrchestratorManager`, `MCPServerManager`, `MemoryService`, `LLMFactory`
- Key files: `OrchestratorBuilder.ts`, `SendPipeline.ts`

**`packages/nuvin-cli/source/adapters/`:**
- Purpose: Adapt core events to UI messages
- Contains: `UIEventAdapter` (converts `AgentEvent` to `MessageLine`)

**`packages/nuvin-cli/source/config/`:**
- Purpose: Configuration management (profiles, providers, MCP servers)
- Contains: `ConfigManager`, profile handlers, MCP config
- Key files: `manager.ts`, `cli-handler.ts`, `mcp-handler.ts`

**`packages/nuvin-cli/source/modules/commands/`:**
- Purpose: Custom command system (user-defined commands)
- Contains: Command registry, definitions, hooks

**`packages/ink/`:**
- Purpose: Forked Ink library (React for terminal UIs)
- Note: Modified version of `vadimdemedes/ink`

## Key File Locations

**Entry Points:**
- `packages/nuvin-cli/source/cli.tsx`: CLI entry point, argument parsing, app rendering
- `packages/nuvin-cli/source/app-virtualized.tsx`: Main app component
- `packages/nuvin-core/src/index.ts`: Core package exports

**Configuration:**
- `packages/nuvin-cli/source/config/manager.ts`: ConfigManager class
- `packages/nuvin-cli/source/config/types.ts`: Configuration types
- `~/.nuvin/profiles/*/config.yaml`: User configuration files

**Core Logic:**
- `packages/nuvin-core/src/orchestrator.ts`: AgentOrchestrator (main coordinator)
- `packages/nuvin-core/src/ports.ts`: Port interfaces (LLMPort, ToolPort, etc.)
- `packages/nuvin-core/src/tools.ts`: ToolRegistry
- `packages/nuvin-core/src/agent-registry.ts`: Agent template management

**CLI Services:**
- `packages/nuvin-cli/source/services/OrchestratorManager.ts`: Orchestrator lifecycle
- `packages/nuvin-cli/source/services/OrchestratorBuilder.ts`: Orchestrator initialization
- `packages/nuvin-cli/source/services/SendPipeline.ts`: Message processing pipeline

**Testing:**
- `packages/nuvin-core/src/tests/`: Core tests (Vitest)
- `packages/nuvin-cli/source/**/*.test.ts`: CLI tests

## Naming Conventions

**Files:**
- TypeScript: `.ts` for logic, `.tsx` for React components
- Tests: `.test.ts` or `.spec.ts`
- Components: PascalCase (`ChatDisplay.tsx`, `InputArea.tsx`)
- Services: PascalCase (`OrchestratorManager.ts`)
- Hooks: camelCase with `use` prefix (`useOrchestrator.ts`, `useMessage.ts`)
- Utilities: camelCase (`eventProcessor.ts`, `git-context.ts`)
- Types: `types.ts` or `*-types.ts` (e.g., `agent-types.ts`)

**Directories:**
- Plural for collections (`components/`, `hooks/`, `tools/`, `services/`)
- Singular for unique items (`config/`, `adapters/`)

**Exports:**
- Default exports for React components
- Named exports for utilities and types
- Barrel exports (`index.ts`) for public APIs

## Where to Add New Code

**New Feature (Domain Logic):**
- Primary code: `packages/nuvin-core/src/` (create new directory if needed)
- Tests: `packages/nuvin-core/src/tests/` or co-located `*.test.ts`
- Export from: `packages/nuvin-core/src/index.ts` if public API

**New Feature (UI/CLI):**
- Components: `packages/nuvin-cli/source/components/`
- Hooks: `packages/nuvin-cli/source/hooks/`
- Services: `packages/nuvin-cli/source/services/`
- Tests: Co-located `*.test.ts` or in `test/` directory

**New Tool:**
- Implementation: `packages/nuvin-core/src/tools/{ToolName}Tool.ts`
- Schema: Add to `packages/nuvin-core/src/tools/tool-validators.ts`
- Types: Add to `packages/nuvin-core/src/tools/tool-params.ts`
- Metadata: Add to `packages/nuvin-core/src/tools/tool-result-metadata.ts`

**New LLM Provider:**
- Implementation: `packages/nuvin-core/src/llm-providers/llm-{provider}.ts`
- Register in: `packages/nuvin-core/src/llm-providers/index.ts`

**New Agent Template:**
- Definition: `packages/nuvin-cli/source/builtin-agents/{agent-name}.md`
- Or user-defined: `~/.nuvin/agents/{agent-name}.md`

**New Command:**
- Definition: `packages/nuvin-cli/source/modules/commands/definitions/{command}.ts`
- Register in: `packages/nuvin-cli/source/modules/commands/definitions/index.ts`

**Utilities:**
- Shared helpers: `packages/nuvin-cli/source/utils/`
- Core utilities: `packages/nuvin-core/src/utils/` (create if needed)

## Special Directories

**`packages/nuvin-core/dist/`:**
- Purpose: Build output for core package
- Generated: Yes
- Committed: No (gitignored)

**`packages/nuvin-cli/dist/`:**
- Purpose: Build output for CLI package
- Generated: Yes
- Committed: No (gitignored)

**`~/.nuvin/`:**
- Purpose: User data directory (profiles, sessions, agents)
- Generated: Yes (by CLI)
- Committed: No (user-local)

**`.nuvin/` (workspace):**
- Purpose: Workspace-local Nuvin data
- Generated: Yes
- Committed: Sometimes (project-specific config)

**`packages/ink/`:**
- Purpose: Forked Ink library
- Generated: No
- Committed: Yes (modified dependency)

**`.changeset/`:**
- Purpose: Changelog and version management
- Generated: Yes (by changeset CLI)
- Committed: Yes

---

*Structure analysis: 2025-03-19*
