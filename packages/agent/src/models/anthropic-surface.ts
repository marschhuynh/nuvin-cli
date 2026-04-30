import { normalizeContent, toProviderModelRequest } from "../formats/message-format.ts";
import { resolveAnthropicThinkingConfig } from "../shared/reasoning-config.ts";
import type {
  AnthropicAssistantContentBlock,
  ChatRequest,
  ChatResponse,
  ChatResponseChunk,
  JsonValue,
  ToolResultBlock,
} from "../shared/types.ts";
import type {
  RoutedModelStreamParser,
  RoutedModelSurface,
  RoutedModelSurfaceRequest,
} from "./routed-model.ts";

export const ANTHROPIC_MESSAGES_SURFACE = "anthropic-messages";
export const ANTHROPIC_MESSAGES_STREAM_SURFACE = "anthropic-messages-stream";

function parseToolInput(serializedInput: string): JsonValue {
  try {
    return JSON.parse(serializedInput) as JsonValue;
  } catch {
    return serializedInput;
  }
}

type AnthropicStreamingBlock =
  | {
      index: number;
      kind: "redacted_thinking";
      data: string;
    }
  | {
      index: number;
      kind: "thinking";
      signature: string;
      thinking: string;
    }
  | {
      index: number;
      kind: "text";
      text: string;
    }
  | {
      id: string;
      index: number;
      inputJson: string;
      kind: "tool_use";
      name: string;
    };

interface AnthropicMessagesResponse {
  id?: string;
  type?: string;
  role?: string;
  content?: Array<AnthropicAssistantContentBlock>;
  stop_reason?: string | null;
  stop_sequence?: null | string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

type AnthropicRequestContentBlock = AnthropicAssistantContentBlock | ToolResultBlock;

function resolveReasoningVisibility(request: ChatRequest): "continuity-only" | "user-visible" {
  return request.reasoning?.visibility ?? "user-visible";
}

function isUserVisibleThinking(request: ChatRequest): boolean {
  const config = resolveAnthropicThinkingConfig(request.reasoning);

  return (
    config !== undefined &&
    config.type !== "disabled" &&
    resolveReasoningVisibility(request) === "user-visible"
  );
}

function createAnthropicThinkingBody(request: ChatRequest): {
  headers?: Record<string, string>;
  thinking?: Record<string, unknown>;
} {
  const config = resolveAnthropicThinkingConfig(request.reasoning);

  if (!config || config.type === "disabled") {
    return {};
  }

  const display = config.display ?? (isUserVisibleThinking(request) ? "summarized" : "omitted");
  const headers = config.interleaved
    ? { "anthropic-beta": "interleaved-thinking-2025-05-14" }
    : undefined;

  if (config.type === "enabled") {
    return {
      ...(headers ? { headers } : {}),
      thinking: {
        type: "enabled",
        budget_tokens: config.budgetTokens,
        display,
      },
    };
  }

  return {
    ...(headers ? { headers } : {}),
    thinking: {
      type: "adaptive",
      ...(config.effort ? { effort: config.effort } : {}),
      display,
    },
  };
}

function toAnthropicRequestContent(
  message: ChatRequest["messages"][number],
): AnthropicRequestContentBlock[] {
  if (message.role === "assistant" && message.providerState?.anthropicAssistantContent) {
    return structuredClone(message.providerState.anthropicAssistantContent);
  }

  const content: AnthropicRequestContentBlock[] = [];

  for (const block of normalizeContent(message.content)) {
    if (block.type === "openai_reasoning") {
      continue;
    }

    if (block.type === "anthropic_thinking") {
      content.push({
        type: "thinking",
        thinking: block.thinking,
        signature: block.signature,
      });
      continue;
    }

    if (block.type === "anthropic_redacted_thinking") {
      content.push({
        type: "redacted_thinking",
        data: block.data,
      });
      continue;
    }

    content.push(structuredClone(block));
  }

  return content;
}

function createAnthropicRequest(request: ChatRequest, stream: boolean): RoutedModelSurfaceRequest {
  const baseRequest = toProviderModelRequest(request);
  const thinking = createAnthropicThinkingBody(request);

  return {
    accept: stream ? "text/event-stream" : "application/json",
    body: {
      ...baseRequest,
      messages: request.messages.map((message) => {
        return {
          role: message.role,
          content: toAnthropicRequestContent(message),
        };
      }),
      ...(thinking.thinking ? { thinking: thinking.thinking } : {}),
      ...(stream ? { stream: true } : {}),
    },
    ...(thinking.headers ? { headers: thinking.headers } : {}),
    path: "/v1/messages",
  };
}

function parseAnthropicResponse(
  response: AnthropicMessagesResponse,
  request: ChatRequest,
): ChatResponse {
  const content: ChatResponse["content"] = [];
  const rawContent = response.content ?? [];
  let hasThinking = false;

  for (const block of rawContent) {
    if (block.type === "thinking") {
      hasThinking = true;

      if (isUserVisibleThinking(request)) {
        content.push({
          type: "anthropic_thinking",
          thinking: block.thinking,
          signature: block.signature,
        });
      }
      continue;
    }

    if (block.type === "redacted_thinking") {
      hasThinking = true;

      if (isUserVisibleThinking(request)) {
        content.push({
          type: "anthropic_redacted_thinking",
          data: block.data,
        });
      }
      continue;
    }

    if (block.type === "text") {
      if (block.text.length > 0) {
        content.push(structuredClone(block));
      }
      continue;
    }

    content.push(structuredClone(block));
  }

  return {
    id: response.id ?? `msg-${Date.now()}`,
    content,
    stopReason: content.some((block) => block.type === "tool_use")
      ? "tool_use"
      : response.stop_reason === "tool_use"
        ? "tool_use"
        : "end_turn",
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    ...(hasThinking
      ? {
          providerState: {
            anthropicAssistantContent: structuredClone(rawContent),
          },
        }
      : {}),
  };
}

class AnthropicMessagesStreamParser implements RoutedModelStreamParser {
  private readonly blocks = new Map<number, AnthropicStreamingBlock>();
  private inputTokens = 0;
  private messageId = `msg-${Date.now()}`;
  private outputTokens = 0;
  private readonly request: ChatRequest;
  private stopReason: ChatResponse["stopReason"] = "end_turn";

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

    switch (eventType) {
      case "message_start": {
        const message = event.message as
          | {
              id?: string;
              usage?: {
                input_tokens?: number;
              };
            }
          | undefined;
        this.messageId = message?.id ?? this.messageId;
        this.inputTokens = message?.usage?.input_tokens ?? this.inputTokens;
        break;
      }

      case "content_block_start": {
        const index = typeof event.index === "number" ? event.index : 0;
        const contentBlock = event.content_block as
          | {
              data?: string;
              id?: string;
              input?: JsonValue;
              name?: string;
              signature?: string;
              text?: string;
              thinking?: string;
              type?: string;
            }
          | undefined;

        if (contentBlock?.type === "tool_use" && contentBlock.id && contentBlock.name) {
          this.blocks.set(index, {
            id: contentBlock.id,
            index,
            inputJson: JSON.stringify(contentBlock.input ?? {}),
            kind: "tool_use",
            name: contentBlock.name,
          });
          return [
            {
              type: "tool_use_delta",
              id: contentBlock.id,
              index,
              name: contentBlock.name,
            },
          ];
        }

        if (contentBlock?.type === "thinking") {
          this.blocks.set(index, {
            index,
            kind: "thinking",
            signature: typeof contentBlock.signature === "string" ? contentBlock.signature : "",
            thinking:
              typeof contentBlock.text === "string"
                ? contentBlock.text
                : typeof (contentBlock as { thinking?: unknown }).thinking === "string"
                  ? String((contentBlock as { thinking?: unknown }).thinking)
                  : "",
          });
          break;
        }

        if (contentBlock?.type === "redacted_thinking") {
          this.blocks.set(index, {
            index,
            kind: "redacted_thinking",
            data:
              typeof (contentBlock as { data?: unknown }).data === "string"
                ? String((contentBlock as { data?: unknown }).data)
                : "",
          });
          break;
        }

        this.blocks.set(index, {
          index,
          kind: "text",
          text: contentBlock?.text ?? "",
        });
        break;
      }

      case "content_block_delta": {
        const index = typeof event.index === "number" ? event.index : 0;
        const block = this.blocks.get(index);
        const delta = event.delta as
          | {
              partial_json?: string;
              text?: string;
              type?: string;
            }
          | undefined;

        if (!block || !delta?.type) {
          break;
        }

        if (
          delta.type === "text_delta" &&
          block.kind === "text" &&
          typeof delta.text === "string"
        ) {
          block.text += delta.text;
          return [
            {
              type: "content_delta",
              index,
              text: delta.text,
            },
          ];
        }

        if (
          delta.type === "input_json_delta" &&
          block.kind === "tool_use" &&
          typeof delta.partial_json === "string"
        ) {
          if (block.inputJson === "{}") {
            block.inputJson = "";
          }

          block.inputJson += delta.partial_json;
          return [
            {
              type: "tool_use_delta",
              id: block.id,
              index,
              inputDelta: delta.partial_json,
            },
          ];
        }

        if (delta.type === "thinking_delta" && block.kind === "thinking") {
          const thinkingDelta =
            typeof (delta as { thinking?: unknown }).thinking === "string"
              ? String((delta as { thinking?: unknown }).thinking)
              : "";

          if (thinkingDelta.length > 0) {
            block.thinking += thinkingDelta;

            if (isUserVisibleThinking(this.request)) {
              return [
                {
                  type: "anthropic_thinking_delta",
                  index,
                  thinking: thinkingDelta,
                },
              ];
            }
          }
        }

        if (delta.type === "signature_delta" && block.kind === "thinking") {
          const signature =
            typeof (delta as { signature?: unknown }).signature === "string"
              ? String((delta as { signature?: unknown }).signature)
              : "";

          if (signature.length > 0) {
            block.signature = signature;

            if (isUserVisibleThinking(this.request)) {
              return [
                {
                  type: "anthropic_signature_delta",
                  index,
                  signature,
                },
              ];
            }
          }
        }
        break;
      }

      case "message_delta": {
        const delta = event.delta as
          | {
              stop_reason?: string | null;
            }
          | undefined;
        const usage = event.usage as
          | {
              output_tokens?: number;
            }
          | undefined;

        this.outputTokens = usage?.output_tokens ?? this.outputTokens;
        this.stopReason = delta?.stop_reason === "tool_use" ? "tool_use" : "end_turn";
        break;
      }

      case "error": {
        const error = event.error as
          | {
              message?: string;
            }
          | undefined;
        throw new Error(error?.message ?? "Anthropic stream failed");
      }
    }

    return [];
  }

  finish(): ChatResponse {
    const orderedBlocks = Array.from(this.blocks.values()).sort(
      (left, right) => left.index - right.index,
    );
    const rawContent: AnthropicAssistantContentBlock[] = [];

    for (const block of orderedBlocks) {
      if (block.kind === "text") {
        if (block.text.length > 0) {
          rawContent.push({
            type: "text",
            text: block.text,
          });
        }
        continue;
      }

      if (block.kind === "thinking") {
        rawContent.push({
          type: "thinking",
          thinking: block.thinking,
          signature: block.signature,
        });
        continue;
      }

      if (block.kind === "redacted_thinking") {
        rawContent.push({
          type: "redacted_thinking",
          data: block.data,
        });
        continue;
      }

      rawContent.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: parseToolInput(block.inputJson.length > 0 ? block.inputJson : "{}"),
      });
    }

    return parseAnthropicResponse(
      {
        id: this.messageId,
        type: "message",
        role: "assistant",
        content: rawContent,
        stop_reason: this.stopReason,
        stop_sequence: null,
        usage: {
          input_tokens: this.inputTokens,
          output_tokens: this.outputTokens,
        },
      },
      this.request,
    );
  }
}

export function createAnthropicSurfaces(): RoutedModelSurface[] {
  return [
    {
      id: ANTHROPIC_MESSAGES_SURFACE,
      transport: "http-json",
      createRequest(request) {
        return createAnthropicRequest(request, false);
      },
      parseResponse(payload, request) {
        return parseAnthropicResponse(payload as AnthropicMessagesResponse, request);
      },
    },
    {
      id: ANTHROPIC_MESSAGES_STREAM_SURFACE,
      transport: "http-sse",
      createRequest(request) {
        return createAnthropicRequest(request, true);
      },
      createStreamParser(request) {
        return new AnthropicMessagesStreamParser(request);
      },
    },
  ];
}
