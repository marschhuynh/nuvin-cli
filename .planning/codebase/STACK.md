# Technology Stack

**Analysis Date:** 2026-03-19

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code in `packages/nuvin-core/src/`, `packages/nuvin-cli/source/`
- JavaScript (ES2022) - Compiled output, runtime execution

**Secondary:**
- Swift - macOS helper binary in `packages/nuvin-core/src/tools/computer/ax-helper/main.swift`
- YAML - Configuration files in `.nuvin/` directory
- JSON - Data serialization, package manifests

## Runtime

**Environment:**
- Node.js >=18 (engines requirement in `packages/nuvin-cli/package.json`)
- Node.js 22.11.0 (preferred version in `.nvmrc`)

**Package Manager:**
- pnpm 10 - Workspace monorepo manager
- Lockfile: `pnpm-lock.yaml` (present, 354KB)
- Workspace config: `pnpm-workspace.yaml`

## Frameworks

**Core:**
- React 19.2.1 - UI component framework for CLI interface
- Ink 6.6.7 (forked as `@nuvin/ink`) - React renderer for terminal UI
- @ai-sdk/anthropic 2.0.53 - Anthropic AI SDK integration
- @modelcontextprotocol/sdk 1.24.2 - MCP client implementation

**Testing:**
- Vitest 3.2.4 - Test runner with typechecking
- @testing-library/react 16.3.2 - Component testing utilities
- ink-testing-library 3.0.0 - Ink component testing
- Sinon 21.0.0 - Test doubles and spies

**Build/Dev:**
- TypeScript 5.9.3 - Type checking and compilation
- tsup 8.5.1 - TypeScript bundler (esbuild-based)
- @biomejs/biome 2.3.9 - Linting and formatting
- tsx 4.21.0 - TypeScript execution loader

## Key Dependencies

**Critical:**
- zod 4.2.1 - Schema validation and type inference
- yaml 2.8.2 - YAML parsing for configuration files
- vscode-jsonrpc 8.2.0 - JSON-RPC protocol for LSP
- vscode-languageserver-protocol 3.17.5 - LSP protocol types
- vscode-languageserver-types 3.17.5 - LSP type definitions

**Infrastructure:**
- cheerio 1.1.2 - HTML parsing for web fetch tool
- turndown 7.2.2 - HTML to Markdown conversion
- marked 15.0.12 - Markdown rendering in CLI
- ansi-escapes 7.2.0 - ANSI escape sequences for terminal
- chalk 5.6.2 - Terminal color formatting
- wrap-ansi 9.0.2 - ANSI string wrapping

**CLI Utilities:**
- meow 11.0.0 - CLI argument parser
- cli-highlight 2.1.11 - Syntax highlighting
- cli-spinners 3.3.0 - Loading spinners
- cli-table3 0.6.5 - Table formatting
- ink-big-text 2.0.0 - Large text rendering
- ink-gradient 3.0.0 - Gradient text effects
- ink-spinner 5.0.0 - Spinner component
- node-emoji 2.2.0 - Emoji support

## Configuration

**Environment:**
- Layered configuration system (global > workspace > explicit > env > CLI flags)
- Config locations: `~/.nuvin/config.yaml`, `./.nuvin/config.yaml`
- Profile-based configuration management
- Environment variables for API keys and tool settings

**Build:**
- TypeScript configs: `packages/nuvin-core/tsconfig.json`, `packages/nuvin-cli/tsconfig.json`
- tsup configs: `packages/nuvin-core/tsup.config.ts`, `packages/nuvin-cli/tsup.config.ts`
- Build scripts: `packages/nuvin-core/scripts/build.js`, `packages/nuvin-cli/scripts/build.js`
- Custom build steps: type check → tsup bundle → version generation → asset copying

**Linting:**
- Biome 2.3.9 for linting and formatting
- Config: `biome.json` (root level)
- Rules: recommended true, suspicious.noExplicitAny error, correctness.noUnusedImports off
- Formatting: 2-space indent, 120 char line width, single quotes

## Platform Requirements

**Development:**
- Node.js 22.11.0 (preferred)
- pnpm 10
- TypeScript 5.9.3
- Swift compiler (for macOS computer use feature)

**Production:**
- Node.js >=18 (runtime requirement)
- Unix-like OS for full feature support (bash tools, file operations)
- macOS for computer use features (Accessibility API)
- Terminal with ANSI support

---

*Stack analysis: 2026-03-19*
