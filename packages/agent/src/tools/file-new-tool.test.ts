import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "vitest";

import type { ToolExecutionContext, ToolUseBlock, TurnState } from "../shared/types.ts";
import { createFileNewTool } from "./file-new-tool.ts";
import { createInternalToolRuntime } from "./internal-tool-runtime.ts";

function createContext(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  const state: TurnState = {
    sessionId: "session-file-new-tool",
    turnId: "turn-file-new-tool",
    system: [],
    messages: [],
    toolResults: [],
  };
  return { sessionId: state.sessionId, turnId: state.turnId, state, signal };
}

function createToolCall(input: ToolUseBlock["input"]): ToolUseBlock {
  return { type: "tool_use", id: "file-new-1", name: "FileNew", input };
}

test("FileNew writes a new file atomically and reports metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-file-new-"));
  const runtime = createInternalToolRuntime([createFileNewTool({ defaultCwd: root })]);

  const result = await runtime.execute(
    createToolCall({ filePath: "src/new.txt", content: "hello\nworld\n" }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.equal(await readFile(path.join(root, "src/new.txt"), "utf8"), "hello\nworld\n");
  assert.equal(result.structured.filePath, "src/new.txt");
  assert.equal(result.structured.overwritten, false);
  assert.equal(result.structured.lines, 3);
});

test("FileNew allows overwrite and reports it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-file-new-"));
  await writeFile(path.join(root, "existing.txt"), "old\n");
  const runtime = createInternalToolRuntime([createFileNewTool({ defaultCwd: root })]);

  const result = await runtime.execute(
    createToolCall({ filePath: "existing.txt", content: "new\n" }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.equal(await readFile(path.join(root, "existing.txt"), "utf8"), "new\n");
  assert.equal(result.structured.overwritten, true);
});
