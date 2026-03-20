# External Integrations

**Analysis Date:** 2026-03-19

## APIs & External Services

**LLM Providers:**
- Anthropic Claude - Primary AI model provider
  - SDK: `@ai-sdk/anthropic` 2.0.53
  - Auth: API key via `ANTHROPIC_API_KEY` env var or OAuth
  - Implementation: `packages/nuvin-core/src/llm-providers/llm-anthropic-aisdk.ts`
  - Transport: `packages/nuvin-core/src/transports/anthropic-transport.ts`
  - Base URL: `https://api.anthropic.com/v1`
  - OAuth client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`

- GitHub Copilot Models - GitHub-hosted AI models
  - Auth: GitHub access token via `GITHUB_ACCESS_TOKEN` env var
  - Implementation: `packages/nuvin-core/src/llm-providers/llm-github.ts`
  - Transport: `packages/nuvin-core/src/transports/github-transport.ts`
  - Token exchange: `https://api.github.com/copilot_internal/v2/token`
  - Base URL: `https://api.individual.githubcopilot.com` (dynamic from token response)

- OpenRouter - Multi-model routing service
  - Auth: API key via `OPENROUTER_API_KEY` env var
  - Implementation: Generic OpenAI-compatible provider
  - Base URL: `https://openrouter.ai/api/v1`
  - Config: `packages/nuvin-core/src/llm-providers/llm-provider-config.json`

- DeepInfra - Model hosting platform
  - Auth: API key via `DEEPINFRA_API_KEY` env var
  - Base URL: `https://api.deepinfra.com/v1/openai`
  - Models: Meta-Llama-3.1-70B-Instruct, Meta-Llama-3.1-8B-Instruct

- ZAI - Chinese AI provider
  - Auth: API key via `ZAI_API_KEY` env var
  - Base URL: `https://api.z.ai/api/anthropic/v1`
  - Models: glm-5, glm-4.7, glm-4.6, glm-4.5

- Moonshot - Kimi AI models
  - Auth: API key via `MOONSHOT_API_KEY` env var
  - Base URL: `https://api.moonshot.ai/v1`
  - Models: kimi-latest, kimi-k2-thinking

- Kimi for Coding - Specialized coding models
  - Auth: API key via `KIMI_API_KEY` env var
  - Base URL: `https://api.kimi.com/coding/v1`

- MiniMax - Chinese AI provider
  - Auth: API key via `MINIMAX_API_KEY` env var
  - Base URL: `https://api.minimax.io/anthropic/v1`
  - Models: MiniMax-M2.1 (200K context, 16K max output)

**Web Services:**
- Google Custom Search API - Web search functionality
  - Auth: `GOOGLE_CSE_KEY` and `GOOGLE_CSE_CX` env vars
  - Implementation: `packages/nuvin-core/src/tools/WebSearchTool.ts`
  - Used by: WebSearchTool for web search queries

## Data Storage

**Databases:**
- None (stateless CLI application)

**File Storage:**
- Local filesystem - Primary storage for conversations, configs, and code
  - Implementation: Node.js `fs` and `fs/promises` modules
  - Conversation store: `packages/nuvin-core/src/conversation-store.ts`
  - Config locations: `~/.nuvin/`, `./.nuvin/`

**Caching:**
- Anthropic prompt caching - Supported for compatible providers
  - Providers: Anthropic, OpenRouter, Kimi
  - Implementation: LLM provider abstraction layer

## Authentication & Identity

**Auth Provider:**
- Custom multi-provider authentication system
  - Implementation: `packages/nuvin-core/src/transports/`
  - API key authentication for most providers
  - OAuth flow for Anthropic (with token refresh)
  - Bearer token exchange for GitHub Copilot

**OAuth Support:**
- Anthropic OAuth 2.0
  - Token endpoint: `https://console.anthropic.com/v1/oauth/token`
  - Grant type: refresh_token
  - Auto-refresh on 401/403 responses
  - Callback support via `onTokenUpdate`

## Monitoring & Observability

**Error Tracking:**
- None (local CLI application)

**Logs:**
- Console-based logging
- Debug output via environment variables
- No centralized logging service

## CI/CD & Deployment

**Hosting:**
- npm registry - Package distribution
  - Packages: `@nuvin/nuvin-cli`, `@nuvin/nuvin-core`, `@nuvin/ink`
  - Access: Public
  - Publisher: Changesets

**CI Pipeline:**
- GitHub Actions
  - Workflow files: `.github/workflows/ci.yml`, `.github/workflows/publish.yml`
  - Jobs: build, lint, test-cli, test-core
  - Node version: 22
  - pnpm version: 10
  - Caching: node_modules, build artifacts

**Release Automation:**
- Changesets - Version management and publishing
  - Config: `.changeset/`
  - Commands: `changeset version`, `changeset publish`
  - Changelog generation: `scripts/changelog.js`

## Environment Configuration

**Required env vars:**
- `ANTHROPIC_API_KEY` - Anthropic API key
- `OPENROUTER_API_KEY` - OpenRouter API key
- `GITHUB_ACCESS_TOKEN` - GitHub personal access token
- `DEEPINFRA_API_KEY` - DeepInfra API key
- `ZAI_API_KEY` - ZAI API key
- `MOONSHOT_API_KEY` - Moonshot API key
- `KIMI_API_KEY` - Kimi API key
- `MINIMAX_API_KEY` - MiniMax API key

**Optional env vars:**
- `GOOGLE_CSE_KEY` - Google Custom Search API key (for web search)
- `GOOGLE_CSE_CX` - Google Programmable Search Engine ID
- `NUVIN_COMPUTER_USE` - Enable macOS computer use (set to "1")
- `SKIP_TYPE_CHECK` - Skip TypeScript type checking during build

**Secrets location:**
- Environment variables only
- No secrets committed to repository
- `.env` files not tracked in git (see `.gitignore`)

## Webhooks & Callbacks

**Incoming:**
- None (CLI application, no server)

**Outgoing:**
- HTTP requests to LLM provider APIs
- HTTP requests to MCP servers (if HTTP-based)
- HTTP requests to Google Custom Search API

## Model Context Protocol (MCP)

**MCP Client:**
- Implementation: `packages/nuvin-core/src/mcp/mcp-client.ts`
- SDK: `@modelcontextprotocol/sdk` 1.24.2
- Transport types: HTTP, stdio
- Auth types: none, bearer, oauth

**MCP Capabilities:**
- Tool discovery and listing
- Tool execution
- Authentication support (bearer tokens, OAuth)
- Connection timeout handling (30s default)

**MCP Server Management:**
- CLI commands: `nuvin mcp list`, `nuvin mcp add`, `nuvin mcp test`, `nuvin mcp enable|disable`
- Configuration: Stored in Nuvin config files
- Used by: Agent system for extending tool capabilities

## Language Server Protocol (LSP)

**LSP Client:**
- Implementation: `packages/nuvin-cli/source/services/lsp/client.ts`
- Library: `vscode-jsonrpc` 8.2.0
- Protocol: `vscode-languageserver-protocol` 3.17.5

**LSP Features:**
- Go to definition
- Find references
- Hover information
- Diagnostics (real-time error reporting)
- Language detection: `packages/nuvin-cli/source/services/lsp/language.js`

**LSP Integration:**
- Used by: LspTool for code intelligence
- Communication: stdio (JSON-RPC over streams)
- Connection management: Automatic server lifecycle

## Platform-Specific Integrations

**macOS (Computer Use):**
- Accessibility API - UI automation and screen reading
  - Implementation: `packages/nuvin-core/src/tools/computer/macos-backend.ts`
  - Helper binary: `packages/nuvin-core/src/tools/computer/ax-helper/main.swift`
  - Features: Snapshot, press, set_value, type, key, scroll, screenshot
  - Build: `make ax-helper` (requires Swift compiler)
  - Binary location: `~/.nuvin/bin/ax-helper`

**Cross-Platform:**
- File system operations - Node.js `fs` module
- Process execution - Node.js `child_process` module
- Terminal control - ANSI escape sequences, Ink rendering

## Web Content Processing

**HTML Parsing:**
- cheerio 1.1.2 - jQuery-like HTML parsing
- Used by: WebFetchTool for extracting content from web pages

**Markdown Conversion:**
- turndown 7.2.2 - HTML to Markdown converter
- Used by: WebFetchTool for converting HTML to Markdown
- marked 15.0.12 - Markdown to HTML renderer
- Used by: CLI for displaying Markdown content

---

*Integration audit: 2026-03-19*
