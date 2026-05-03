import type {
  AnyToolDefinition,
  InferJsonSchema,
  JsonObject,
  JsonSchema,
  JsonSchemaObject,
  JsonValue,
  ToolDefinition,
  ToolExecutionContext,
  ToolOutputEnvelope,
  ToolOutputValue,
  ToolResultChunk,
  ToolSchema,
} from "../shared/types.ts";

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolOutputEnvelope(value: ToolOutputValue): value is ToolOutputEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  if (typeof (value as { output?: unknown }).output !== "string") {
    return false;
  }

  const structured = (value as { structured?: unknown }).structured;
  return structured === undefined || isJsonObject(structured as JsonValue);
}

function validateAgainstSchema(path: string, value: JsonValue, schema: JsonSchema): void {
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") {
        throw new Error(`Invalid tool input at ${path}: expected string`);
      }
      return;
    case "number":
      if (typeof value !== "number") {
        throw new Error(`Invalid tool input at ${path}: expected number`);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(`Invalid tool input at ${path}: expected boolean`);
      }
      return;
    case "array":
      if (!Array.isArray(value)) {
        throw new Error(`Invalid tool input at ${path}: expected array`);
      }

      value.forEach((item, index) => {
        validateAgainstSchema(`${path}[${index}]`, item, schema.items);
      });
      return;
    case "object":
      if (!isJsonObject(value)) {
        throw new Error(`Invalid tool input at ${path}: expected object`);
      }

      for (const requiredKey of schema.required ?? []) {
        if (!(requiredKey in value)) {
          throw new Error(`Invalid tool input at ${path}: missing required field "${requiredKey}"`);
        }
      }

      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          validateAgainstSchema(`${path}.${key}`, value[key] as JsonValue, childSchema);
        }
      }
  }
}

export function normalizeToolOutputValue(output: ToolOutputValue): ToolResultChunk {
  if (isToolOutputEnvelope(output)) {
    return {
      output: output.output,
      structured: output.structured ?? {
        value: output.output,
      },
    };
  }

  if (typeof output === "string") {
    return {
      output,
      structured: {
        value: output,
      },
    };
  }

  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    return {
      output: JSON.stringify(output, null, 2),
      structured: output,
    };
  }

  return {
    output: JSON.stringify(output, null, 2),
    structured: {
      value: output,
    },
  };
}

export function createToolOutput(
  output: string,
  structured: JsonObject = {
    value: output,
  },
): ToolOutputEnvelope {
  return {
    output,
    structured,
  };
}

export class ToolExecutionError extends Error {
  public readonly structured: JsonObject;

  constructor(message: string, structured: JsonObject = {}) {
    super(message);
    this.name = "ToolExecutionError";
    this.structured = structured;
  }
}

export function defineTool<
  TSchema extends JsonSchemaObject,
  TYield extends ToolOutputValue = ToolOutputValue,
  TReturn extends ToolOutputValue | undefined = ToolOutputValue | undefined,
>(definition: {
  name: string;
  description: string;
  inputSchema: TSchema;
  execute(
    input: InferJsonSchema<TSchema>,
    ctx: ToolExecutionContext,
  ): AsyncGenerator<TYield, TReturn, void>;
}): ToolDefinition<InferJsonSchema<TSchema>, TYield, TReturn, TSchema> {
  return definition;
}

export class ToolRegistry {
  private readonly toolsByName = new Map<string, AnyToolDefinition>();

  constructor(tools: AnyToolDefinition[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: AnyToolDefinition): void {
    this.toolsByName.set(tool.name, tool);
  }

  get(name: string): AnyToolDefinition | undefined {
    return this.toolsByName.get(name);
  }

  list(): AnyToolDefinition[] {
    return [...this.toolsByName.values()];
  }

  listToolSchemas(): ToolSchema[] {
    return this.list().map((tool) => {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      };
    });
  }
}

export function validateToolInput<TSchema extends JsonSchemaObject>(
  input: JsonValue,
  schema: TSchema,
): InferJsonSchema<TSchema> {
  validateAgainstSchema("input", input, schema);
  return input as InferJsonSchema<TSchema>;
}

export function deriveFinalToolOutput(chunks: ToolResultChunk[]): ToolResultChunk {
  if (chunks.length === 0) {
    return {
      output: "",
      structured: {},
    };
  }

  if (chunks.length === 1) {
    return {
      output: chunks[0].output,
      structured: chunks[0].structured,
    };
  }

  return {
    output: chunks.map((chunk) => chunk.output).join(""),
    structured: {
      chunks: chunks.map((chunk) => chunk.structured),
    },
  };
}
