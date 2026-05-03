import assert from "node:assert/strict";
import { test } from "vitest";

import { compileRequest, toChatRequest } from "./message-format.ts";
import { toOpenAiResponsesRequest } from "./provider-adapters.ts";

test("compileRequest keeps top-level system separate from messages", () => {
  const request = compileRequest({
    sessionId: "session-1",
    turnId: "turn-1",
    system: [
      {
        type: "text",
        text: "You are precise.",
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello",
          },
        ],
      },
    ],
  });

  assert.deepEqual(request.system, [
    {
      type: "text",
      text: "You are precise.",
    },
  ]);
  assert.equal(request.messages.length, 1);
  assert.equal(request.messages[0].role, "user");
});

test("toOpenAiResponsesRequest transforms internal tool messages into OpenAI input items", () => {
  const request = toChatRequest(
    compileRequest({
      sessionId: "session-2",
      turnId: "turn-2",
      system: [
        {
          type: "text",
          text: "Be concise.",
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "List files",
            },
          ],
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "Bash",
              input: {
                command: "ls -la",
              },
            },
          ],
        },
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
      tools: [
        {
          name: "Bash",
          description: "Executes a shell command",
          input_schema: {
            type: "object",
            properties: {
              command: {
                type: "string",
              },
            },
            required: ["command"],
          },
        },
      ],
    }),
  );

  const openAiRequest = toOpenAiResponsesRequest(request);

  assert.equal(openAiRequest.instructions, "Be concise.");
  assert.deepEqual(openAiRequest.tools, [
    {
      type: "function",
      name: "Bash",
      description: "Executes a shell command",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
          },
        },
        required: ["command"],
      },
    },
  ]);

  assert.deepEqual(openAiRequest.input, [
    {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "List files",
        },
      ],
    },
    {
      type: "function_call",
      call_id: "toolu_1",
      name: "Bash",
      arguments: '{"command":"ls -la"}',
    },
    {
      type: "function_call_output",
      call_id: "toolu_1",
      output: "file-a\nfile-b",
    },
  ]);
  assert.equal(openAiRequest.max_output_tokens, 1024);
});

test("toOpenAiResponsesRequest ignores malformed tool blocks that cannot be serialized safely", () => {
  const request = toChatRequest(
    compileRequest({
      sessionId: "session-3",
      turnId: "turn-3",
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "",
              name: "",
              input: {},
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "",
              content: "tool output",
              is_error: false,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "continue",
            },
          ],
        },
      ],
    }),
  );

  const openAiRequest = toOpenAiResponsesRequest(request);

  assert.deepEqual(openAiRequest.input, [
    {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "continue",
        },
      ],
    },
  ]);
  assert.equal(openAiRequest.max_output_tokens, 1024);
});

test("toOpenAiResponsesRequest replays raw Responses output items for assistant turns", () => {
  const request = toChatRequest(
    compileRequest({
      sessionId: "session-4",
      turnId: "turn-4",
      messages: [
        {
          role: "assistant",
          providerState: {
            openaiResponsesOutput: [
              {
                type: "reasoning",
                id: "rs_1",
                summary: [
                  {
                    type: "summary_text",
                    text: "Need to inspect files first.",
                  },
                ],
              },
              {
                type: "function_call",
                call_id: "call_1",
                name: "Bash",
                arguments: '{"command":"ls"}',
              },
            ],
          },
          content: [
            {
              type: "tool_use",
              id: "call_1",
              name: "Bash",
              input: {
                command: "ls",
              },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_1",
              content: "docs\nsrc",
              is_error: false,
            },
          ],
        },
      ],
    }),
  );

  const openAiRequest = toOpenAiResponsesRequest(request);

  assert.deepEqual(openAiRequest.input, [
    {
      type: "reasoning",
      id: "rs_1",
      summary: [
        {
          type: "summary_text",
          text: "Need to inspect files first.",
        },
      ],
    },
    {
      type: "function_call",
      call_id: "call_1",
      name: "Bash",
      arguments: '{"command":"ls"}',
    },
    {
      type: "function_call_output",
      call_id: "call_1",
      output: "docs\nsrc",
    },
  ]);
  assert.equal(openAiRequest.max_output_tokens, 1024);
});

test("toOpenAiResponsesRequest adds reasoning controls for visible and continuity-safe requests", () => {
  const request = toChatRequest(
    compileRequest({
      sessionId: "session-5",
      turnId: "turn-5",
      reasoning: {
        visibility: "user-visible",
        openai: {
          effort: "low",
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Plan this change",
            },
          ],
        },
      ],
    }),
  );

  const openAiRequest = toOpenAiResponsesRequest(request);

  assert.deepEqual(openAiRequest.reasoning, {
    effort: "low",
    summary: "auto",
  });
  assert.deepEqual(openAiRequest.include, ["reasoning.encrypted_content"]);
});

test("toOpenAiResponsesRequest can keep reasoning continuity without showing summaries", () => {
  const request = toChatRequest(
    compileRequest({
      sessionId: "session-6",
      turnId: "turn-6",
      reasoning: {
        visibility: "continuity-only",
        openai: {
          effort: "medium",
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Use the tool and continue",
            },
          ],
        },
      ],
    }),
  );

  const openAiRequest = toOpenAiResponsesRequest(request);

  assert.deepEqual(openAiRequest.reasoning, {
    effort: "medium",
  });
  assert.deepEqual(openAiRequest.include, ["reasoning.encrypted_content"]);
});

test("toOpenAiResponsesRequest resolves auto reasoning effort for OpenAI surfaces", () => {
  const request = toChatRequest(
    compileRequest({
      sessionId: "session-6a",
      turnId: "turn-6a",
      reasoning: {
        visibility: "user-visible",
        auto: {
          effort: "high",
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Think carefully",
            },
          ],
        },
      ],
    }),
  );

  const openAiRequest = toOpenAiResponsesRequest(request);

  assert.deepEqual(openAiRequest.reasoning, {
    effort: "high",
    summary: "auto",
  });
  assert.deepEqual(openAiRequest.include, ["reasoning.encrypted_content"]);
});
