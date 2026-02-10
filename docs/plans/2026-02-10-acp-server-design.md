# ACP Server for Nuvin CLI - Design

**Date:** 2026-02-10

## Goal
Implement an Agent Client Protocol (ACP) server for Nuvin CLI that runs headless over stdio, reuses the same config resolution as the CLI, streams updates via the existing eventBus, and supports `session/load` with history replay. First version is **hybrid**: local Nuvin tools for filesystem/terminal operations (no ACP client proxy).

## Scope
In scope:
- JSON-RPC over stdio using ACP newline-delimited framing
- `initialize`, `session/new`, `session/load`, `session/prompt`, `session/cancel`
- `session/update` streaming of messages, tool calls, and tool results
- `session/set_config_option` and `config_options_update` (subset mapped to Nuvin config)
- tool approval flow via ACP `session/request_permission` / `session/response_permission`
- history replay for persisted sessions

Out of scope (v1):
- Proxying filesystem/terminal to ACP client
- Unsaved editor buffer visibility
- Multi-session concurrency in a single ACP process

## Architecture
### Entry Point
Add a new CLI mode (e.g. `--acp`) that bypasses Ink UI and starts an ACP server. The server owns:
- JSON-RPC reader/writer (newline-delimited)
- Session registry (single active session in v1)
- OrchestratorManager instance
- ACP <-> eventBus bridge

### Config Resolution
Use `ConfigManager.load()` with the same precedence as CLI: global < local < explicit < env < direct. ACP `session/set_config_option` maps to direct overrides for the life of the process.

### Session Lifecycle
- `initialize` captures client capabilities and returns `agentCapabilities` and `agentInfo`.
- `session/new`:
  - choose `cwd` (client provided or process cwd)
  - initialize OrchestratorManager with config
  - create a new conversation and return `sessionId` + metadata
- `session/load`:
  - if memPersist enabled, replay `history.cli.json` for the requested session id
  - stream updates via `session/update` and return session details
- `session/prompt`:
  - translate ACP ContentBlocks to Nuvin `UserMessagePayload`
  - call `OrchestratorManager.send()` with streaming enabled
  - stream `session/update` notifications
  - return final response with `stopReason`
- `session/cancel`:
  - abort active prompt via `AbortController`

## Event Mapping (eventBus -> ACP session/update)
ACP updates are driven by `eventBus` `agent:event` events (emitted by UIEventAdapter):
- MessageStarted -> user message chunk
- AssistantChunk -> agent message chunk
- AssistantMessage -> final agent message
- ToolCalls -> tool_call
- ToolResult -> tool_call_update
- Error -> error update

Tool approval:
- ToolCalls with `requiresApproval` emit `session/request_permission`
- ACP `session/response_permission` maps to `orchestrator.handleToolApproval(...)`

## Content Mapping
- Text blocks -> message text
- Image blocks -> attachments for `UserMessagePayload`
- Resource blocks -> append as labeled embedded context (plain text) in prompt

## Error Handling
- JSON-RPC request errors return proper RPC error responses
- Streaming failures emit `session/update` error and finalize prompt with `stopReason: error`

## Testing
- Integration test: spawn ACP server, send `initialize`, `session/new`, `session/prompt`, assert:
  - at least one `agent_message_chunk`
  - final response with `stopReason`
- Optional: session/load replay test for persisted histories

## Open Questions
- Which ACP config options should map 1:1 to Nuvin config?
- Should we expose ACP `promptCapabilities.image` only if image tool is enabled?
- Do we need to persist ACP session metadata separately from Nuvin history?
