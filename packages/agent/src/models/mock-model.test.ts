import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatRequest } from "../shared/types.ts";
import { MockModel } from "./mock-model.ts";

function makeRequest(text: string, toolName?: string): ChatRequest {
  return {
    model: "mock",
    maxTokens: 1024,
    system: [],
    messages: [
      {
        role: "user",
        content: [{ type: "text", text }],
      },
    ],
    tools: toolName
      ? [
          {
            name: toolName,
            description: "tool",
            input_schema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        ]
      : [],
    metadata: {
      sessionId: "session-1",
      turnId: "turn-1",
    },
  };
}

test("MockModel records requests and returns a direct answer by default", async () => {
  const model = new MockModel();
  const response = await model.complete(makeRequest("hello there"));

  assert.equal(model.requests.length, 1);
  assert.match(String((response.content[0] as { text: string }).text), /Direct answer/i);
  assert.equal(response.stopReason, "end_turn");
});

test("MockModel returns Bash tool_use blocks for workspace listing prompts", async () => {
  const model = new MockModel();
  const response = await model.complete(
    makeRequest("please list the files in the workspace", "Bash"),
  );

  assert.equal(response.stopReason, "tool_use");
  assert.equal(response.content[0].type, "tool_use");
});

test("MockModel follows up on tool_result messages with a direct text response", async () => {
  const model = new MockModel();
  const response = await model.complete({
    model: "mock",
    maxTokens: 1024,
    system: [],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: "file-a\nfile-b",
            is_error: false,
          },
        ],
      },
    ],
    tools: [],
    metadata: {
      sessionId: "session-1",
      turnId: "turn-2",
    },
  });

  assert.equal(response.stopReason, "end_turn");
  assert.match(String((response.content[0] as { text: string }).text), /mocked tool result/i);
});

test("MockModel applies default reasoning configured on the model", async () => {
  const model = new MockModel({
    reasoning: {
      auto: {
        effort: "medium",
      },
    },
  });

  await model.complete(makeRequest("hello there"));

  assert.deepEqual(model.requests[0].reasoning, {
    auto: {
      effort: "medium",
    },
  });
});
