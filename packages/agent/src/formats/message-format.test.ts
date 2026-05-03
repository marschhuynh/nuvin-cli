import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatResponse, ModelRequest } from "../shared/types.ts";
import {
  createReasoningMessage,
  getReasoningTextFromMessage,
  toChatRequest,
  toChatResponse,
  toModelRequest,
  toModelResponse,
  toProviderModelRequest,
} from "./message-format.ts";

test("toChatRequest converts snake_case model payloads to engine payloads", () => {
  const request: ModelRequest = {
    model: "claude-test",
    max_tokens: 333,
    reasoning: {
      visibility: "continuity-only",
      anthropic: {
        type: "enabled",
        budgetTokens: 2048,
      },
    },
    system: [{ type: "text", text: "Be direct." }],
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    tools: [],
    metadata: {
      session_id: "session-1",
      turn_id: "turn-1",
    },
  };

  assert.deepEqual(toChatRequest(request), {
    model: "claude-test",
    maxTokens: 333,
    reasoning: {
      visibility: "continuity-only",
      anthropic: {
        type: "enabled",
        budgetTokens: 2048,
      },
    },
    system: [{ type: "text", text: "Be direct." }],
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    tools: [],
    metadata: {
      sessionId: "session-1",
      turnId: "turn-1",
    },
  });
});

test("toModelResponse round-trips a provider-neutral response", () => {
  const response: ChatResponse = {
    id: "msg-1",
    content: [{ type: "text", text: "ok" }],
    stopReason: "end_turn",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 3,
    },
  };

  const wire = toModelResponse(response);

  assert.equal(wire.stop_reason, "end_turn");
  assert.deepEqual(toChatResponse(wire), response);
});

test("toModelRequest converts engine payloads to snake_case provider payloads", () => {
  assert.deepEqual(
    toModelRequest({
      model: "claude-test",
      maxTokens: 512,
      reasoning: {
        visibility: "user-visible",
        openai: {
          effort: "low",
          summary: "auto",
        },
      },
      system: [{ type: "text", text: "Be concise." }],
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [],
      metadata: {
        sessionId: "session-2",
        turnId: "turn-2",
      },
    }),
    {
      model: "claude-test",
      max_tokens: 512,
      reasoning: {
        visibility: "user-visible",
        openai: {
          effort: "low",
          summary: "auto",
        },
      },
      system: [{ type: "text", text: "Be concise." }],
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [],
      metadata: {
        session_id: "session-2",
        turn_id: "turn-2",
      },
    },
  );
});

test("toProviderModelRequest omits runtime metadata from outbound provider payloads", () => {
  assert.deepEqual(
    toProviderModelRequest({
      model: "claude-test",
      maxTokens: 512,
      reasoning: {
        visibility: "user-visible",
        openai: {
          effort: "medium",
        },
      },
      system: [{ type: "text", text: "Be concise." }],
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [],
      metadata: {
        sessionId: "session-2",
        turnId: "turn-2",
      },
    }),
    {
      model: "claude-test",
      max_tokens: 512,
      system: [{ type: "text", text: "Be concise." }],
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [],
    },
  );
});

test("createReasoningMessage extracts provider reasoning blocks from assistant content", () => {
  assert.deepEqual(
    createReasoningMessage({
      role: "assistant",
      content: [
        {
          type: "anthropic_thinking",
          thinking: "Inspect the code paths.",
          signature: "sig-1",
        },
        {
          type: "text",
          text: "Done",
        },
        {
          type: "openai_reasoning",
          summary: [
            {
              type: "summary_text",
              text: "Need to verify the event order.",
            },
          ],
        },
      ],
    }),
    {
      role: "assistant",
      content: [
        {
          type: "anthropic_thinking",
          thinking: "Inspect the code paths.",
          signature: "sig-1",
        },
        {
          type: "openai_reasoning",
          summary: [
            {
              type: "summary_text",
              text: "Need to verify the event order.",
            },
          ],
        },
      ],
    },
  );
});

test("getReasoningTextFromMessage renders provider reasoning blocks into display text", () => {
  assert.equal(
    getReasoningTextFromMessage({
      role: "assistant",
      content: [
        {
          type: "anthropic_thinking",
          thinking: "Inspect the code paths.",
          signature: "sig-1",
        },
        {
          type: "openai_reasoning",
          summary: [
            {
              type: "summary_text",
              text: "Need to verify the event order.",
            },
          ],
        },
        {
          type: "anthropic_redacted_thinking",
          data: "opaque",
        },
      ],
    }),
    ["Inspect the code paths.", "Need to verify the event order.", "(redacted reasoning)"].join(
      "\n\n",
    ),
  );
});
