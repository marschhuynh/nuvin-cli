import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import type { ToolExecutionContext, ToolUseBlock, TurnState } from "../shared/types.ts";
import { createBashTool } from "./bash-tool.ts";
import { createInternalToolRuntime } from "./internal-tool-runtime.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function createState(): TurnState {
  return {
    sessionId: "session-bash-tool",
    turnId: "turn-bash-tool",
    system: [],
    messages: [],
    toolResults: [],
  };
}

function createContext(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  const state = createState();

  return {
    sessionId: state.sessionId,
    turnId: state.turnId,
    state,
    signal,
  };
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function createToolCall(input: ToolUseBlock["input"], id = "tool-call-1"): ToolUseBlock {
  return {
    type: "tool_use",
    id,
    name: "Bash",
    input,
  };
}

test("createBashTool executes a command and returns structured metadata", async () => {
  const runtime = createInternalToolRuntime([
    createBashTool({
      defaultCwd: repoRoot,
    }),
  ]);

  const result = await runtime.execute(
    createToolCall({
      command: `node -e "process.stdout.write('hello from bash')"`,
    }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.equal(result.output, "hello from bash");
  assert.deepEqual(
    result.chunks.map((chunk) => chunk.output),
    ["hello from bash"],
  );
  assert.equal(result.structured.command, `node -e "process.stdout.write('hello from bash')"`);
  assert.equal(result.structured.cwd, repoRoot);
  assert.equal(result.structured.exitCode, 0);
});

test("createBashTool yields chunks as command output becomes available", async () => {
  const tool = createBashTool({
    defaultCwd: repoRoot,
  });

  const execution = tool.execute(
    {
      command: `node -e "process.stdout.write('first\\n'); setTimeout(() => process.stdout.write('second\\n'), 10)"`,
    },
    createContext(),
  );

  const first = await execution.next();
  assert.equal(first.done, false);
  assert.equal(first.value, "first\n");

  const second = await execution.next();
  assert.equal(second.done, false);
  assert.equal(second.value, "second\n");

  const final = await execution.next();
  assert.equal(final.done, true);
  assert.equal(typeof final.value, "object");
  assert.notEqual(final.value, undefined);
  assert.notEqual(final.value, null);

  const finalOutput = final.value as {
    output: string;
    structured: Record<string, unknown>;
  };

  assert.equal(finalOutput.output, "first\nsecond\n");
  assert.equal(
    finalOutput.structured.command,
    `node -e "process.stdout.write('first\\n'); setTimeout(() => process.stdout.write('second\\n'), 10)"`,
  );
  assert.equal(finalOutput.structured.cwd, repoRoot);
  assert.equal(finalOutput.structured.exitCode, 0);
  assert.equal(finalOutput.structured.signal, null);
  assert.equal(finalOutput.structured.ignoreOutput, false);
  assert.equal(typeof finalOutput.structured.shellPath, "string");
  assert.equal(finalOutput.structured.timeoutMs, 30_000);
});

test("createBashTool can suppress command output while preserving exit metadata", async () => {
  const runtime = createInternalToolRuntime([
    createBashTool({
      defaultCwd: repoRoot,
    }),
  ]);

  const result = await runtime.execute(
    createToolCall({
      command: `node -e "process.stdout.write('ignored output')"`,
      ignoreOutput: true,
    }),
    createContext(),
  );

  assert.equal(result.status, "ok");
  assert.equal(result.output, "exit code 0");
  assert.equal(result.structured.ignoreOutput, true);
  assert.equal(result.structured.exitCode, 0);
});

test("createBashTool returns an error result for non-zero exit codes", async () => {
  const runtime = createInternalToolRuntime([
    createBashTool({
      defaultCwd: repoRoot,
    }),
  ]);

  const result = await runtime.execute(
    createToolCall({
      command: `node -e "process.stderr.write('boom'); process.exit(2)"`,
    }),
    createContext(),
  );

  assert.equal(result.status, "error");
  assert.match(result.output, /boom/);
  assert.deepEqual(
    result.chunks.map((chunk) => chunk.output),
    ["boom"],
  );
  assert.equal(result.structured.exitCode, 2);
  assert.equal(
    result.structured.command,
    `node -e "process.stderr.write('boom'); process.exit(2)"`,
  );
});

test("createBashTool enforces command timeouts", async () => {
  const runtime = createInternalToolRuntime([
    createBashTool({
      defaultCwd: repoRoot,
    }),
  ]);

  const result = await runtime.execute(
    createToolCall({
      command: `node -e "setTimeout(() => {}, 500)"`,
      timeoutMs: 25,
    }),
    createContext(),
  );

  assert.equal(result.status, "error");
  assert.match(result.output, /timed out/i);
  assert.equal(result.chunks.length, 0);
  assert.equal(result.structured.timedOut, true);
  assert.equal(result.structured.timeoutMs, 25);
});

test("createBashTool aborts a running process group before child side effects escape", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "nuvin-bash-abort-"));
  const markerPath = path.join(tempDir, "marker.txt");
  const controller = new AbortController();
  const tool = createBashTool({
    defaultCwd: repoRoot,
  });
  const command = `node -e "const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', 'setTimeout(() => require(\\"node:fs\\").writeFileSync(process.argv[1], \\"child\\"), 150)', process.argv[1]], { stdio: 'ignore' }); setTimeout(() => {}, 1000);" ${quoteForShell(markerPath)}`;
  const execution = tool.execute(
    {
      command,
      timeoutMs: 300,
    },
    createContext(controller.signal),
  );

  controller.abort(new Error("bash abort"));

  await assert.rejects(execution.next(), /bash abort/i);
  await new Promise((resolve) => {
    setTimeout(resolve, 250);
  });
  assert.equal(existsSync(markerPath), false);
});
