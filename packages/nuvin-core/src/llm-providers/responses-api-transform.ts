import type {
  ChatMessage,
  CompletionParams,
  CompletionResult,
  ResponseParams,
  ToolCall,
  UsageData,
  ProviderContentPart,
} from "../ports.js";

export type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "output_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; file_id: string };

export type ResponsesInputItem =
  | {
      type: "message";
      role: "user" | "assistant";
      content: ResponsesContentPart[] | string;
    }
  | {
      type: "function_call";
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    };

export type ResponsesTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ResponsesApiRequest = {
  model: string;
  input: ResponsesInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  store?: boolean;
  tools?: ResponsesTool[];
  tool_choice?: "none" | "auto" | "required";
  parallel_tool_calls?: boolean;
  stream?: boolean;
};

export type ResponsesOutputItem =
  | {
      type: "message";
      id?: string;
      role: "assistant";
      content: ResponsesContentPart[];
      status?: string;
    }
  | {
      type: "function_call";
      id?: string;
      name: string;
      call_id: string;
      arguments: string;
      status?: string;
    };

export type ResponsesUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
};

export type ResponsesApiResponse = {
  id: string;
  object: "response";
  status:
    | "completed"
    | "failed"
    | "in_progress"
    | "queued"
    | "cancelled"
    | "incomplete";
  output: ResponsesOutputItem[];
  output_text?: string;
  usage: ResponsesUsage;
  error?: {
    message: string;
    code?: string;
  };
  incomplete_details?: {
    reason?: "max_output_tokens" | "content_filter";
  };
};

export type ResponsesStreamEvent =
  | { type: "response.created"; response: ResponsesApiResponse }
  | { type: "response.in_progress"; response: ResponsesApiResponse }
  | {
      type: "response.output_item.added";
      output_index: number;
      item: ResponsesOutputItem;
    }
  | {
      type: "response.content_part.added";
      output_index: number;
      content_index: number;
      part: ResponsesContentPart;
    }
  | {
      type: "response.output_text.delta";
      output_index: number;
      content_index: number;
      delta: string;
    }
  | {
      type: "response.function_call_arguments.delta";
      output_index: number;
      call_id: string;
      delta: string;
    }
  | {
      type: "response.function_call_arguments.done";
      output_index: number;
      call_id: string;
      arguments: string;
    }
  | {
      type: "response.output_item.done";
      output_index: number;
      item: ResponsesOutputItem;
    }
  | {
      type: "response.content_part.done";
      output_index: number;
      content_index: number;
      part: ResponsesContentPart;
    }
  | { type: "response.completed"; response: ResponsesApiResponse }
  | { type: "response.failed"; response: ResponsesApiResponse }
  | { type: "error"; error: { message: string; code?: string } };

export function transformToResponsesInput(messages: ChatMessage[]): {
  instructions?: string;
  input: ResponsesInputItem[];
} {
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  let instructions: string | undefined;
  if (systemMessages.length > 0) {
    instructions = systemMessages
      .map((msg) =>
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content),
      )
      .join("\n\n");
  }

  const input: ResponsesInputItem[] = [];

  for (const msg of nonSystemMessages) {
    if (msg.role === "tool") {
      let output: string;
      if (typeof msg.content === "string") {
        output = msg.content;
      } else if (Array.isArray(msg.content)) {
        output = (msg.content as ProviderContentPart[])
          .map((part) => {
            if (part.type === "text") return part.text;
            if (part.type === "image_url")
              return "[Image content returned by tool]";
            return JSON.stringify(part);
          })
          .join("\n");
      } else {
        output = JSON.stringify(msg.content);
      }
      input.push({
        type: "function_call_output",
        call_id: msg.tool_call_id || "",
        output,
      });
      continue;
    }

    if (msg.role === "assistant") {
      const content: ResponsesContentPart[] = [];

      if (typeof msg.content === "string" && msg.content) {
        content.push({ type: "output_text", text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text") {
            content.push({ type: "output_text", text: part.text });
          }
        }
      }

      if (content.length > 0) {
        input.push({
          type: "message",
          role: "assistant",
          content,
        });
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          input.push({
            type: "function_call",
            call_id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          });
        }
      }
      continue;
    }

    if (msg.role === "user") {
      const content: ResponsesContentPart[] = [];

      if (typeof msg.content === "string" && msg.content) {
        content.push({ type: "input_text", text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text") {
            content.push({ type: "input_text", text: part.text });
          } else if (part.type === "image_url") {
            content.push({
              type: "input_image",
              image_url: part.image_url.url,
            });
          }
        }
      }

      if (content.length > 0) {
        input.push({
          type: "message",
          role: "user",
          content,
        });
      }
    }
  }

  return { instructions, input };
}

export function transformToolsToResponsesFormat(
  tools?: CompletionParams["tools"],
): ResponsesTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters as Record<string, unknown>,
  }));
}

export function transformResponsesUsage(usage: ResponsesUsage): UsageData {
  return {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    total_tokens:
      usage.total_tokens ?? usage.input_tokens + usage.output_tokens,
    ...(usage.input_tokens_details?.cached_tokens && {
      prompt_tokens_details: {
        cached_tokens: usage.input_tokens_details.cached_tokens,
      },
    }),
    ...(usage.output_tokens_details?.reasoning_tokens && {
      completion_tokens_details: {
        reasoning_tokens: usage.output_tokens_details.reasoning_tokens,
      },
    }),
  };
}

export function transformFromResponsesOutput(
  response: ResponsesApiResponse,
): CompletionResult {
  let content = "";
  const toolCalls: ToolCall[] = [];

  for (const item of response.output) {
    if (item.type === "message") {
      for (const part of item.content) {
        if (part.type === "output_text") {
          content += part.text;
        }
      }
    } else if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id,
        type: "function",
        function: {
          name: item.name,
          arguments: item.arguments,
        },
      });
    }
  }

  if (!content && response.output_text) {
    content = response.output_text;
  }

  return {
    content,
    ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
    ...(response.usage && { usage: transformResponsesUsage(response.usage) }),
  };
}

export function buildResponsesRequestBody(
  params: ResponseParams,
  stream: boolean = false,
): ResponsesApiRequest {
  const { instructions, input } = transformToResponsesInput(params.messages);
  const tools = transformToolsToResponsesFormat(params.tools);

  return {
    model: params.model,
    input,
    ...(instructions && { instructions }),
    ...(params.topP !== undefined && { top_p: params.topP }),
    store: params.store ?? false,
    ...(tools && { tools }),
    ...(stream && { stream: true }),
  };
}
