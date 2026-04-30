import { getReasoningTextFromMessage, getTextFromMessage } from "@nuvin/agent-core/formats";
import type {
  AgentEvent,
  JsonObject,
  JsonValue,
  ToolResult,
  ToolUseBlock,
} from "@nuvin/agent-core/shared";

export type ToolMessageStatus = "approved" | "error" | "ok" | "pending" | "rejected" | "running";

export type BasicTuiMessage = {
  id: string;
  live?: boolean;
  /**
   * When set, this message was emitted by a delegated child agent and should
   * be rendered nested under the `AssignTask` tool call identified by
   * this id rather than at the top level of the message list.
   */
  parentToolCallId?: string;
  role: "assistant" | "error" | "info" | "reasoning" | "user";
  text: string;
};

export type ToolTuiMessage = {
  id: string;
  /**
   * When set, this tool message was dispatched by a delegated child agent and
   * should be rendered nested under the parent `AssignTask` tool call.
   */
  parentToolCallId?: string;
  role: "tool";
  status: ToolMessageStatus;
  summary: string;
  text: string;
  toolCallId: string;
  toolName: string;
  input?: JsonObject;
  structured?: JsonObject;
};

export type TuiMessage = BasicTuiMessage | ToolTuiMessage;

export type MessageState = {
  assistantMessageIds: Record<string, string>;
  messages: TuiMessage[];
  nextId: number;
  reasoningMessageIds: Record<string, string>;
  toolMessageIds: Record<string, string>;
};

function createMessageId(state: MessageState): string {
  return `message-${state.nextId}`;
}

function withUpdatedMessage(
  state: MessageState,
  id: string,
  update: (message: TuiMessage) => TuiMessage,
): MessageState {
  return {
    ...state,
    messages: state.messages.map((message) => (message.id === id ? update(message) : message)),
  };
}

function addMessage(state: MessageState, message: TuiMessage): MessageState {
  return {
    ...state,
    messages: [...state.messages, message],
    nextId: state.nextId + 1,
  };
}

function scopedRegistryKey(scope: string | undefined, id: string): string {
  return scope ? `${scope}::${id}` : id;
}

function upsertTrackedTextMessage(
  state: MessageState,
  registryKey: "assistantMessageIds" | "reasoningMessageIds",
  messageId: string,
  role: BasicTuiMessage["role"],
  text: string,
  mode: "append" | "replace",
  live: boolean,
  parentToolCallId?: string,
): MessageState {
  const trackingKey = scopedRegistryKey(parentToolCallId, messageId);
  const existingId = state[registryKey][trackingKey];

  if (existingId) {
    return withUpdatedMessage(state, existingId, (message) => {
      if (message.role !== role) {
        return message;
      }

      return {
        ...message,
        live,
        text: mode === "append" ? `${message.text}${text}` : text,
      };
    });
  }

  const id = createMessageId(state);
  const nextState = addMessage(state, {
    id,
    role,
    text,
    live,
    ...(parentToolCallId ? { parentToolCallId } : {}),
  });

  return {
    ...nextState,
    [registryKey]: {
      ...nextState[registryKey],
      [trackingKey]: id,
    },
  };
}

function asJsonObject(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function summarizeToolInput(input: JsonValue): string {
  const objectInput = asJsonObject(input);
  if (!objectInput) {
    return JSON.stringify(input);
  }

  const command = objectInput.command;
  if (typeof command === "string") {
    return command;
  }

  const entries = Object.entries(objectInput);
  if (entries.length === 1 && typeof entries[0]?.[1] === "string") {
    return String(entries[0][1]);
  }

  return JSON.stringify(objectInput);
}

function mergeToolResultText(currentText: string, result: ToolResult): string {
  if (currentText.length === 0) {
    return result.output;
  }

  if (result.output.length === 0 || currentText === result.output) {
    return currentText;
  }

  if (result.output.startsWith(currentText)) {
    return result.output;
  }

  return currentText;
}

function ensureToolMessage(
  state: MessageState,
  toolCall: ToolUseBlock,
  parentToolCallId?: string,
): MessageState {
  const existingId = state.toolMessageIds[toolCall.id];
  if (existingId) {
    return withUpdatedMessage(state, existingId, (message) => {
      if (message.role !== "tool" || message.input !== undefined) {
        return message;
      }

      return {
        ...message,
        input: asJsonObject(toolCall.input),
      };
    });
  }

  const id = createMessageId(state);
  const nextState = addMessage(state, {
    id,
    role: "tool",
    toolName: toolCall.name,
    toolCallId: toolCall.id,
    summary: summarizeToolInput(toolCall.input),
    text: "",
    status: "pending",
    input: asJsonObject(toolCall.input),
    ...(parentToolCallId ? { parentToolCallId } : {}),
  });

  return {
    ...nextState,
    toolMessageIds: {
      ...nextState.toolMessageIds,
      [toolCall.id]: id,
    },
  };
}

export function setToolMessageStatus(
  state: MessageState,
  toolCallId: string,
  status: ToolMessageStatus,
): MessageState {
  const toolMessageId = state.toolMessageIds[toolCallId];
  if (!toolMessageId) {
    return state;
  }

  return withUpdatedMessage(state, toolMessageId, (message) => {
    if (message.role !== "tool") {
      return message;
    }

    return {
      ...message,
      status,
    };
  });
}

function applyToolResult(state: MessageState, result: ToolResult): MessageState {
  const toolMessageId = state.toolMessageIds[result.callId];
  if (!toolMessageId) {
    return addMessage(state, {
      id: createMessageId(state),
      role: "tool",
      toolName: result.toolName,
      toolCallId: result.callId,
      status: result.status,
      summary: "",
      text: result.output,
      structured: result.structured,
    });
  }

  return withUpdatedMessage(state, toolMessageId, (message) => {
    if (message.role !== "tool") {
      return message;
    }

    return {
      ...message,
      status: result.status,
      text: mergeToolResultText(message.text, result),
      structured: result.structured,
    };
  });
}

export function createMessageState(): MessageState {
  return {
    assistantMessageIds: {},
    messages: [],
    nextId: 1,
    reasoningMessageIds: {},
    toolMessageIds: {},
  };
}

export function appendUserMessage(state: MessageState, text: string): MessageState {
  return addMessage(state, {
    id: createMessageId(state),
    role: "user",
    text,
  });
}

export function appendErrorMessage(state: MessageState, text: string): MessageState {
  return addMessage(state, {
    id: createMessageId(state),
    role: "error",
    text,
  });
}

export function appendInfoMessage(state: MessageState, text: string): MessageState {
  return addMessage(state, {
    id: createMessageId(state),
    role: "info",
    text,
  });
}

/**
 * Applies an agent event to the message state. When the event was emitted by
 * a delegated child agent the host can pass `parentToolCallId` (the id of the
 * `AssignTask` tool call that spawned the child) so the resulting
 * message gets tagged for nested rendering.
 */
export function applyAgentEvent(
  state: MessageState,
  event: AgentEvent,
  parentToolCallId?: string,
): MessageState {
  switch (event.type) {
    case "assistant_chunk":
      if (!event.chunk.text) {
        return state;
      }

      return upsertTrackedTextMessage(
        state,
        "assistantMessageIds",
        event.messageId,
        "assistant",
        event.chunk.text,
        "append",
        true,
        parentToolCallId,
      );

    case "assistant_message": {
      const text = getTextFromMessage(event.message).trim();
      if (text.length === 0) {
        return state;
      }

      return upsertTrackedTextMessage(
        state,
        "assistantMessageIds",
        event.message.id,
        "assistant",
        text,
        "replace",
        false,
        parentToolCallId,
      );
    }

    case "reasoning_chunk":
      if (!event.text) {
        return state;
      }

      return upsertTrackedTextMessage(
        state,
        "reasoningMessageIds",
        event.messageId,
        "reasoning",
        event.text,
        "append",
        true,
        parentToolCallId,
      );

    case "reasoning_message": {
      const text = getReasoningTextFromMessage(event.message).trim();
      if (text.length === 0) {
        return state;
      }

      return upsertTrackedTextMessage(
        state,
        "reasoningMessageIds",
        event.message.id,
        "reasoning",
        text,
        "replace",
        false,
        parentToolCallId,
      );
    }

    case "final_message": {
      const text = getTextFromMessage(event.message).trim();
      if (text.length === 0) {
        return state;
      }

      return upsertTrackedTextMessage(
        state,
        "assistantMessageIds",
        event.message.id,
        "assistant",
        text,
        "replace",
        false,
        parentToolCallId,
      );
    }

    case "tool_call":
      return ensureToolMessage(state, event.toolCall, parentToolCallId);

    case "tool_started": {
      const toolState = ensureToolMessage(state, event.toolCall, parentToolCallId);
      const toolMessageId = toolState.toolMessageIds[event.toolCall.id];

      return withUpdatedMessage(toolState, toolMessageId, (message) => {
        if (message.role !== "tool") {
          return message;
        }

        return {
          ...message,
          status: "running",
        };
      });
    }

    case "tool_output_chunk": {
      const toolState = ensureToolMessage(state, event.toolCall, parentToolCallId);
      const toolMessageId = toolState.toolMessageIds[event.toolCall.id];

      return withUpdatedMessage(toolState, toolMessageId, (message) => {
        if (message.role !== "tool") {
          return message;
        }

        return {
          ...message,
          text: `${message.text}${event.chunk.output}`,
        };
      });
    }

    case "tool_completed": {
      const toolState = ensureToolMessage(state, event.toolCall, parentToolCallId);

      return applyToolResult(toolState, event.result);
    }

    case "tool_result":
      return applyToolResult(state, event.result);

    case "tool_rejected": {
      const toolState = ensureToolMessage(state, event.toolCall);
      const toolMessageId = toolState.toolMessageIds[event.toolCall.id];

      return withUpdatedMessage(toolState, toolMessageId, (message) => {
        if (message.role !== "tool") {
          return message;
        }

        return {
          ...message,
          status: "rejected",
          text: event.result.output,
          structured: event.result.structured,
        };
      });
    }

    default:
      return state;
  }
}
