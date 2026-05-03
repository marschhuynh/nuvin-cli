import type {
  JsonValue,
  ToolExecutionContext,
  ToolResult,
  ToolResultChunk,
  ToolRuntime,
  ToolSchema,
  ToolUseBlock,
} from "../shared/types.ts";

function getCommand(input: JsonValue): string {
  if (
    input &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    typeof input.command === "string"
  ) {
    return input.command;
  }

  return "ls -la";
}

const MOCK_WORKSPACE_LISTING = [
  "docs/plans/2026-04-16-agent-loop-core-design.md",
  "docs/plans/2026-04-16-mock-agent-loop-implementation.md",
  "docs/plans/2026-04-16-public-tools-api-implementation.md",
  "package.json",
  "src/agent/agent.ts",
  "src/formats/message-format.ts",
  "src/examples/demo.ts",
  "src/agent/extension-registry.ts",
  "src/models/mock-model.ts",
  "src/tools/mock-tool-runtime.ts",
  "src/formats/provider-adapters.ts",
  "src/agent/turn-engine.ts",
  "src/shared/types.ts",
  "src/agent/agent.test.ts",
  "src/models/anthropic-model.ts",
  "src/formats/provider-adapters.test.ts",
  "src/agent/turn-engine.test.ts",
].join("\n");

const SHELL_EXEC_TOOL: ToolSchema = {
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
};

function createMeta(): ToolResult["meta"] {
  return {
    transforms: [],
  };
}

function createOutputChunk(output: string): ToolResultChunk {
  return {
    output,
    structured: {
      value: output,
    },
  };
}

function createUnknownToolResult(toolCall: ToolUseBlock): ToolResult {
  return {
    callId: toolCall.id,
    toolName: toolCall.name,
    status: "error",
    output: `Unknown tool: ${toolCall.name}`,
    structured: {
      exitCode: 1,
    },
    chunks: [],
    meta: createMeta(),
  };
}

function createSuccessToolResult(toolCall: ToolUseBlock, chunk: ToolResultChunk): ToolResult {
  return {
    callId: toolCall.id,
    toolName: toolCall.name,
    status: "ok",
    output: MOCK_WORKSPACE_LISTING,
    structured: {
      command: getCommand(toolCall.input),
      exitCode: 0,
    },
    chunks: [chunk],
    meta: createMeta(),
  };
}

export function createMockToolRuntime(): ToolRuntime {
  const executeSingle = async (
    toolCall: ToolUseBlock,
    _ctx: ToolExecutionContext,
  ): Promise<ToolResult> => {
    if (toolCall.name !== "Bash") {
      return createUnknownToolResult(toolCall);
    }

    const chunk = createOutputChunk(MOCK_WORKSPACE_LISTING);
    return createSuccessToolResult(toolCall, chunk);
  };

  return {
    listToolSchemas(): ToolSchema[] {
      return [SHELL_EXEC_TOOL];
    },
    async executeCalls(
      toolCalls: ToolUseBlock[],
      ctx: ToolExecutionContext,
    ): Promise<ToolResult[]> {
      return await Promise.all(
        toolCalls.map(async (toolCall) => {
          return await executeSingle(toolCall, ctx);
        }),
      );
    },
    async execute(toolCall: ToolUseBlock, ctx: ToolExecutionContext): Promise<ToolResult> {
      return await executeSingle(toolCall, ctx);
    },
  };
}
