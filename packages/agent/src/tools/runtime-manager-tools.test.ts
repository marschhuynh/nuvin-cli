import assert from "node:assert/strict";
import { test } from "vitest";

import { MockModel } from "../models/mock-model.ts";
import type {
  ChatRequest,
  ChatResponse,
  EngineChatModel,
  ToolExecutionContext,
  ToolUseBlock,
  TurnState,
} from "../shared/types.ts";
import { createInternalToolRuntime } from "./internal-tool-runtime.ts";
import { createDelegationTools } from "./runtime-manager-tools.ts";
import { defineTool } from "./tools.ts";

function createState(sessionId: string): TurnState {
  return {
    sessionId,
    turnId: "turn-parent",
    system: [],
    messages: [],
    toolResults: [],
  };
}

function createContext(
  sessionId: string,
  toolCallId = "tool-call-parent",
  signal: AbortSignal = new AbortController().signal,
): ToolExecutionContext {
  const state = createState(sessionId);

  return {
    sessionId,
    turnId: state.turnId,
    state,
    signal,
    toolCallId,
  };
}

function createToolCall(
  name: string,
  input: ToolUseBlock["input"],
  id = "tool-call-1",
): ToolUseBlock {
  return {
    type: "tool_use",
    id,
    name,
    input,
  };
}

function createAbortingModel(): EngineChatModel {
  return {
    model: "aborting-tool-model",
    maxTokens: 1024,
    async complete(): Promise<ChatResponse> {
      const error = new Error("Child run aborted");
      error.name = "AbortError";
      throw error;
    },
  };
}

test("createDelegationTools delegates to configured child agents without an external RuntimeManager", async () => {
  const runtime = createInternalToolRuntime(
    createDelegationTools({
      agents: {
        worker: ({ agentId, parentSessionId, runId, toolCallId }) => ({
          sessionId: `${agentId}-${runId}`,
          systemPrompt: `Parent session: ${parentSessionId}; tool call: ${toolCallId}`,
          chatModel: new MockModel(),
        }),
      },
    }),
  );

  assert.deepEqual(
    runtime.listToolSchemas().map((tool) => tool.name),
    ["AssignTask"],
  );

  const result = await runtime.execute(
    createToolCall(
      "AssignTask",
      {
        agentId: "worker",
        task: "research this task",
      },
      "tool-call-start",
    ),
    createContext("parent-session", "tool-call-start"),
  );

  assert.equal(result.status, "ok");
  assert.equal(result.structured.status, "completed");
  assert.equal(result.structured.agentId, "worker");
  assert.equal(result.structured.parentSessionId, "parent-session");
  assert.equal(result.structured.originToolCallId, "tool-call-start");
  assert.match(String(result.structured.runId), /^delegated-run-/);
  assert.match(String(result.structured.sessionId), /^worker-delegated-run-/);
  assert.match(String(result.structured.finalMessageText), /research this task/i);
});

test("AssignTask returns an error when the requested child agent is not configured", async () => {
  const runtime = createInternalToolRuntime(
    createDelegationTools({
      agents: {
        worker: {
          chatModel: new MockModel(),
        },
      },
    }),
  );

  const result = await runtime.execute(
    createToolCall("AssignTask", {
      agentId: "missing",
      task: "do not allow this",
    }),
    createContext("parent-session"),
  );

  assert.equal(result.status, "error");
  assert.match(String(result.output), /Unknown delegated agent: missing/i);
  assert.equal(result.structured.agentId, "missing");
});

test("createDelegationTools supports async delegated agent factories", async () => {
  const runtime = createInternalToolRuntime(
    createDelegationTools({
      agents: {
        researcher: async ({ agentId, parentSessionId, runId }) => ({
          sessionId: `${agentId}-${runId}`,
          systemPrompt: `Parent session: ${parentSessionId}`,
          chatModel: new MockModel(),
        }),
      },
    }),
  );

  const result = await runtime.execute(
    createToolCall(
      "AssignTask",
      {
        agentId: "researcher",
        task: "inspect registry support",
      },
      "tool-call-registry",
    ),
    createContext("parent-session", "tool-call-registry"),
  );

  assert.equal(result.status, "ok");
  assert.equal(result.structured.agentId, "researcher");
  assert.match(String(result.structured.sessionId), /^researcher-delegated-run-/);
});

test("delegated child agents keep their own tool approval callbacks", async () => {
  const approvals: ToolUseBlock[] = [];
  const childModel: EngineChatModel = {
    model: "child-tool-model",
    maxTokens: 1024,
    async complete(request: ChatRequest): Promise<ChatResponse> {
      const lastMessage = request.messages.at(-1);
      const lastBlock = lastMessage?.content[0];

      if (lastBlock?.type === "tool_result") {
        return {
          id: "child-final-response",
          content: [
            {
              type: "text",
              text: "Tool was rejected.",
            },
          ],
          stopReason: "end_turn",
          usage: {
            inputTokens: 2,
            outputTokens: 1,
          },
        };
      }

      return {
        id: "child-tool-response",
        content: [
          {
            type: "tool_use",
            id: "child-tool-call",
            name: "demo.inspect",
            input: {
              target: "workspace",
            },
          },
        ],
        stopReason: "tool_use",
        usage: {
          inputTokens: 2,
          outputTokens: 1,
        },
      };
    },
  };
  const runtime = createInternalToolRuntime(
    createDelegationTools({
      agents: {
        worker: {
          chatModel: childModel,
          tools: [
            defineTool({
              name: "demo.inspect",
              description: "Inspects a target",
              inputSchema: {
                type: "object",
                properties: {
                  target: {
                    type: "string",
                  },
                },
                required: ["target"],
              },
              async *execute(input) {
                yield `target=${input.target}`;
              },
            }),
          ],
          onToolCall: (toolCall) => {
            approvals.push(toolCall);
            return {
              action: "reject",
              reason: "test rejection",
            };
          },
        },
      },
    }),
  );

  const result = await runtime.execute(
    createToolCall("AssignTask", {
      agentId: "worker",
      task: "inspect files",
    }),
    createContext("parent-session"),
  );

  assert.equal(result.status, "ok");
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0]?.name, "demo.inspect");
  assert.match(String(result.structured.finalMessageText), /Tool was rejected/i);
});

test("AssignTask returns an error tool result when the child run aborts", async () => {
  const runtime = createInternalToolRuntime(
    createDelegationTools({
      agents: {
        worker: {
          chatModel: createAbortingModel(),
        },
      },
    }),
  );

  const result = await runtime.execute(
    createToolCall(
      "AssignTask",
      {
        agentId: "worker",
        task: "slow research task",
      },
      "tool-call-abort",
    ),
    createContext("parent-session", "tool-call-abort"),
  );

  assert.equal(result.status, "error");
  assert.match(String(result.output), /Agent run .* was aborted\. Cause: Child run aborted/i);
  assert.equal(result.structured.agentId, "worker");
  assert.equal(result.structured.status, "aborted");
  assert.equal(result.structured.aborted, true);
  assert.match(
    String(result.structured.errorMessage),
    /Agent run .* was aborted\. Cause: Child run aborted/i,
  );
});

test("AssignTask returns an error tool result when the child run is aborted by a tool abort", async () => {
  const runtime = createInternalToolRuntime(
    createDelegationTools({
      agents: {
        worker: {
          chatModel: {
            model: "tool-abort-child-model",
            maxTokens: 1024,
            async complete(request: ChatRequest): Promise<ChatResponse> {
              const lastMessage = request.messages.at(-1);
              const lastBlock = lastMessage?.content[0];

              if (lastBlock?.type === "tool_result") {
                throw new Error("Child run should stop after the aborted tool result is recorded");
              }

              return {
                id: "child-tool-abort-response",
                content: [
                  {
                    type: "tool_use",
                    id: "child-tool-call-abort",
                    name: "demo.abort",
                    input: {},
                  },
                ],
                stopReason: "tool_use",
                usage: {
                  inputTokens: 2,
                  outputTokens: 1,
                },
              };
            },
          },
          tools: [
            defineTool({
              name: "demo.abort",
              description: "Waits for abort",
              inputSchema: {
                type: "object",
                properties: {},
              },
              async execute(_input, ctx) {
                void ctx;
                const error = new Error("User aborted this tool call.");
                error.name = "AbortError";
                throw error;
              },
            }),
          ],
        },
      },
    }),
  );

  const result = await runtime.execute(
    createToolCall(
      "AssignTask",
      {
        agentId: "worker",
        task: "slow research task",
      },
      "tool-call-interrupted",
    ),
    createContext("parent-session", "tool-call-interrupted"),
  );

  assert.equal(result.status, "error");
  assert.equal(result.structured.agentId, "worker");
  assert.equal(result.structured.status, "aborted");
  assert.match(
    String(result.output),
    /Agent run .* was aborted\. Cause: User aborted this tool call\./i,
  );
  assert.match(
    String(result.structured.errorMessage),
    /Agent run .* was aborted\. Cause: User aborted this tool call\./i,
  );
});
