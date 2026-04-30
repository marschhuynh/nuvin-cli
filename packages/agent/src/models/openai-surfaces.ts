import { normalizeContent } from "../formats/message-format.ts";
import { toOpenAiResponsesRequest } from "../formats/provider-adapters.ts";
import { resolveOpenAiReasoningConfig } from "../shared/reasoning-config.ts";
import type {
  ChatRequest,
  ChatResponse,
  ChatResponseChunk,
  JsonValue,
  OpenAiReasoningBlock,
  OpenAiReasoningOutputItem,
  OpenAiResponsesOutputItem,
  TextBlock,
  ToolSchema,
  ToolUseBlock,
} from "../shared/types.ts";
import type { RoutedModelStreamParser, RoutedModelSurface } from "./routed-model.ts";

export const OPENAI_CHAT_COMPLETIONS_SURFACE = "openai-chat-completions";
export const OPENAI_CHAT_COMPLETIONS_STREAM_SURFACE = "openai-chat-completions-stream";
export const OPENAI_RESPONSES_SURFACE = "openai-responses";
export const OPENAI_RESPONSES_STREAM_SURFACE = "openai-responses-stream";
export const OPENAI_RESPONSES_WEBSOCKET_SURFACE = "openai-responses-ws";

interface OpenAiChatCompletionToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAiChatCompletionToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: ToolSchema["input_schema"];
  };
}

interface OpenAiChatCompletionMessage {
  role: "assistant" | "system" | "tool" | "user";
  content: null | string;
  tool_calls?: OpenAiChatCompletionToolCall[];
  tool_call_id?: string;
}

interface OpenAiChatCompletionsRequest {
  model: string;
  messages: OpenAiChatCompletionMessage[];
  max_completion_tokens?: number;
  max_tokens?: number;
  reasoning_effort?: "high" | "low" | "medium" | "minimal" | "none" | "xhigh";
  stream: boolean;
  tools?: OpenAiChatCompletionToolDefinition[];
}

type OpenAiAssistantContentPart =
  | {
      type: "refusal";
      refusal: string;
    }
  | {
      type: "text";
      text: string;
    };

interface OpenAiChatCompletionsResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: null | string | OpenAiAssistantContentPart[];
      role?: string;
      tool_calls?: OpenAiChatCompletionToolCall[];
    };
    finish_reason?: null | string;
  }>;
  usage?: {
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface OpenAiChatCompletionStreamEvent {
  id?: string;
  choices?: Array<{
    delta?: {
      content?: null | string;
      refusal?: string;
      tool_calls?: Array<{
        id?: string;
        index?: number;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: null | string;
  }>;
  usage?: {
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface ResponsesApiResponse {
  id: string;
  object: "response";
  status: "cancelled" | "completed" | "failed" | "in_progress" | "incomplete" | "queued";
  output?: OpenAiResponsesOutputItem[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
  error?: {
    code?: string;
    message: string;
  };
}

export class OpenAiApiError extends Error {
  public readonly status: number;
  public readonly body: string;

  constructor(status: number, body: string, message: string) {
    super(message);
    this.name = "OpenAiApiError";
    this.status = status;
    this.body = body;
  }
}

export class OpenAiResponsesStreamError extends Error {
  public readonly code?: string;
  public readonly status?: number;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
    } = {},
  ) {
    super(message);
    this.name = "OpenAiResponsesStreamError";
    this.code = options.code;
    this.status = options.status;
  }
}

function stringifySystem(system: ChatRequest["system"]): string {
  return system.map((block) => block.text).join("\n\n");
}

function createToolDefinitions(
  tools: ToolSchema[],
): OpenAiChatCompletionToolDefinition[] | undefined {
  if (tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    };
  });
}

function stringifyValue(value: JsonValue | string): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseToolInput(serializedInput: string): JsonValue {
  try {
    return JSON.parse(serializedInput) as JsonValue;
  } catch {
    return serializedInput;
  }
}

function isResponsesReasoningItem(
  item: OpenAiResponsesOutputItem,
): item is OpenAiReasoningOutputItem {
  return typeof item === "object" && item !== null && "type" in item && item.type === "reasoning";
}

function isResponsesMessageItem(item: OpenAiResponsesOutputItem): item is {
  type: "message";
  content?: Array<{
    refusal?: string;
    text?: string;
    type?: string;
  }>;
} {
  return typeof item === "object" && item !== null && "type" in item && item.type === "message";
}

function isResponsesFunctionCallItem(item: OpenAiResponsesOutputItem): item is {
  arguments?: string;
  call_id?: string;
  name?: string;
  type: "function_call";
} {
  return (
    typeof item === "object" && item !== null && "type" in item && item.type === "function_call"
  );
}

function createContentBlocks(
  text: string,
  toolCalls: OpenAiChatCompletionToolCall[],
): Array<TextBlock | ToolUseBlock> {
  const content: Array<TextBlock | ToolUseBlock> = [];

  if (text.length > 0) {
    content.push({
      type: "text",
      text,
    });
  }

  for (const toolCall of toolCalls) {
    if (toolCall.id.trim().length === 0 || toolCall.function.name.trim().length === 0) {
      continue;
    }

    content.push({
      type: "tool_use",
      id: toolCall.id,
      name: toolCall.function.name,
      input: parseToolInput(toolCall.function.arguments),
    });
  }

  return content;
}

function createUsage(
  usage:
    | {
        completion_tokens_details?: {
          reasoning_tokens?: number;
        };
        prompt_tokens?: number;
        completion_tokens?: number;
      }
    | undefined,
): ChatResponse["usage"] {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    ...(usage?.completion_tokens_details?.reasoning_tokens !== undefined
      ? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens }
      : {}),
  };
}

function resolveReasoningVisibility(request: ChatRequest): "continuity-only" | "user-visible" {
  return request.reasoning?.visibility ?? "user-visible";
}

function isUserVisibleReasoning(request: ChatRequest): boolean {
  return (
    resolveOpenAiReasoningConfig(request.reasoning) !== undefined &&
    resolveReasoningVisibility(request) === "user-visible"
  );
}

function createChatRequestBody(
  request: ChatRequest,
  stream: boolean,
): OpenAiChatCompletionsRequest {
  const messages: OpenAiChatCompletionMessage[] = [];
  const systemText = stringifySystem(request.system);

  if (systemText.length > 0) {
    messages.push({
      role: "system",
      content: systemText,
    });
  }

  for (const message of request.messages) {
    const pendingText: string[] = [];
    const pendingToolCalls: OpenAiChatCompletionToolCall[] = [];

    const flushConversationMessage = (): void => {
      if (message.role === "assistant") {
        if (pendingText.length === 0 && pendingToolCalls.length === 0) {
          return;
        }

        messages.push({
          role: "assistant",
          content: pendingText.length > 0 ? pendingText.join("\n\n") : null,
          ...(pendingToolCalls.length > 0 ? { tool_calls: pendingToolCalls.splice(0) } : {}),
        });
        pendingText.length = 0;
        return;
      }

      if (pendingText.length === 0) {
        return;
      }

      messages.push({
        role: message.role,
        content: pendingText.join("\n\n"),
      });
      pendingText.length = 0;
    };

    for (const block of normalizeContent(message.content)) {
      if (block.type === "text") {
        pendingText.push(block.text);
        continue;
      }

      if (block.type === "tool_use") {
        pendingToolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
        continue;
      }

      if (block.type !== "tool_result") {
        continue;
      }

      flushConversationMessage();
      messages.push({
        role: "tool",
        content: stringifyValue(block.content),
        tool_call_id: block.tool_use_id,
      });
    }

    flushConversationMessage();
  }

  const chatReasoning = resolveOpenAiReasoningConfig(request.reasoning);

  return {
    model: request.model,
    messages,
    stream,
    ...(chatReasoning
      ? { max_completion_tokens: request.maxTokens }
      : { max_tokens: request.maxTokens }),
    ...(chatReasoning?.effort ? { reasoning_effort: chatReasoning.effort } : {}),
    ...(createToolDefinitions(request.tools)
      ? { tools: createToolDefinitions(request.tools) }
      : {}),
  };
}

function createResponsesRequestBody(
  request: ChatRequest,
  stream: boolean,
): Record<string, unknown> {
  return {
    ...toOpenAiResponsesRequest(request),
    ...(stream ? { stream: true } : {}),
    store: false,
  };
}

export function createOpenAiResponsesWebSocketEvent(
  request: ChatRequest,
  options: {
    input?: ReturnType<typeof toOpenAiResponsesRequest>["input"];
    previousResponseId?: string;
  } = {},
): Record<string, unknown> {
  const baseRequest = toOpenAiResponsesRequest(request);

  return {
    type: "response.create",
    ...baseRequest,
    ...(options.input ? { input: options.input } : {}),
    ...(options.previousResponseId ? { previous_response_id: options.previousResponseId } : {}),
    store: false,
  };
}

function normalizeAssistantContent(
  content: null | string | OpenAiAssistantContentPart[] | undefined,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      return part.type === "text" ? part.text : part.refusal;
    })
    .join("");
}

function normalizeResponsesMessageContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      const candidate = part as {
        refusal?: string;
        text?: string;
        type?: string;
      };

      if (candidate.type === "output_text" && typeof candidate.text === "string") {
        return candidate.text;
      }

      if (candidate.type === "refusal" && typeof candidate.refusal === "string") {
        return candidate.refusal;
      }

      return "";
    })
    .join("");
}

function extractOpenAiReasoningText(item: OpenAiReasoningOutputItem): string {
  if (typeof item.text === "string") {
    return item.text;
  }

  if (!Array.isArray(item.content)) {
    return "";
  }

  return item.content
    .filter((part) => part.type === "reasoning_text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}

function createOpenAiReasoningBlock(item: OpenAiReasoningOutputItem): OpenAiReasoningBlock {
  const text = extractOpenAiReasoningText(item);

  return {
    type: "openai_reasoning",
    summary: structuredClone(item.summary ?? []),
    ...(item.id ? { id: item.id } : {}),
    ...(item.encrypted_content ? { encryptedContent: item.encrypted_content } : {}),
    ...(text.length > 0 ? { text } : {}),
  };
}

function hasVisibleOpenAiReasoning(block: OpenAiReasoningBlock): boolean {
  return block.summary.length > 0 || typeof block.text === "string";
}

function parseChatCompletionResponse(response: OpenAiChatCompletionsResponse): ChatResponse {
  const textParts: string[] = [];
  const toolCalls: OpenAiChatCompletionToolCall[] = [];
  let stopReason: ChatResponse["stopReason"] = "end_turn";

  for (const choice of response.choices ?? []) {
    const message = choice.message;
    const text = normalizeAssistantContent(message?.content);

    if (text.length > 0) {
      textParts.push(text);
    }

    if (message?.tool_calls) {
      toolCalls.push(...message.tool_calls);
    }

    if (choice.finish_reason === "tool_calls") {
      stopReason = "tool_use";
    }
  }

  if (toolCalls.length > 0) {
    stopReason = "tool_use";
  }

  return {
    id: response.id ?? `chatcmpl-${Date.now()}`,
    content: createContentBlocks(textParts.join(""), toolCalls),
    stopReason,
    usage: createUsage(response.usage),
  };
}

function parseResponsesResponse(
  response: ResponsesApiResponse,
  request: ChatRequest,
): ChatResponse {
  const content: ChatResponse["content"] = [];

  for (const item of response.output ?? []) {
    if (isResponsesReasoningItem(item)) {
      if (isUserVisibleReasoning(request)) {
        const reasoningBlock = createOpenAiReasoningBlock(item);

        if (hasVisibleOpenAiReasoning(reasoningBlock)) {
          content.push(reasoningBlock);
        }
      }
      continue;
    }

    if (isResponsesMessageItem(item)) {
      const text = normalizeResponsesMessageContent(item.content);

      if (text.length > 0) {
        content.push({
          type: "text",
          text,
        });
      }
      continue;
    }

    if (
      !isResponsesFunctionCallItem(item) ||
      typeof item.call_id !== "string" ||
      item.call_id.trim().length === 0 ||
      typeof item.name !== "string" ||
      item.name.trim().length === 0 ||
      typeof item.arguments !== "string"
    ) {
      continue;
    }

    content.push({
      type: "tool_use",
      id: item.call_id,
      name: item.name,
      input: parseToolInput(item.arguments),
    });
  }

  if (!content.some((block) => block.type === "text") && response.output_text) {
    content.push({
      type: "text",
      text: response.output_text,
    });
  }

  return {
    id: response.id,
    content,
    stopReason: content.some((block) => block.type === "tool_use") ? "tool_use" : "end_turn",
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      ...(response.usage?.output_tokens_details?.reasoning_tokens !== undefined
        ? { reasoningTokens: response.usage.output_tokens_details.reasoning_tokens }
        : {}),
    },
    ...(response.output
      ? {
          providerState: {
            openaiResponsesOutput: structuredClone(response.output),
            openaiResponsesResponseId: response.id,
          },
        }
      : {}),
  };
}

function extractErrorMessage(body: string): string {
  if (body.length === 0) {
    return "";
  }

  try {
    const payload = JSON.parse(body) as {
      error?: {
        message?: string;
      };
      message?: string;
    };

    if (typeof payload.error?.message === "string" && payload.error.message.trim().length > 0) {
      return payload.error.message.trim();
    }

    if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message.trim();
    }
  } catch {
    return body;
  }

  return body;
}

export async function createOpenAiApiError(response: Response): Promise<OpenAiApiError> {
  const body = (await response.text()).trim();
  const message =
    extractErrorMessage(body) || response.statusText || `OpenAI API error ${response.status}`;

  return new OpenAiApiError(response.status, body, message);
}

function readSseData(rawEvent: string): string {
  return rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
}

class OpenAiChatCompletionsStreamParser implements RoutedModelStreamParser {
  private readonly textParts: string[] = [];
  private readonly toolCallsByIndex = new Map<number, OpenAiChatCompletionToolCall>();
  private readonly toolCallOrder: OpenAiChatCompletionToolCall[] = [];
  private readonly toolUseStartEmitted = new Set<number>();
  private responseId = "";
  private stopReason: ChatResponse["stopReason"] = "end_turn";
  private usage: OpenAiChatCompletionsResponse["usage"];

  consumeSseEvent(rawEvent: string): ChatResponseChunk[] {
    const data = readSseData(rawEvent);

    if (data.length === 0 || data === "[DONE]") {
      return [];
    }

    const event = JSON.parse(data) as OpenAiChatCompletionStreamEvent;
    this.responseId = event.id ?? this.responseId;
    this.usage = event.usage ?? this.usage;

    return this.consumeEvent(event);
  }

  finish(): ChatResponse {
    if (this.toolCallOrder.length > 0) {
      this.stopReason = "tool_use";
    }

    return {
      id: this.responseId || `chatcmpl-${Date.now()}`,
      content: createContentBlocks(this.textParts.join(""), this.toolCallOrder),
      stopReason: this.stopReason,
      usage: createUsage(this.usage),
    };
  }

  private consumeEvent(event: OpenAiChatCompletionStreamEvent): ChatResponseChunk[] {
    const chunks: ChatResponseChunk[] = [];

    for (const choice of event.choices ?? []) {
      const delta = choice.delta;
      const textDelta =
        typeof delta?.content === "string"
          ? delta.content
          : typeof delta?.refusal === "string"
            ? delta.refusal
            : "";

      if (textDelta.length > 0) {
        this.textParts.push(textDelta);
        chunks.push({
          type: "content_delta",
          index: 0,
          text: textDelta,
        });
      }

      for (const toolCallDelta of delta?.tool_calls ?? []) {
        const index = toolCallDelta.index ?? 0;
        let toolCall = this.toolCallsByIndex.get(index);

        if (!toolCall) {
          toolCall = {
            id: toolCallDelta.id ?? `tool-call-${index}`,
            type: "function",
            function: {
              name: toolCallDelta.function?.name ?? "",
              arguments: "",
            },
          };
          this.toolCallsByIndex.set(index, toolCall);
          this.toolCallOrder.push(toolCall);
        }

        if (toolCallDelta.id) {
          toolCall.id = toolCallDelta.id;
        }

        if (toolCallDelta.function?.name) {
          toolCall.function.name = toolCallDelta.function.name;
        }

        if (!this.toolUseStartEmitted.has(index) && toolCall.function.name.trim().length > 0) {
          chunks.push({
            type: "tool_use_delta",
            id: toolCall.id,
            index,
            name: toolCall.function.name,
          });
          this.toolUseStartEmitted.add(index);
        }

        const argumentDelta = toolCallDelta.function?.arguments ?? "";

        if (argumentDelta.length > 0) {
          toolCall.function.arguments += argumentDelta;
          chunks.push({
            type: "tool_use_delta",
            id: toolCall.id,
            index,
            inputDelta: argumentDelta,
          });
        }
      }

      if (choice.finish_reason === "tool_calls") {
        this.stopReason = "tool_use";
      }
    }

    return chunks;
  }
}

class OpenAiResponsesStreamParser implements RoutedModelStreamParser {
  private readonly callIdToOutputIndex = new Map<string, number>();
  private finalResponse: ResponsesApiResponse | undefined;
  private readonly outputIndexToCallId = new Map<number, string>();
  private readonly outputIndexToReasoningId = new Map<number, string>();
  private readonly reasoningItems = new Map<
    string,
    {
      encryptedContent?: string;
      id: string;
      outputIndex?: number;
      summaryByIndex: Map<number, string>;
      textByIndex: Map<number, string>;
    }
  >();
  private readonly request: ChatRequest;
  private readonly responseTextParts = new Map<number, string[]>();
  private readonly toolCalls = new Map<string, OpenAiChatCompletionToolCall>();

  constructor(request: ChatRequest) {
    this.request = request;
  }

  consumeSseEvent(rawEvent: string): ChatResponseChunk[] {
    const lines = rawEvent.split("\n");
    const eventType = lines
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();

    if (data.length === 0 || data === "[DONE]") {
      return [];
    }

    const event = JSON.parse(data) as Record<string, unknown>;
    return this.consumeEvent(eventType ?? String(event.type ?? ""), event);
  }

  consumeWebSocketEvent(event: Record<string, unknown>): ChatResponseChunk[] {
    return this.consumeEvent(String(event.type ?? ""), event);
  }

  finish(): ChatResponse {
    const responsePayload = this.finalResponse ?? {
      id: `resp-${Date.now()}`,
      object: "response" as const,
      status: "completed" as const,
      output: this.buildPartialOutput(),
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    };

    return parseResponsesResponse(responsePayload, this.request);
  }

  isDone(): boolean {
    return this.finalResponse !== undefined;
  }

  private consumeEvent(eventType: string, event: Record<string, unknown>): ChatResponseChunk[] {
    switch (eventType) {
      case "response.output_text.delta": {
        const outputIndex = typeof event.output_index === "number" ? event.output_index : 0;
        const delta = typeof event.delta === "string" ? event.delta : "";

        if (delta.length > 0) {
          const textParts = this.responseTextParts.get(outputIndex) ?? [];
          textParts.push(delta);
          this.responseTextParts.set(outputIndex, textParts);
          return [
            {
              type: "content_delta",
              index: outputIndex,
              text: delta,
            },
          ];
        }
        break;
      }

      case "response.output_item.added": {
        const outputIndex = typeof event.output_index === "number" ? event.output_index : undefined;
        const item = event.item as
          | {
              call_id?: string;
              id?: string;
              name?: string;
              type?: string;
            }
          | undefined;

        if (item?.type === "function_call" && item.call_id && item.name) {
          this.toolCalls.set(item.call_id, {
            id: item.call_id,
            type: "function",
            function: {
              name: item.name,
              arguments: "",
            },
          });

          if (outputIndex !== undefined) {
            this.outputIndexToCallId.set(outputIndex, item.call_id);
            this.callIdToOutputIndex.set(item.call_id, outputIndex);
          }

          return [
            {
              type: "tool_use_delta",
              id: item.call_id,
              index: outputIndex ?? 0,
              name: item.name,
            },
          ];
        }

        if (item?.type === "reasoning" && item.id) {
          const reasoningItem = this.getOrCreateReasoningItem(item.id, outputIndex);

          if (outputIndex !== undefined) {
            this.outputIndexToReasoningId.set(outputIndex, reasoningItem.id);
          }
        }
        break;
      }

      case "response.function_call_arguments.delta": {
        const callId =
          typeof event.call_id === "string"
            ? event.call_id
            : typeof event.output_index === "number"
              ? this.outputIndexToCallId.get(event.output_index)
              : undefined;
        const delta = typeof event.delta === "string" ? event.delta : "";
        const toolCall = callId ? this.toolCalls.get(callId) : undefined;

        if (toolCall && delta.length > 0) {
          toolCall.function.arguments += delta;
          return [
            {
              type: "tool_use_delta",
              id: toolCall.id,
              index:
                this.callIdToOutputIndex.get(toolCall.id) ??
                (typeof event.output_index === "number" ? event.output_index : 0),
              inputDelta: delta,
            },
          ];
        }
        break;
      }

      case "response.function_call_arguments.done": {
        const callId =
          typeof event.call_id === "string"
            ? event.call_id
            : typeof event.output_index === "number"
              ? this.outputIndexToCallId.get(event.output_index)
              : undefined;
        const toolCall = callId ? this.toolCalls.get(callId) : undefined;

        if (toolCall && typeof event.arguments === "string") {
          toolCall.function.arguments = event.arguments;
        }
        break;
      }

      case "response.output_item.done": {
        const outputIndex = typeof event.output_index === "number" ? event.output_index : undefined;
        const item = event.item as
          | {
              arguments?: string;
              call_id?: string;
              encrypted_content?: string;
              id?: string;
              name?: string;
              summary?: Array<{
                text?: string;
                type?: string;
              }>;
              text?: string;
              type?: string;
            }
          | undefined;

        if (item?.type === "function_call") {
          const callId =
            item.call_id ??
            (outputIndex !== undefined ? this.outputIndexToCallId.get(outputIndex) : undefined);
          const toolCall = callId ? this.toolCalls.get(callId) : undefined;

          if (toolCall && typeof item.arguments === "string") {
            toolCall.function.arguments = item.arguments;
          }
          break;
        }

        if (item?.type === "reasoning" && item.id) {
          const reasoningItem = this.getOrCreateReasoningItem(item.id, outputIndex);

          if (typeof item.encrypted_content === "string") {
            reasoningItem.encryptedContent = item.encrypted_content;
          }

          if (Array.isArray(item.summary)) {
            for (let index = 0; index < item.summary.length; index += 1) {
              const part = item.summary[index];

              if (part.type === "summary_text" && typeof part.text === "string") {
                reasoningItem.summaryByIndex.set(index, part.text);
              }
            }
          }

          if (typeof item.text === "string") {
            reasoningItem.textByIndex.set(0, item.text);
          }
        }
        break;
      }

      case "response.reasoning_summary_text.delta": {
        const delta = typeof event.delta === "string" ? event.delta : "";
        const itemId =
          typeof event.item_id === "string"
            ? event.item_id
            : typeof event.output_index === "number"
              ? this.outputIndexToReasoningId.get(event.output_index)
              : undefined;
        const outputIndex = typeof event.output_index === "number" ? event.output_index : 0;
        const summaryIndex = typeof event.summary_index === "number" ? event.summary_index : 0;

        if (itemId && delta.length > 0) {
          const reasoningItem = this.getOrCreateReasoningItem(itemId, outputIndex);
          reasoningItem.summaryByIndex.set(
            summaryIndex,
            `${reasoningItem.summaryByIndex.get(summaryIndex) ?? ""}${delta}`,
          );

          if (isUserVisibleReasoning(this.request)) {
            return [
              {
                type: "openai_reasoning_summary_delta",
                delta,
                itemId,
                outputIndex,
                summaryIndex,
              },
            ];
          }
        }
        break;
      }

      case "response.reasoning_summary_text.done": {
        const itemId =
          typeof event.item_id === "string"
            ? event.item_id
            : typeof event.output_index === "number"
              ? this.outputIndexToReasoningId.get(event.output_index)
              : undefined;
        const outputIndex = typeof event.output_index === "number" ? event.output_index : 0;
        const summaryIndex = typeof event.summary_index === "number" ? event.summary_index : 0;
        const text = typeof event.text === "string" ? event.text : "";

        if (itemId) {
          this.getOrCreateReasoningItem(itemId, outputIndex).summaryByIndex.set(summaryIndex, text);
        }
        break;
      }

      case "response.reasoning_text.delta": {
        const delta = typeof event.delta === "string" ? event.delta : "";
        const itemId =
          typeof event.item_id === "string"
            ? event.item_id
            : typeof event.output_index === "number"
              ? this.outputIndexToReasoningId.get(event.output_index)
              : undefined;
        const outputIndex = typeof event.output_index === "number" ? event.output_index : 0;
        const contentIndex = typeof event.content_index === "number" ? event.content_index : 0;

        if (itemId && delta.length > 0) {
          const reasoningItem = this.getOrCreateReasoningItem(itemId, outputIndex);
          reasoningItem.textByIndex.set(
            contentIndex,
            `${reasoningItem.textByIndex.get(contentIndex) ?? ""}${delta}`,
          );

          if (isUserVisibleReasoning(this.request)) {
            return [
              {
                type: "openai_reasoning_delta",
                contentIndex,
                delta,
                itemId,
                outputIndex,
              },
            ];
          }
        }
        break;
      }

      case "response.reasoning_text.done": {
        const itemId =
          typeof event.item_id === "string"
            ? event.item_id
            : typeof event.output_index === "number"
              ? this.outputIndexToReasoningId.get(event.output_index)
              : undefined;
        const outputIndex = typeof event.output_index === "number" ? event.output_index : 0;
        const contentIndex = typeof event.content_index === "number" ? event.content_index : 0;
        const text = typeof event.text === "string" ? event.text : "";

        if (itemId) {
          this.getOrCreateReasoningItem(itemId, outputIndex).textByIndex.set(contentIndex, text);
        }
        break;
      }

      case "response.completed": {
        this.finalResponse = event.response as ResponsesApiResponse | undefined;
        break;
      }

      case "response.failed": {
        const failure = event.response as ResponsesApiResponse | undefined;
        throw new OpenAiResponsesStreamError(failure?.error?.message ?? "Responses stream failed", {
          code: failure?.error?.code,
        });
      }

      case "error": {
        const errorPayload = event.error as
          | {
              code?: string;
              message?: string;
            }
          | undefined;
        throw new OpenAiResponsesStreamError(errorPayload?.message ?? "Responses stream failed", {
          code: errorPayload?.code,
          status: typeof event.status === "number" ? event.status : undefined,
        });
      }
    }

    return [];
  }

  private buildPartialOutput(): OpenAiResponsesOutputItem[] {
    const outputItems: Array<{ index: number; item: OpenAiResponsesOutputItem }> = [];

    for (const [outputIndex, textParts] of this.responseTextParts.entries()) {
      const text = textParts.join("");

      if (text.length === 0) {
        continue;
      }

      outputItems.push({
        index: outputIndex,
        item: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text,
            },
          ],
        },
      });
    }

    for (const reasoningItem of this.reasoningItems.values()) {
      outputItems.push({
        index: reasoningItem.outputIndex ?? outputItems.length,
        item: {
          type: "reasoning",
          id: reasoningItem.id,
          ...(reasoningItem.encryptedContent
            ? { encrypted_content: reasoningItem.encryptedContent }
            : {}),
          ...(reasoningItem.summaryByIndex.size > 0
            ? {
                summary: Array.from(reasoningItem.summaryByIndex.entries())
                  .sort((left, right) => left[0] - right[0])
                  .map(([, text]) => {
                    return {
                      type: "summary_text",
                      text,
                    };
                  }),
              }
            : {}),
          ...(reasoningItem.textByIndex.size > 0
            ? {
                text: Array.from(reasoningItem.textByIndex.entries())
                  .sort((left, right) => left[0] - right[0])
                  .map(([, text]) => text)
                  .join(""),
              }
            : {}),
        },
      });
    }

    for (const toolCall of this.toolCalls.values()) {
      outputItems.push({
        index: this.callIdToOutputIndex.get(toolCall.id) ?? outputItems.length,
        item: {
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        },
      });
    }

    return outputItems.sort((left, right) => left.index - right.index).map((entry) => entry.item);
  }

  private getOrCreateReasoningItem(
    itemId: string,
    outputIndex?: number,
  ): {
    encryptedContent?: string;
    id: string;
    outputIndex?: number;
    summaryByIndex: Map<number, string>;
    textByIndex: Map<number, string>;
  } {
    const existing = this.reasoningItems.get(itemId);

    if (existing) {
      if (outputIndex !== undefined) {
        existing.outputIndex = outputIndex;
        this.outputIndexToReasoningId.set(outputIndex, itemId);
      }

      return existing;
    }

    const created = {
      id: itemId,
      outputIndex,
      summaryByIndex: new Map<number, string>(),
      textByIndex: new Map<number, string>(),
    };

    this.reasoningItems.set(itemId, created);

    if (outputIndex !== undefined) {
      this.outputIndexToReasoningId.set(outputIndex, itemId);
    }

    return created;
  }
}

export function createOpenAiResponsesStreamParser(request: ChatRequest): RoutedModelStreamParser {
  return new OpenAiResponsesStreamParser(request);
}

export function createOpenAiSurfaces(
  options: { chatCompletionsPath?: string; responsesPath?: string } = {},
): RoutedModelSurface[] {
  const chatCompletionsPath = options.chatCompletionsPath ?? "/chat/completions";
  const responsesPath = options.responsesPath ?? "/responses";

  return [
    {
      id: OPENAI_CHAT_COMPLETIONS_SURFACE,
      transport: "http-json",
      createRequest(request) {
        return {
          accept: "application/json",
          body: createChatRequestBody(request, false),
          path: chatCompletionsPath,
        };
      },
      parseResponse(payload) {
        return parseChatCompletionResponse(payload as OpenAiChatCompletionsResponse);
      },
    },
    {
      id: OPENAI_CHAT_COMPLETIONS_STREAM_SURFACE,
      transport: "http-sse",
      createRequest(request) {
        return {
          accept: "text/event-stream",
          body: createChatRequestBody(request, true),
          path: chatCompletionsPath,
        };
      },
      createStreamParser() {
        return new OpenAiChatCompletionsStreamParser();
      },
    },
    {
      id: OPENAI_RESPONSES_SURFACE,
      transport: "http-json",
      createRequest(request) {
        return {
          accept: "application/json",
          body: createResponsesRequestBody(request, false),
          path: responsesPath,
        };
      },
      parseResponse(payload, request) {
        return parseResponsesResponse(payload as ResponsesApiResponse, request);
      },
    },
    {
      id: OPENAI_RESPONSES_STREAM_SURFACE,
      transport: "http-sse",
      createRequest(request) {
        return {
          accept: "text/event-stream",
          body: createResponsesRequestBody(request, true),
          path: responsesPath,
        };
      },
      createStreamParser(request) {
        return new OpenAiResponsesStreamParser(request);
      },
    },
    {
      id: OPENAI_RESPONSES_WEBSOCKET_SURFACE,
      transport: "websocket",
      createRequest(request) {
        return {
          initialEvent: createOpenAiResponsesWebSocketEvent(request),
          path: responsesPath,
        };
      },
      createStreamParser(request) {
        return createOpenAiResponsesStreamParser(request);
      },
    },
  ];
}
