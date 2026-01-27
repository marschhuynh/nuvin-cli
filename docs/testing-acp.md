# Testing ACP Mode

## Quick Test

Test the ACP server with a simple initialize request:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}' | pnpm run:dev --acp 2>/dev/null
```

Expected output (JSON-RPC response on stdout):
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":false,"promptCapabilities":{"image":true,"embeddedContext":true},"mcpCapabilities":{"http":false,"sse":false}},"agentInfo":{"name":"nuvin","title":"Nuvin CLI","version":"1.0.0"}}}
```

## Full Test Sequence

Create a test file with multiple JSON-RPC messages:

```bash
cat > test-acp.jsonl << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}
{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/tmp/test"}}
EOF
```

Run the test:

```bash
cat test-acp.jsonl | pnpm run:dev --acp
```

## Understanding ACP Mode

When running with `--acp`:

1. **Stdout**: Reserved exclusively for JSON-RPC responses (one JSON object per line)
2. **Stderr**: Used for server logs and error messages
3. **Stdin**: Accepts JSON-RPC requests (one JSON object per line)

The server will:
- Start silently (logs only to stderr)
- Listen indefinitely on stdin for JSON-RPC messages
- Send JSON-RPC responses to stdout
- Exit when stdin is closed or the process is terminated

## Production Usage

For production use, redirect stderr to a log file:

```bash
pnpm run:dev --acp 2>acp-server.log
```

Or suppress stderr entirely:

```bash
pnpm run:dev --acp 2>/dev/null
```

## Debugging

To see server logs while testing:

```bash
cat test-acp.jsonl | pnpm run:dev --acp 2>&1 | grep -v '^\{'
```

This shows stderr messages while filtering out JSON-RPC responses.
