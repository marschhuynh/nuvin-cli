import type {
  ChatRequest,
  ChatResponse,
  CompileRequestInput,
  ContentBlock,
  ContentInput,
  Message,
  MessageInput,
  ModelRequest,
  ModelResponse,
  SystemInput,
  TextBlock,
  ToolResult,
  ToolResultBlock,
  ToolUseBlock,
} from "../shared/types.ts";

export function createTextBlock(text: string): TextBlock {
  return {
    type: "text",
    text,
  };
}

export function normalizeTextBlock(block: TextBlock): TextBlock {
  return createTextBlock(block.text ?? "");
}

export function normalizeContent(content: ContentInput): ContentBlock[] {
  if (typeof content === "string") {
    return [createTextBlock(content)];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.map((block) => {
    if (block.type === "text") {
      return normalizeTextBlock(block);
    }

    return structuredClone(block) as ContentBlock;
  });
}

export function normalizeSystem(system: SystemInput = []): TextBlock[] {
  return normalizeContent(system).filter((block): block is TextBlock => block.type === "text");
}

export function normalizeMessage(message: MessageInput): Message {
  return {
    ...(typeof message.id === "string" ? { id: message.id } : {}),
    role: message.role,
    content: normalizeContent(message.content),
    ...(message.providerState ? { providerState: structuredClone(message.providerState) } : {}),
  };
}

export function compileRequest(input: CompileRequestInput): ModelRequest {
  return {
    model: input.model ?? "claude-sonnet-4-20250514",
    max_tokens: input.max_tokens ?? 1024,
    ...(input.reasoning ? { reasoning: structuredClone(input.reasoning) } : {}),
    system: normalizeSystem(input.system),
    messages: input.messages.map(normalizeMessage),
    tools: structuredClone(input.tools ?? []),
    metadata: {
      session_id: input.sessionId,
      turn_id: input.turnId,
    },
  };
}

export function toChatRequest(request: ModelRequest): ChatRequest {
  return {
    model: request.model,
    maxTokens: request.max_tokens,
    ...(request.reasoning ? { reasoning: structuredClone(request.reasoning) } : {}),
    system: structuredClone(request.system),
    messages: structuredClone(request.messages),
    tools: structuredClone(request.tools),
    metadata: {
      sessionId: request.metadata.session_id,
      turnId: request.metadata.turn_id,
    },
  };
}

export function toModelRequest(request: ChatRequest): ModelRequest {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    ...(request.reasoning ? { reasoning: structuredClone(request.reasoning) } : {}),
    system: structuredClone(request.system),
    messages: structuredClone(request.messages),
    tools: structuredClone(request.tools),
    metadata: {
      session_id: request.metadata.sessionId,
      turn_id: request.metadata.turnId,
    },
  };
}

export function toProviderModelRequest(
  request: ChatRequest,
): Omit<ModelRequest, "metadata" | "reasoning"> {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    system: structuredClone(request.system),
    messages: structuredClone(request.messages),
    tools: structuredClone(request.tools),
  };
}

export function toChatResponse(response: ModelResponse): ChatResponse {
  return {
    id: response.id,
    content: structuredClone(response.content),
    stopReason: response.stop_reason,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      ...(response.usage.reasoning_tokens !== undefined
        ? { reasoningTokens: response.usage.reasoning_tokens }
        : {}),
    },
    ...(response.providerState ? { providerState: structuredClone(response.providerState) } : {}),
  };
}

export function toModelResponse(response: ChatResponse): ModelResponse {
  return {
    id: response.id,
    type: "message",
    role: "assistant",
    content: structuredClone(response.content),
    stop_reason: response.stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: response.usage.inputTokens,
      output_tokens: response.usage.outputTokens,
      ...(response.usage.reasoningTokens !== undefined
        ? { reasoning_tokens: response.usage.reasoningTokens }
        : {}),
    },
    ...(response.providerState ? { providerState: structuredClone(response.providerState) } : {}),
  };
}

export function responseToAssistantMessage(response: ModelResponse | ChatResponse): Message {
  return {
    role: "assistant",
    content: normalizeContent(response.content),
    ...(response.providerState ? { providerState: structuredClone(response.providerState) } : {}),
  };
}

export function createReasoningMessage(message: Message | undefined): Message | undefined {
  const content = normalizeContent(message?.content).filter((block) => {
    return (
      block.type === "anthropic_redacted_thinking" ||
      block.type === "anthropic_thinking" ||
      block.type === "openai_reasoning"
    );
  });

  if (content.length === 0) {
    return undefined;
  }

  return {
    role: "assistant",
    content,
  };
}

export function createAssistantTextMessage(message: Message | undefined): Message | undefined {
  const content = normalizeContent(message?.content).filter((block) => {
    return block.type === "text";
  });

  if (content.length === 0) {
    return undefined;
  }

  return {
    role: "assistant",
    content,
  };
}

export function createToolUseMessage(message: Message | undefined): Message | undefined {
  const content = normalizeContent(message?.content).filter((block) => {
    return block.type === "tool_use";
  });

  if (content.length === 0) {
    return undefined;
  }

  return {
    role: "assistant",
    content,
  };
}

export function getTextFromMessage(message: Message | undefined): string {
  return normalizeContent(message?.content)
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export function getReasoningTextFromMessage(message: Message | undefined): string {
  return normalizeContent(message?.content)
    .flatMap((block) => {
      if (block.type === "anthropic_thinking") {
        return block.thinking.trim().length > 0 ? [block.thinking] : [];
      }

      if (block.type === "anthropic_redacted_thinking") {
        return ["(redacted reasoning)"];
      }

      if (block.type !== "openai_reasoning") {
        return [];
      }

      const summary = block.summary
        .map((entry) => entry.text)
        .filter((text) => text.trim().length > 0)
        .join("\n\n");

      if (summary.length > 0) {
        return [summary];
      }

      if (block.text && block.text.trim().length > 0) {
        return [block.text];
      }

      return block.encryptedContent ? ["(encrypted reasoning)"] : [];
    })
    .join("\n\n");
}

export function getToolUseBlocks(message: Message | undefined): ToolUseBlock[] {
  return normalizeContent(message?.content).filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  );
}

export function getToolResultBlocks(message: Message | undefined): ToolResultBlock[] {
  return normalizeContent(message?.content).filter(
    (block): block is ToolResultBlock => block.type === "tool_result",
  );
}

export function createToolResultUserMessage(toolResults: ToolResult[]): Message {
  return {
    role: "user",
    content: toolResults.map((toolResult) => {
      return {
        type: "tool_result",
        tool_use_id: toolResult.callId,
        content: toolResult.output,
        is_error: toolResult.status === "error",
      };
    }),
  };
}
