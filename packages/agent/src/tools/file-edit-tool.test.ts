import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "vitest";

import type { ToolExecutionContext, ToolUseBlock, TurnState } from "../shared/types.ts";
import { createFileEditTool } from "./file-edit-tool.ts";
import { createInternalToolRuntime } from "./internal-tool-runtime.ts";

function createContext(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  const state: TurnState = {
    sessionId: "session-file-edit-tool",
    turnId: "turn-file-edit-tool",
    system: [],
    messages: [],
    toolResults: [],
  };
  return { sessionId: state.sessionId, turnId: state.turnId, state, signal };
}

function createToolCall(input: ToolUseBlock["input"]): ToolUseBlock {
  return { type: "tool_use", id: "file-edit-1", name: "FileEdit", input };
}

test("FileEdit replaces the first exact text segment", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-file-edit-"));
  await writeFile(path.join(root, "file.txt"), "old\nold\n");
  const runtime = createInternalToolRuntime([createFileEditTool({ defaultCwd: root })]);

  const result = await runtime.execute(
    createToolCall({ filePath: "file.txt", oldText: "old", newText: "new" }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.equal(await readFile(path.join(root, "file.txt"), "utf8"), "new\nold\n");
  assert.equal(result.structured.filePath, "file.txt");
  assert.equal(result.structured.noChange, false);
});

test("FileEdit supports dryRun without writing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-file-edit-"));
  await writeFile(path.join(root, "file.txt"), "before\n");
  const runtime = createInternalToolRuntime([createFileEditTool({ defaultCwd: root })]);

  const result = await runtime.execute(
    createToolCall({ filePath: "file.txt", oldText: "before", newText: "after", dryRun: true }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.match(result.output, /dry run/i);
  assert.equal(await readFile(path.join(root, "file.txt"), "utf8"), "before\n");
  assert.equal(result.structured.dryRun, true);
});

test("FileEdit preserves CRLF line endings and reports line numbers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-file-edit-"));
  await writeFile(path.join(root, "file.txt"), "one\r\ntwo\r\nthree\r\n");
  const runtime = createInternalToolRuntime([createFileEditTool({ defaultCwd: root })]);

  const result = await runtime.execute(
    createToolCall({ filePath: "file.txt", oldText: "two", newText: "TWO\nand half" }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.equal(
    await readFile(path.join(root, "file.txt"), "utf8"),
    "one\r\nTWO\r\nand half\r\nthree\r\n",
  );
  assert.deepEqual(result.structured.lineNumbers, {
    oldStartLine: 2,
    oldEndLine: 2,
    newStartLine: 2,
    newEndLine: 3,
    oldLineCount: 1,
    newLineCount: 2,
  });
});

test("FileEdit errors when oldText is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-file-edit-"));
  await writeFile(path.join(root, "file.txt"), "hello\n");
  const runtime = createInternalToolRuntime([createFileEditTool({ defaultCwd: root })]);

  const result = await runtime.execute(
    createToolCall({ filePath: "file.txt", oldText: "missing", newText: "new" }),
    createContext(),
  );

  assert.equal(result.status, "error");
  assert.match(result.output, /oldText not found/i);
});
