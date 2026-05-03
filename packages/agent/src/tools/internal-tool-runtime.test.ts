import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  ToolExecutionContext,
  ToolRuntimeDispatchDecision,
  ToolUseBlock,
  TurnState,
} from "../shared/types.ts";
import { createInternalToolRuntime } from "./internal-tool-runtime.ts";
import { createToolOutput, defineTool, ToolExecutionError } from "./tools.ts";

function createState(): TurnState {
  return {
    sessionId: "session-internal-tool-runtime",
    turnId: "turn-internal-tool-runtime",
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

function createToolCall(
  name: string,
  input: ToolUseBlock["input"] = {},
  id = "tool-call-1",
): ToolUseBlock {
  return {
    type: "tool_use",
    id,
    name,
    input,
  };
}

test("createInternalToolRuntime emits chunk events while execute returns the final tool result", async () => {
  const eventTypes: string[] = [];
  const chunkOutputs: string[] = [];
  const runtime = createInternalToolRuntime(
    [
      defineTool({
        name: "demo.stream",
        description: "Streams output",
        inputSchema: {
          type: "object",
          properties: {},
        },
        async *execute() {
          yield "alpha";
          yield createToolOutput("beta", {
            phase: "beta",
          });

          return createToolOutput("done", {
            status: "complete",
          });
        },
      }),
    ],
    {
      async onEvent(event) {
        eventTypes.push(event.type);

        if (event.type === "tool_output_chunk") {
          chunkOutputs.push(event.chunk.output);
        }
      },
    },
  );

  const result = await runtime.execute(createToolCall("demo.stream"), createContext());

  assert.equal(result.status, "ok");
  assert.equal(result.output, "done");
  assert.deepEqual(result.structured, {
    status: "complete",
  });
  assert.deepEqual(
    result.chunks.map((chunk) => chunk.output),
    ["alpha", "beta"],
  );
  assert.deepEqual(eventTypes, [
    "tool_started",
    "tool_output_chunk",
    "tool_output_chunk",
    "tool_completed",
  ]);
  assert.deepEqual(chunkOutputs, ["alpha", "beta"]);
});

test("createInternalToolRuntime lets runnable tools start before another call is approved and preserves result order", async () => {
  const events: string[] = [];
  let resolveFirstApproval: ((decision: ToolRuntimeDispatchDecision) => void) | undefined;
  let notifySecondStarted: (() => void) | undefined;
  let notifySecondCompleted: (() => void) | undefined;

  const firstApproval = new Promise<ToolRuntimeDispatchDecision>((resolve) => {
    resolveFirstApproval = resolve;
  });
  const secondStarted = new Promise<void>((resolve) => {
    notifySecondStarted = resolve;
  });
  const secondCompleted = new Promise<void>((resolve) => {
    notifySecondCompleted = resolve;
  });

  const runtime = createInternalToolRuntime(
    [
      defineTool({
        name: "demo.parallel",
        description: "Runs in parallel",
        inputSchema: {
          type: "object",
          properties: {
            label: {
              type: "string",
            },
          },
          required: ["label"],
        },
        async *execute(input) {
          yield `${input.label}-chunk`;
          return createToolOutput(`${input.label}-done`, {
            label: input.label,
          });
        },
      }),
    ],
    {
      async onToolCall(toolCall) {
        if (toolCall.id === "call-1") {
          return await firstApproval;
        }

        return {
          action: "run",
        };
      },
      async onEvent(event) {
        events.push(`${event.type}:${event.toolCall.id}`);

        if (event.type === "tool_started" && event.toolCall.id === "call-2") {
          notifySecondStarted?.();
        }

        if (event.type === "tool_completed" && event.toolCall.id === "call-2") {
          notifySecondCompleted?.();
        }
      },
    },
  );

  const pendingResults = runtime.executeCalls(
    [
      createToolCall("demo.parallel", { label: "first" }, "call-1"),
      createToolCall("demo.parallel", { label: "second" }, "call-2"),
    ],
    createContext(),
  );

  await secondStarted;

  assert.ok(events.includes("tool_started:call-2"));
  assert.ok(!events.includes("tool_started:call-1"));

  await secondCompleted;

  resolveFirstApproval?.({
    action: "run",
  });

  const results = await pendingResults;

  assert.deepEqual(
    results.map((result) => result.callId),
    ["call-1", "call-2"],
  );
  assert.equal(results[0].output, "first-done");
  assert.equal(results[1].output, "second-done");
  assert.ok(events.indexOf("tool_completed:call-2") < events.indexOf("tool_started:call-1"));
});

test("createInternalToolRuntime returns an error result for unknown tools", async () => {
  const runtime = createInternalToolRuntime();
  const result = await runtime.execute(createToolCall("demo.unknown"), createContext());

  assert.equal(result.status, "error");
  assert.equal(result.output, "Unknown tool: demo.unknown");
  assert.deepEqual(result.chunks, []);
});

test("createInternalToolRuntime returns an error result after a tool throws post-chunk", async () => {
  const runtime = createInternalToolRuntime([
    defineTool({
      name: "demo.error",
      description: "Fails after output",
      inputSchema: {
        type: "object",
        properties: {},
      },
      async *execute() {
        yield "before failure";
        throw new ToolExecutionError("boom", {
          exitCode: 2,
        });
      },
    }),
  ]);

  const result = await runtime.execute(createToolCall("demo.error"), createContext());

  assert.equal(result.status, "error");
  assert.equal(result.output, "boom");
  assert.deepEqual(result.structured, {
    error: "boom",
    exitCode: 2,
  });
  assert.deepEqual(
    result.chunks.map((chunk) => chunk.output),
    ["before failure"],
  );
});

test("createInternalToolRuntime converts a running tool abort into an error tool result", async () => {
  const controller = new AbortController();
  let notifyToolStarted: (() => void) | undefined;
  const toolStarted = new Promise<void>((resolve) => {
    notifyToolStarted = resolve;
  });
  const runtime = createInternalToolRuntime(
    [
      defineTool({
        name: "demo.abort",
        description: "Waits for abort",
        inputSchema: {
          type: "object",
          properties: {},
        },
        async *execute(_input, ctx) {
          const signal = ctx.signal;

          await new Promise<never>((_resolve, reject) => {
            if (signal.aborted) {
              reject(signal.reason);
              return;
            }

            signal.addEventListener(
              "abort",
              () => {
                reject(signal.reason);
              },
              { once: true },
            );
          });
        },
      }),
    ],
    {
      onEvent(event) {
        if (event.type === "tool_started") {
          notifyToolStarted?.();
        }
      },
    },
  );

  const pending = runtime.execute(createToolCall("demo.abort"), createContext(controller.signal));

  await toolStarted;
  controller.abort(new Error("User aborted this tool call."));

  const result = await pending;

  assert.equal(result.status, "error");
  assert.equal(result.output, "User aborted this tool call.");
  assert.deepEqual(result.structured, {
    error: "User aborted this tool call.",
    aborted: true,
  });
});
