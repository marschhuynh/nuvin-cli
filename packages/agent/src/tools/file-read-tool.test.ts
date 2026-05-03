import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "vitest";

import type { ToolExecutionContext, ToolUseBlock, TurnState } from "../shared/types.ts";
import { createFileReadTool } from "./file-read-tool.ts";
import { createInternalToolRuntime } from "./internal-tool-runtime.ts";

function createContext(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  const state: TurnState = {
    sessionId: "session-file-read-tool",
    turnId: "turn-file-read-tool",
    system: [],
    messages: [],
    toolResults: [],
  };
  return { sessionId: state.sessionId, turnId: state.turnId, state, signal };
}

function createToolCall(input: ToolUseBlock["input"]): ToolUseBlock {
  return { type: "tool_use", id: "file-read-1", name: "FileRead", input };
}

test("FileRead reads a text file inside the workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-file-read-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/index.ts"), "export const value = 1;\n");
  const runtime = createInternalToolRuntime([createFileReadTool({ defaultCwd: root })]);

  const result = await runtime.execute(createToolCall({ path: "src/index.ts" }), createContext());

  assert.equal(result.status, "ok");
  assert.equal(result.output, "export const value = 1;\n");
  assert.equal(result.structured.path, "src/index.ts");
  assert.equal(result.structured.totalLines, 2);
  assert.equal(result.structured.truncated, false);
});

test("FileRead reads an inclusive line range with line numbers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-file-read-"));
  await writeFile(path.join(root, "notes.txt"), "one\ntwo\nthree\n");
  const runtime = createInternalToolRuntime([createFileReadTool({ defaultCwd: root })]);

  const result = await runtime.execute(
    createToolCall({ path: "notes.txt", lineStart: 2, lineEnd: 3 }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.equal(result.output, "2|two\n3|three");
  assert.deepEqual(result.structured.lineRange, {
    lineStart: 2,
    lineEnd: 3,
    linesTotal: 4,
  });
});

test("FileRead rejects traversal outside the workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-file-read-"));
  const runtime = createInternalToolRuntime([createFileReadTool({ defaultCwd: root })]);

  const result = await runtime.execute(createToolCall({ path: "../outside.txt" }), createContext());

  assert.equal(result.status, "error");
  assert.match(result.output, /outside workspace/i);
});
