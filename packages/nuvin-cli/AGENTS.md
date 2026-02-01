# AGENTS.md

This file provides guidance to Nuvin cli when working with code in this repository.

Overview

- Purpose: CLI for an interactive AI coding assistant implemented in TypeScript + React (Ink) that integrates an LLM orchestrator, multi-agent delegation, and extensible tool system.
- Primary language: TypeScript (ESM). Node >=18 is required.
- Monorepo context: This package lives under packages/nuvin-cli and depends on @nuvin/nuvin-core in the workspace.

Common commands

Use the repository root (nuvin-space) for workspace-level commands (pnpm). For package-local commands, run them from packages/nuvin-cli or via pnpm workspace scripts.

- Install dependencies (root):
  pnpm install

- Build
  pnpm -w build            # build all packages in the workspace
  pnpm --filter @nuvin/nuvin-cli build   # build only the CLI package
  npm run build            # when inside packages/nuvin-cli (uses node scripts/build.js)

- Development / watch
  pnpm -w dev              # run dev/watch for all packages
  pnpm --filter @nuvin/nuvin-cli dev     # watch build for CLI package
  pnpm run:dev             # run CLI entry in dev mode (tsx) from package
  pnpm run                 # see package.json for other scripts

- Run CLI
  nuvin                   # after building and installing globally or using npx
  npx @nuvin/nuvin-cli    # run without installing globally
  pnpm --filter @nuvin/nuvin-cli run:dev   # run the TypeScript entry directly
  pnpm --filter @nuvin/nuvin-cli run:prod  # run built dist/cli.js

- Tests
  pnpm -w test            # run all tests in workspace
  pnpm --filter @nuvin/nuvin-cli test      # run tests for this package
  npm test                 # from packages/nuvin-cli runs vitest
  Run a single test file:
  pnpm --filter @nuvin/nuvin-cli test -- tests/path/to/file.test.ts
  or from package dir:
  npm test -- tests/components/ChatDisplay.test.tsx

- Lint / Format
  pnpm --filter @nuvin/nuvin-cli lint
  pnpm --filter @nuvin/nuvin-cli format
  Or from package:
  pnpm exec biome lint
  pnpm exec biome format --changed --no-errors-on-unmatched --write .

- Clean
  pnpm --filter @nuvin/nuvin-cli run clean

Key scripts from packages/nuvin-cli/package.json

- build: node scripts/build.js
- dev: tsup --watch
- run:dev: npx tsx source/cli.tsx
- run:prod: node dist/cli.js
- test: vitest run
- lint: pnpm exec biome lint
- format: pnpm exec biome format --changed --no-errors-on-unmatched --write .

High-level architecture

- UI layer (React + Ink)
  - source/app.tsx: Main React app composition and top-level providers
  - source/cli.tsx: CLI entry that boots the React Ink app in terminal
  - components/: Modular, composable UI components (ChatDisplay, InputArea, ToolCallViewer, etc.) used to render the interactive TUI

- Orchestration & Agents
  - @nuvin/nuvin-core (workspace dependency) contains the core orchestrator engine, LLM provider adapters, and agent orchestration logic used by this package.
  - services/OrchestratorManager.ts, AgentCreator.ts, Orchestrator-related services under source/services/ manage agent lifecycle, delegation, and LLM interactions.
  - docs/agents.md documents the multi-agent system and is a good reference for delegation flows and available specialist agents in this package.

- Configuration & Profiles
  - source/config/: Configuration handlers, profile manager, and CLI-to-orchestrator bridging logic. Supports layered configuration (global, workspace, explicit). See docs/configuration.md for details.

- Tools & Integrations
  - Tool system supports file operations, web search/fetch, bash execution, and external MCP servers. The package exposes a tool registry and renderer components for tool approvals and tool calls.
  - MCP (Model Context Protocol) integration is implemented and documented in docs/mcp-integration.md

- Commands & Modules
  - source/modules/commands: Command registry and implementations. Commands can be component-backed or function-backed and are invoked from the CLI input.

- Services & Utilities
  - source/services/: Contains business logic services (ModelLimitsCache, TokenStorage, MCPServerManager, etc.).
  - source/utils/: Various helpers for parsing, formatting, event processing, and test utilities.

Testing conventions

- Tests use Vitest and are colocated under tests/ with .test.ts/.test.tsx suffixes.
- React components use ink-testing-library where appropriate.
- Run a specific test file with vitest or via npm script:
  pnpm --filter @nuvin/nuvin-cli test -- tests/components/ChatDisplay.test.tsx

Existing docs & notes for agents

- docs/agents.md: Good high-level explanation of the multi-agent system, delegation flow, and example workflows. Future Nuvin CLI instances should consult it when deciding to spawn or delegate to specialist agents.
- docs/development.md and README.md contain setup instructions and quick-starts; include environment variable notes for provider keys (OPENROUTER_API_KEY, ANTHROPIC_API_KEY, GITHUB_ACCESS_TOKEN).

CLAUDE.md

- None present in the repository. If you plan to add one, make it focused: provider-specific model recommendations, tokens/temperature defaults, and any proprietary prompt engineering conventions used by the project. Do not repeat general developer guidelines.

Cursor / Copilot rules

- No cursor rules (.cursor/rules) or GitHub Copilot instructions were found. If such files are added later, include their key rules in this AGENTS.md so agents inherit repository-specific editing constraints.

Notes for future Nuvin instances

- Always prefer workspace-aware pnpm commands when operating across packages (pnpm -w or pnpm --filter) to avoid partial builds.
- The CLI entrypoints differ between dev (tsx entry) and prod (dist/cli.js); use run:dev for rapid iteration and build/run for release testing.
- For changes impacting the orchestrator or agent prompts, check @nuvin/nuvin-core in the workspace for core prompt logic and provider adapters.

Contributions & Testing Checklist (concise)

- Run tests: pnpm --filter @nuvin/nuvin-cli test
- Lint & format: pnpm --filter @nuvin/nuvin-cli lint && pnpm --filter @nuvin/nuvin-cli format
- Build: pnpm --filter @nuvin/nuvin-cli build

