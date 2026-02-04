# ACP Integration Guide

Nuvin supports the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) for seamless integration with code editors like Zed and JetBrains IDEs. This enables you to use Nuvin as an AI coding assistant directly within your development environment.

## What is ACP?

The Agent Client Protocol (ACP) is a standardized JSON-RPC 2.0 protocol for communication between code editors and AI coding agents. It provides:

- **Unified Interface**: A single protocol for all editors to communicate with AI agents
- **Streaming Responses**: Real-time token-by-token output as the AI generates responses
- **Tool Execution**: Structured display of file operations, command execution, and search
- **Permission Handling**: Interactive approval for sensitive operations
- **Session Management**: Maintain conversation context across multiple prompts

ACP eliminates the need for editor-specific integrations, allowing Nuvin to work with any ACP-compatible client.

## Quick Start

Run Nuvin as an ACP server:

```bash
nuvin --acp
```

This starts Nuvin in server mode, listening for JSON-RPC messages over stdio. The server will:

1. Accept an `initialize` request from the client
2. Create sessions via `session/new`
3. Process prompts and stream responses
4. Handle tool execution with permission requests

> **Note**: When running in ACP mode, Nuvin doesn't display a terminal UI—all communication happens through the protocol.

## Editor Configuration

### Zed

Add Nuvin as an agent in your Zed settings (`~/.config/zed/settings.json`):

```json
{
  "agent": {
    "profiles": {
      "nuvin": {
        "name": "Nuvin",
        "provider": {
          "type": "acp",
          "command": "nuvin",
          "args": ["--acp"]
        }
      }
    },
    "default_profile": "nuvin"
  }
}
```

If Nuvin is installed locally in a project:

```json
{
  "agent": {
    "profiles": {
      "nuvin-local": {
        "name": "Nuvin (Local)",
        "provider": {
          "type": "acp",
          "command": "npx",
          "args": ["@nuvin/nuvin-cli", "--acp"]
        }
      }
    }
  }
}
```

### JetBrains IDEs

Configure Nuvin in your JetBrains IDE settings:

1. Open **Settings** → **Tools** → **AI Assistant** (or **Agent**)
2. Add a new agent configuration:
   - **Name**: Nuvin
   - **Type**: ACP
   - **Command**: `nuvin`
   - **Arguments**: `--acp`
3. Set as default or select when needed

Alternatively, add to your IDE's `agents.xml` configuration:

```xml
<agent
  name="Nuvin"
  type="acp"
  command="nuvin"
  arguments="--acp"
/>
```

### VS Code (with ACP Extension)

If using an ACP-compatible extension:

```json
{
  "acp.agents": [
    {
      "name": "Nuvin",
      "command": "nuvin",
      "args": ["--acp"]
    }
  ]
}
```

## Supported Features

| Feature | Status | Notes |
|---------|--------|-------|
| Text prompts | ✅ Supported | Full conversation context |
| Image attachments | ✅ Supported | Base64-encoded images |
| Streaming responses | ✅ Supported | Token-by-token streaming |
| Thinking/reasoning display | ✅ Supported | Extended thinking visible |
| Tool execution | ✅ Supported | All Nuvin tools available |
| Tool approval | ✅ Supported | Interactive permission requests |
| Cancellation | ✅ Supported | Cancel ongoing operations |
| Multiple sessions | ✅ Supported | Concurrent conversations |
| MCP servers | ✅ Supported | Via session configuration |
| Session persistence | ⏳ Coming soon | Resume previous sessions |
| Audio content | ❌ Not supported | Text and images only |
| Custom modes | ⏳ Coming soon | Agent modes (code, architect) |

## Protocol Flow

The following sequence diagram illustrates a typical ACP conversation:

```
┌────────┐                                   ┌────────┐
│ Editor │                                   │ Nuvin  │
│ (Client)│                                   │ (Agent)│
└───┬────┘                                   └───┬────┘
    │                                            │
    │  initialize(protocolVersion, clientInfo)   │
    │───────────────────────────────────────────►│
    │                                            │
    │  {protocolVersion, agentInfo, capabilities}│
    │◄───────────────────────────────────────────│
    │                                            │
    │  session/new(cwd, mcpServers?)             │
    │───────────────────────────────────────────►│
    │                                            │
    │  {sessionId}                               │
    │◄───────────────────────────────────────────│
    │                                            │
    │  prompt(sessionId, prompt)                 │
    │───────────────────────────────────────────►│
    │                                            │
    │  [notification] session/update             │
    │  (agent_message_chunk)                     │
    │◄───────────────────────────────────────────│
    │                                            │
    │  [notification] session/update             │
    │  (tool_call: file_read)                    │
    │◄───────────────────────────────────────────│
    │                                            │
    │  permission/request                        │
    │  (approve file edit?)                      │
    │◄───────────────────────────────────────────│
    │                                            │
    │  {selectedOption: "approve"}               │
    │───────────────────────────────────────────►│
    │                                            │
    │  [notification] session/update             │
    │  (tool_call_update: completed)             │
    │◄───────────────────────────────────────────│
    │                                            │
    │  {stopReason: "end_turn"}                  │
    │◄───────────────────────────────────────────│
    │                                            │
```

### Key Protocol Messages

| Method | Direction | Description |
|--------|-----------|-------------|
| `initialize` | Client → Agent | Initialize connection, exchange capabilities |
| `session/new` | Client → Agent | Create new conversation session |
| `prompt` | Client → Agent | Send user prompt to agent |
| `cancel` | Client → Agent | Cancel ongoing operation |
| `session/update` | Agent → Client | Stream updates (text, tool calls) |
| `permission/request` | Agent → Client | Request user approval for tool |
| `shutdown` | Client → Agent | Gracefully close the server |

## Troubleshooting

### Viewing Logs

When running in ACP mode, Nuvin logs to stderr so they don't interfere with the JSON-RPC communication:

```bash
# Redirect stderr to a file for debugging
nuvin --acp 2> nuvin-acp.log

# Or in your editor config, capture stderr
```

### Common Issues

#### "Server not responding"

**Symptoms**: Editor shows connection timeout or no response

**Solutions**:
1. Verify Nuvin is installed: `nuvin --version`
2. Check the command path is correct in editor config
3. Ensure no other process is using stdin/stdout
4. Try running `nuvin --acp` directly in terminal to test

#### "Protocol version mismatch"

**Symptoms**: Initialize fails with version error

**Solutions**:
1. Update Nuvin to latest version: `npm update -g @nuvin/nuvin-cli`
2. Check editor's ACP extension version is compatible
3. Nuvin currently supports ACP protocol version `1`

#### "Permission denied errors"

**Symptoms**: Tools fail with permission errors

**Solutions**:
1. Ensure working directory is accessible
2. Check file permissions for read/write operations
3. For `bash_tool`, ensure commands are available in PATH

#### "Tool calls not appearing"

**Symptoms**: Agent runs but no tool activity shows in editor

**Solutions**:
1. Verify editor supports tool call display
2. Check editor's ACP extension is properly configured
3. Some tools may execute without requiring display

#### "Session not found"

**Symptoms**: Prompts fail with "session not found" error

**Solutions**:
1. Ensure `session/new` was called before `prompt`
2. Check session ID is correctly passed
3. Session may have been closed or timed out

### Debug Mode

For detailed debugging, you can enable verbose logging:

```bash
# Set debug environment variable
DEBUG=nuvin:* nuvin --acp 2> debug.log
```

## Architecture (for developers)

The ACP implementation follows a clean separation of concerns:

```
source/acp/
├── index.ts           # Module exports
├── types.ts           # ACP protocol type definitions
├── server.ts          # JSON-RPC server over stdio
├── handler.ts         # Request handler and session management
├── session.ts         # Individual session state and orchestration
├── event-translator.ts # AgentEvent → SessionUpdate translation
└── permission-bridge.ts # Tool approval via ACP permissions
```

### Component Overview

#### ACPServer (`server.ts`)

The core JSON-RPC server handling stdio communication:

- Uses `vscode-jsonrpc` for message handling
- Manages connection lifecycle
- Routes requests to the handler
- Sends notifications to clients

```typescript
const server = createACPServer({
  agentName: 'Nuvin',
  agentVersion: '1.0.0',
});
server.setHandler(handler);
server.start();
```

#### NuvinACPHandler (`handler.ts`)

Implements the `ACPHandler` interface for business logic:

- Manages multiple sessions
- Handles initialize, new session, prompt, and cancel
- Delegates prompt processing to `ACPSession`

#### ACPSession (`session.ts`)

Manages individual conversation sessions:

- Wraps `OrchestratorManager` for agent execution
- Processes prompts and maintains context
- Handles cancellation and cleanup
- Integrates with event translation and permission bridge

#### EventTranslator (`event-translator.ts`)

Converts Nuvin's internal `AgentEvent` stream to ACP `SessionUpdate` notifications:

- Maps tool calls to ACP tool kinds
- Handles streaming text and reasoning
- Translates tool results and errors

#### PermissionBridge (`permission-bridge.ts`)

Bridges Nuvin's tool approval system with ACP's permission protocol:

- Sends `permission/request` for tools requiring approval
- Maps user decisions back to Nuvin's approval format
- Handles approval timeout and cancellation

### Adding New Features

To extend ACP support:

1. **New tool kinds**: Update `TOOL_KIND_MAP` in `event-translator.ts`
2. **New capabilities**: Add to `AgentCapabilities` in `types.ts` and handler
3. **New methods**: Add handler in `server.ts` and implement in handler

### Testing ACP

Run the ACP test suite:

```bash
cd packages/nuvin-cli
pnpm test -- --grep "acp"
```

Manual testing with a mock client:

```bash
# Start server
nuvin --acp

# Send JSON-RPC messages via stdin
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}' | nuvin --acp
```

## Related Documentation

- [MCP Integration Guide](./mcp-integration.md) - Extend Nuvin with MCP servers
- [Configuration Guide](./configuration.md) - Configure Nuvin settings
- [Development Guide](./development.md) - Contributing to Nuvin
- [ACP Specification](https://github.com/anthropics/acp) - Official ACP protocol docs
