# ACP Mode Debugging - Root Cause Analysis & Fix

## Problem Report

Running `pnpm run:dev --acp` produced no output or visible behavior. The user expected the server to start and listen for JSON-RPC messages, but nothing appeared to happen.

## Root Causes Identified

### 1. **Server Exiting Immediately** (PRIMARY BUG)
**Location**: `packages/nuvin-acp/source/server.ts:187-190`

**Issue**: The `startACPServer()` function was returning immediately after setting up event listeners:

```typescript
// BEFORE (buggy):
export async function startACPServer(factory: OrchestratorFactory): Promise<void> {
  const server = new ACPServer(factory);
  await server.start();
  // Function returns here, process exits!
}
```

The `start()` method only registered event handlers but didn't keep the async function alive. The Node.js process would see no active event loop handles and exit immediately, before any stdin data could be read.

**Fix**: Added an indefinite promise to keep the server running:

```typescript
// AFTER (fixed):
export async function startACPServer(factory: OrchestratorFactory): Promise<void> {
  const server = new ACPServer(factory);
  await server.start();
  
  // Keep the server running indefinitely
  await new Promise<void>(() => {
    // Never resolves - server runs until process is terminated
  });
}
```

### 2. **Stdout Pollution** (SECONDARY BUG)
**Location**: `packages/nuvin-cli/source/cli.tsx:51`

**Issue**: Bracketed paste mode was being enabled via `console.log('\x1b[?2004h');` BEFORE checking if ACP mode was active. This polluted stdout with terminal escape sequences.

In ACP mode, stdout MUST be reserved exclusively for JSON-RPC responses. Any other output breaks the protocol.

**Fix**: Moved ACP mode detection to the very beginning of the script, before ANY console output:

```typescript
// Check for ACP mode BEFORE any console output
const isACPMode = process.argv.includes('--acp');

if (!isACPMode) {
  console.log('\x1b[?2004h'); // Only enable in normal CLI mode
}

// Handle ACP mode immediately
if (isACPMode) {
  (async () => {
    const { runACPMode } = await import('./acp-entry.js');
    await runACPMode();
    process.exit(0);
  })();
} else {
  // Normal CLI setup continues...
}
```

## How ACP Mode Works

When running with `--acp` flag:

1. **Startup**: Process starts and sets up readline interface on stdin
2. **Listening**: Server waits indefinitely for JSON-RPC messages on stdin
3. **Processing**: Each line of input is parsed as JSON-RPC and handled
4. **Response**: JSON-RPC responses are written to stdout (one per line)
5. **Logging**: Server logs and errors go to stderr only
6. **Termination**: Server runs until stdin closes or process is killed

## File Changes

### Modified Files

1. **packages/nuvin-acp/source/server.ts**
   - Added indefinite promise to keep server alive
   - Cleaned up startup logging messages

2. **packages/nuvin-cli/source/cli.tsx**
   - Moved ACP mode check before any console output
   - Restructured initialization to avoid stdout pollution
   - Removed duplicate ACP mode handling

3. **packages/nuvin-acp/source/transport/stdio.ts**
   - Simplified logging (errors only)
   - Removed debug output

4. **packages/nuvin-acp/source/jsonrpc/handler.ts**
   - Added error logging for debugging
   - Cleaned up verbose debug output

### New Files

1. **docs/testing-acp.md**
   - Comprehensive testing guide for ACP mode
   - Example commands and expected output
   - Debugging tips

## Testing Procedure

### Basic Test
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}' | pnpm run:dev --acp 2>/dev/null
```

### Expected Output
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":false,"promptCapabilities":{"image":true,"embeddedContext":true},"mcpCapabilities":{"http":false,"sse":false}},"agentInfo":{"name":"nuvin","title":"Nuvin CLI","version":"1.0.0"}}}
```

### Verification
- ✅ Server starts and waits for input
- ✅ JSON-RPC request is processed correctly
- ✅ JSON-RPC response is sent to stdout
- ✅ No stdout pollution (only JSON-RPC messages)
- ✅ Server logs appear on stderr only

## Lessons Learned

1. **Event Loop Management**: Async functions that only set up event handlers need explicit mechanisms to keep the process alive
2. **Stdio Separation**: When implementing protocol servers on stdio, stdout must be protected from ANY non-protocol output
3. **Early Detection**: Special modes (like ACP) should be detected and handled before any initialization code runs
4. **Debug Logging**: Always use stderr for debug/log messages when stdout is reserved for protocol data

## Related Standards

This implementation follows the JSON-RPC 2.0 specification over stdio, similar to Language Server Protocol (LSP) transports.

**Key Principles**:
- One JSON-RPC message per line
- Stdout reserved for responses only
- Stderr for logging/debugging
- Process lifetime managed by stdin lifecycle
