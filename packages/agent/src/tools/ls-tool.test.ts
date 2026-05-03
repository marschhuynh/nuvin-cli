import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "vitest";

import type { ToolExecutionContext, ToolUseBlock, TurnState } from "../shared/types.ts";
import { createInternalToolRuntime } from "./internal-tool-runtime.ts";
import { createLsTool } from "./ls-tool.ts";

function createContext(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  const state: TurnState = {
    sessionId: "session-ls-tool",
    turnId: "turn-ls-tool",
    system: [],
    messages: [],
    toolResults: [],
  };
  return { sessionId: state.sessionId, turnId: state.turnId, state, signal };
}

function createToolCall(input: ToolUseBlock["input"]): ToolUseBlock {
  return { type: "tool_use", id: "ls-1", name: "Ls", input };
}

test("Ls lists directory entries as YAML-style text", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-ls-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/index.ts"), "one\ntwo\n");
  await writeFile(path.join(root, ".hidden"), "secret\n");
  const runtime = createInternalToolRuntime([createLsTool({ defaultCwd: root })]);

  const result = await runtime.execute(createToolCall({ path: "." }), createContext());

  assert.equal(result.status, "ok");
  assert.match(result.output, /path: \./);
  assert.match(result.output, /name: \.hidden/);
  assert.match(result.output, /name: src/);
  assert.equal(result.structured.total, 2);
  assert.equal(result.structured.truncated, false);
});

test("Ls rejects paths outside the workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-ls-"));
  const runtime = createInternalToolRuntime([createLsTool({ defaultCwd: root })]);

  const result = await runtime.execute(createToolCall({ path: "../outside" }), createContext());

  assert.equal(result.status, "error");
  assert.match(result.output, /outside workspace/i);
});
