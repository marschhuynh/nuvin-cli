import assert from "node:assert/strict";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "vitest";

import type { ToolExecutionContext, ToolUseBlock, TurnState } from "../shared/types.ts";
import { createGlobTool } from "./glob-tool.ts";
import { createInternalToolRuntime } from "./internal-tool-runtime.ts";

function createContext(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  const state: TurnState = {
    sessionId: "session-glob-tool",
    turnId: "turn-glob-tool",
    system: [],
    messages: [],
    toolResults: [],
  };
  return { sessionId: state.sessionId, turnId: state.turnId, state, signal };
}

function createToolCall(input: ToolUseBlock["input"]): ToolUseBlock {
  return { type: "tool_use", id: "glob-1", name: "Glob", input };
}

test("Glob finds files by ripgrep glob and sorts by modification time", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-glob-"));
  await mkdir(path.join(root, "src"));
  const oldFile = path.join(root, "src/old.ts");
  const newFile = path.join(root, "src/new.ts");
  await writeFile(oldFile, "old\n");
  await writeFile(newFile, "new\n");
  await utimes(oldFile, new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));
  await utimes(newFile, new Date("2021-01-01T00:00:00Z"), new Date("2021-01-01T00:00:00Z"));
  const runtime = createInternalToolRuntime([createGlobTool({ defaultCwd: root })]);

  const result = await runtime.execute(createToolCall({ pattern: "**/*.ts" }), createContext());

  assert.equal(result.status, "ok");
  assert.equal(result.output, "src/new.ts\nsrc/old.ts");
  assert.deepEqual(result.structured.matches, ["src/new.ts", "src/old.ts"]);
  assert.equal(result.structured.count, 2);
});

test("Glob reports no matches without failing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-glob-"));
  const runtime = createInternalToolRuntime([createGlobTool({ defaultCwd: root })]);

  const result = await runtime.execute(createToolCall({ pattern: "**/*.tsx" }), createContext());

  assert.equal(result.status, "ok");
  assert.match(result.output, /No files found/);
  assert.equal(result.structured.count, 0);
});
