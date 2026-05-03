import type { AgentEvent } from "@nuvin/nuvin-core/shared";
import { describe, expect, it } from "vitest";

import {
  appendUserMessage,
  applyAgentEvent,
  createMessageState,
  setToolMessageStatus,
} from "#src/lib/messages/state.js";

describe("messageState", () => {
  it("appends a user message", () => {
    const state = appendUserMessage(createMessageState(), "hello");

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      role: "user",
      text: "hello",
    });
  });

  it("merges streaming assistant chunks into a single message", () => {
    let state = createMessageState();

    state = applyAgentEvent(state, {
      type: "assistant_chunk",
      index: 0,
      messageId: "assistant-1",
      chunk: {
        type: "content_delta",
        index: 0,
        text: "hello",
      },
    } satisfies AgentEvent);

    state = applyAgentEvent(state, {
      type: "assistant_chunk",
      index: 0,
      messageId: "assistant-1",
      chunk: {
        type: "content_delta",
        index: 0,
        text: " world",
      },
    } satisfies AgentEvent);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      role: "assistant",
      text: "hello world",
      live: true,
    });
  });

  it("tracks tool call, output, and final status in one tool message", () => {
    let state = createMessageState();

    state = applyAgentEvent(state, {
      type: "tool_call",
      toolCall: {
        type: "tool_use",
        id: "tool-1",
        name: "Bash",
        input: {
          command: "ls -la",
        },
      },
    } satisfies AgentEvent);

    state = applyAgentEvent(state, {
      type: "tool_output_chunk",
      toolCall: {
        type: "tool_use",
        id: "tool-1",
        name: "Bash",
        input: {
          command: "ls -la",
        },
      },
      chunk: {
        output: "file-a\n",
        structured: {
          value: "file-a\n",
        },
      },
    } satisfies AgentEvent);

    state = applyAgentEvent(state, {
      type: "tool_result",
      result: {
        callId: "tool-1",
        toolName: "Bash",
        status: "ok",
        output: "file-a\n",
        structured: {},
        chunks: [],
        meta: {
          transforms: [],
        },
      },
    } satisfies AgentEvent);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      role: "tool",
      toolName: "Bash",
      status: "ok",
      summary: "ls -la",
      text: "file-a\n",
      input: {
        command: "ls -la",
      },
      structured: {},
    });
  });

  it("stores tool input and structured result data for custom renderers", () => {
    let state = createMessageState();

    const toolCall = {
      type: "tool_use",
      id: "file-edit-1",
      name: "FileEdit",
      input: {
        filePath: "src/config.ts",
        oldText: "old",
        newText: "new",
      },
    } as const;

    state = applyAgentEvent(state, {
      type: "tool_started",
      toolCall,
    } satisfies AgentEvent);

    state = applyAgentEvent(state, {
      type: "tool_completed",
      toolCall,
      result: {
        callId: "file-edit-1",
        toolName: "FileEdit",
        status: "ok",
        output: "Edit applied successfully.",
        structured: {
          filePath: "src/config.ts",
          lineNumbers: {
            oldStartLine: 4,
            oldEndLine: 4,
            newStartLine: 4,
            newEndLine: 4,
            oldLineCount: 1,
            newLineCount: 1,
          },
        },
        chunks: [],
        meta: {
          transforms: [],
        },
      },
    } satisfies AgentEvent);

    expect(state.messages[0]).toMatchObject({
      role: "tool",
      toolName: "FileEdit",
      input: toolCall.input,
      structured: {
        filePath: "src/config.ts",
        lineNumbers: {
          oldStartLine: 4,
          newStartLine: 4,
        },
      },
    });
  });

  it("marks a tool completed when the runtime completion event arrives before the batched result", () => {
    let state = createMessageState();

    const toolCall = {
      type: "tool_use",
      id: "tool-1",
      name: "Bash",
      input: {
        command: "echo $RANDOM",
      },
    } as const;

    state = applyAgentEvent(state, {
      type: "tool_call",
      toolCall,
    } satisfies AgentEvent);

    state = applyAgentEvent(state, {
      type: "tool_started",
      toolCall,
    } satisfies AgentEvent);

    state = applyAgentEvent(state, {
      type: "tool_output_chunk",
      toolCall,
      chunk: {
        output: "5088\n",
        structured: {
          value: "5088\n",
        },
      },
    } satisfies AgentEvent);

    state = applyAgentEvent(state, {
      type: "tool_completed",
      toolCall,
      result: {
        callId: "tool-1",
        toolName: "Bash",
        status: "ok",
        output: "5088\n",
        structured: {},
        chunks: [],
        meta: {
          transforms: [],
        },
      },
    } satisfies AgentEvent);

    expect(state.messages[0]).toMatchObject({
      role: "tool",
      status: "ok",
      text: "5088\n",
    });

    state = applyAgentEvent(state, {
      type: "tool_result",
      result: {
        callId: "tool-1",
        toolName: "Bash",
        status: "ok",
        output: "5088\n",
        structured: {},
        chunks: [],
        meta: {
          transforms: [],
        },
      },
    } satisfies AgentEvent);

    expect(state.messages[0]).toMatchObject({
      role: "tool",
      status: "ok",
      text: "5088\n",
    });
  });

  it("tags messages with parentToolCallId when delegated child agent events arrive", () => {
    let state = createMessageState();

    state = applyAgentEvent(state, {
      type: "tool_call",
      toolCall: {
        type: "tool_use",
        id: "delegate-1",
        name: "AssignTask",
        input: { agentId: "researcher", task: "investigate" },
      },
    } satisfies AgentEvent);

    state = applyAgentEvent(
      state,
      {
        type: "assistant_chunk",
        index: 0,
        messageId: "child-assistant-1",
        chunk: { type: "content_delta", index: 0, text: "looking…" },
      } satisfies AgentEvent,
      "delegate-1",
    );

    state = applyAgentEvent(
      state,
      {
        type: "tool_call",
        toolCall: {
          type: "tool_use",
          id: "child-tool-1",
          name: "Bash",
          input: { command: "rg foo" },
        },
      } satisfies AgentEvent,
      "delegate-1",
    );

    const delegateMessage = state.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "delegate-1",
    );
    expect(delegateMessage?.parentToolCallId).toBeUndefined();

    const childAssistant = state.messages.find((message) => message.role === "assistant");
    expect(childAssistant?.parentToolCallId).toBe("delegate-1");

    const childTool = state.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "child-tool-1",
    );
    expect(childTool?.parentToolCallId).toBe("delegate-1");
  });

  it("marks tool calls as pending and supports local approval status updates", () => {
    let state = createMessageState();

    state = applyAgentEvent(state, {
      type: "tool_call",
      toolCall: {
        type: "tool_use",
        id: "tool-1",
        name: "Bash",
        input: {
          command: "ls -la",
        },
      },
    } satisfies AgentEvent);

    expect(state.messages[0]).toMatchObject({
      role: "tool",
      status: "pending",
    });

    state = setToolMessageStatus(state, "tool-1", "approved");

    expect(state.messages[0]).toMatchObject({
      role: "tool",
      status: "approved",
    });

    state = applyAgentEvent(state, {
      type: "tool_rejected",
      toolCall: {
        type: "tool_use",
        id: "tool-1",
        name: "Bash",
        input: {
          command: "ls -la",
        },
      },
      result: {
        callId: "tool-1",
        toolName: "Bash",
        status: "error",
        output: "User rejected tool execution (Bash)",
        structured: {
          error: "tool_rejected",
        },
        chunks: [],
        meta: {
          transforms: [],
        },
      },
    } satisfies AgentEvent);

    expect(state.messages[0]).toMatchObject({
      role: "tool",
      status: "rejected",
      text: "User rejected tool execution (Bash)",
    });
  });
});
