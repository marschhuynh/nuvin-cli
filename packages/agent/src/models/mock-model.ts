import { getTextFromMessage, getToolResultBlocks } from "../formats/message-format.ts";
import type {
  ChatRequest,
  ChatResponse,
  EngineChatModel,
  Message,
  MessageRole,
  ModelExecutionOptions,
  ReasoningConfig,
} from "../shared/types.ts";

function findLastMessage(messages: Message[], role: MessageRole): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) {
      return messages[index];
    }
  }

  return undefined;
}

function hasTool(request: ChatRequest, name: string): boolean {
  return request.tools.some((tool) => tool.name === name);
}

function createMockResponse(
  id: string,
  content: ChatResponse["content"],
  stopReason: ChatResponse["stopReason"],
  usage: ChatResponse["usage"],
): ChatResponse {
  return {
    id,
    content,
    stopReason,
    usage,
  };
}

export interface MockModelOptions {
  model?: string;
  maxTokens?: number;
  reasoning?: ReasoningConfig;
}

export class MockModel implements EngineChatModel {
  public readonly model: string;
  public readonly maxTokens: number;
  public readonly requests: ChatRequest[] = [];
  private readonly reasoning?: ReasoningConfig;

  constructor(options: MockModelOptions = {}) {
    this.model = options.model ?? "mock";
    this.maxTokens = options.maxTokens ?? 16384;
    this.reasoning = options.reasoning ? structuredClone(options.reasoning) : undefined;
  }

  async complete(request: ChatRequest, _options?: ModelExecutionOptions): Promise<ChatResponse> {
    const resolvedRequest: ChatRequest = {
      ...structuredClone(request),
      ...(request.reasoning === undefined && this.reasoning !== undefined
        ? { reasoning: structuredClone(this.reasoning) }
        : {}),
    };

    this.requests.push(resolvedRequest);

    const lastUserMessage = findLastMessage(resolvedRequest.messages, "user");
    const toolResultBlocks = getToolResultBlocks(lastUserMessage);
    const responseId = `assistant-${this.requests.length}`;

    if (toolResultBlocks.length > 0) {
      return createMockResponse(
        responseId,
        [
          {
            type: "text",
            text: `I checked the mocked tool result. ${toolResultBlocks[0].content}`,
          },
        ],
        "end_turn",
        {
          inputTokens: 120,
          outputTokens: 40,
        },
      );
    }

    const userText = getTextFromMessage(lastUserMessage);

    if (/list .*files|workspace/i.test(userText) && hasTool(resolvedRequest, "Bash")) {
      return createMockResponse(
        responseId,
        [
          {
            type: "tool_use",
            id: `tool-call-${this.requests.length}`,
            name: "Bash",
            input: {
              command: "ls -la",
            },
          },
        ],
        "tool_use",
        {
          inputTokens: 110,
          outputTokens: 28,
        },
      );
    }

    return createMockResponse(
      responseId,
      [
        {
          type: "text",
          text: `Direct answer: ${userText}`,
        },
      ],
      "end_turn",
      {
        inputTokens: 80,
        outputTokens: 18,
      },
    );
  }
}
