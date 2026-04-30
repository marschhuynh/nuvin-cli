import { resolveOpenAiReasoningConfig } from "../shared/reasoning-config.ts";
import type {
  ChatRequest,
  JsonObject,
  MessageRole,
  OpenAiInputMessage,
  OpenAiResponsesReasoningParam,
  OpenAiResponsesRequest,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from "../shared/types.ts";
import { normalizeContent } from "./message-format.ts";

function systemToInstructions(systemBlocks: TextBlock[]): string {
  return normalizeContent(systemBlocks)
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

function pushTextMessage(
  input: OpenAiResponsesRequest["input"],
  role: MessageRole,
  textBlocks: TextBlock[],
): void {
  if (textBlocks.length === 0) {
    return;
  }

  const message: OpenAiInputMessage = {
    type: "message",
    role,
    content: textBlocks.map((block) => {
      return {
        type: "input_text",
        text: block.text,
      };
    }),
  };

  input.push(message);
}

function hasSerializableToolUse(block: ToolUseBlock): boolean {
  return block.id.trim().length > 0 && block.name.trim().length > 0;
}

function hasSerializableToolResult(block: ToolResultBlock): boolean {
  return block.tool_use_id.trim().length > 0;
}

function isResponseInputObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return typeof candidate.type === "string";
}

function resolveReasoningVisibility(request: ChatRequest): "continuity-only" | "user-visible" {
  return request.reasoning?.visibility ?? "user-visible";
}

function createOpenAiResponsesReasoning(
  request: ChatRequest,
): Pick<OpenAiResponsesRequest, "include" | "reasoning"> {
  const config = resolveOpenAiReasoningConfig(request.reasoning);

  if (!config) {
    return {};
  }

  const reasoning: OpenAiResponsesReasoningParam = {};
  const summary =
    config.summary ?? (resolveReasoningVisibility(request) === "user-visible" ? "auto" : undefined);

  if (config.effort) {
    reasoning.effort = config.effort;
  }

  if (summary) {
    reasoning.summary = summary;
  }

  return {
    ...(config.includeEncryptedContent === false
      ? {}
      : { include: ["reasoning.encrypted_content"] }),
    ...(Object.keys(reasoning).length > 0 ? { reasoning } : {}),
  };
}

function pushAssistantProviderState(
  input: OpenAiResponsesRequest["input"],
  message: ChatRequest["messages"][number],
): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  const outputItems = message.providerState?.openaiResponsesOutput ?? [];

  if (outputItems.length === 0) {
    return false;
  }

  for (const item of outputItems) {
    if (isResponseInputObject(item)) {
      input.push(structuredClone(item));
    }
  }

  return true;
}

export function toOpenAiResponsesRequest(request: ChatRequest): OpenAiResponsesRequest {
  const input: OpenAiResponsesRequest["input"] = [];

  for (const message of request.messages) {
    if (pushAssistantProviderState(input, message)) {
      continue;
    }

    const pendingTextBlocks: TextBlock[] = [];

    for (const block of normalizeContent(message.content)) {
      if (block.type === "text") {
        pendingTextBlocks.push(block);
        continue;
      }

      pushTextMessage(input, message.role, pendingTextBlocks.splice(0));

      if (block.type === "tool_use") {
        if (!hasSerializableToolUse(block)) {
          continue;
        }

        input.push({
          type: "function_call",
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        });
        continue;
      }

      if (block.type === "tool_result") {
        if (!hasSerializableToolResult(block)) {
          continue;
        }

        input.push({
          type: "function_call_output",
          call_id: block.tool_use_id,
          output: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
        });
      }
    }

    pushTextMessage(input, message.role, pendingTextBlocks);
  }

  return {
    ...createOpenAiResponsesReasoning(request),
    model: request.model,
    instructions: systemToInstructions(request.system),
    input,
    max_output_tokens: request.maxTokens,
    tools: request.tools.map((tool) => {
      return {
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      };
    }),
  };
}
