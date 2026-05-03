import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "vitest";
import type { ToolExecutionContext, ToolUseBlock, TurnState } from "../shared/types.ts";
import { createGrepTool } from "./grep-tool.ts";
import { createInternalToolRuntime } from "./internal-tool-runtime.ts";

function createContext(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  const state: TurnState = {
    sessionId: "session-grep-tool",
    turnId: "turn-grep-tool",
    system: [],
    messages: [],
    toolResults: [],
  };
  return { sessionId: state.sessionId, turnId: state.turnId, state, signal };
}

function createToolCall(input: ToolUseBlock["input"]): ToolUseBlock {
  return { type: "tool_use", id: "grep-1", name: "Grep", input };
}

test("Grep searches regex patterns with include globs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-grep-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/index.ts"), "alpha\nexport const value = 1;\n");
  await writeFile(path.join(root, "src/index.js"), "export const ignored = 1;\n");
  const runtime = createInternalToolRuntime([createGrepTool({ defaultCwd: root })]);

  const result = await runtime.execute(
    createToolCall({ pattern: "^export", path: "src", include: "*.ts" }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.match(result.output, /Found 1 match/);
  assert.match(result.output, /index\.ts:/);
  assert.match(result.output, /> Line 2: export const value = 1;/);
  assert.equal(result.structured.matchCount, 1);
  assert.equal(result.structured.fileCount, 1);
});

test("Grep supports single-file search with context", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-grep-"));
  await writeFile(path.join(root, "index.ts"), "before\nneedle\nafter\n");
  const runtime = createInternalToolRuntime([createGrepTool({ defaultCwd: root })]);

  const result = await runtime.execute(
    createToolCall({ pattern: "needle", path: "index.ts", context: 1 }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.match(result.output, / {2}Line 1: before/);
  assert.match(result.output, /> Line 2: needle/);
  assert.match(result.output, / {2}Line 3: after/);
});
