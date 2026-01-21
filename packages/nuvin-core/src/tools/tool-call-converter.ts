import type { ToolCall, ToolInvocation } from '../ports.js';
import type { ToolName } from './tool-params.js';
import { parseJSON } from './tool-call-parser.js';
import { toolValidators } from './tool-validators.js';

export type ValidationError = {
  id: string;
  name: string;
  error: string;
  errorType: 'tool_not_found' | 'parse' | 'validation' | 'unknown';
};

export type ToolCallConversionResult =
  | { success: true; invocations: ToolInvocation[]; errors?: ValidationError[] }
  | { success: false; invocations: ToolInvocation[]; errors: ValidationError[] };

export type ToolCallValidation =
  | {
      valid: true;
      invocation: ToolInvocation;
    }
  | {
      valid: false;
      error: string;
      errorType: 'parse' | 'validation';
      callId: string;
      toolName: string;
      rawArguments?: string;
    };

export function convertToolCall(
  toolCall: ToolCall,
  options: {
    strict?: boolean;
    availableTools?: Set<string>;
  } = {},
): ToolCallValidation {
  const { strict = true, availableTools } = options;

  if (availableTools && !availableTools.has(toolCall.function.name)) {
    return {
      valid: false,
      error: `Tool "${toolCall.function.name}" is not available. Available tools: ${Array.from(availableTools).join(', ')}`,
      errorType: 'validation',
      callId: toolCall.id,
      toolName: toolCall.function.name,
    };
  }

  const parseResult = parseJSON(toolCall.function.arguments);

  if (!parseResult.success) {
    return {
      valid: false,
      error: parseResult.error,
      errorType: 'parse',
      callId: toolCall.id,
      toolName: toolCall.function.name,
      rawArguments: toolCall.function.arguments,
    };
  }

  const toolName = toolCall.function.name;
  const parameters = parseResult.data;

  const validator = toolValidators[toolName as ToolName];

  if (validator) {
    const validationResult = validator(parameters);

    if (!validationResult.valid) {
      if (strict) {
        return {
          valid: false,
          error: validationResult.errors.join('; '),
          errorType: 'validation',
          callId: toolCall.id,
          toolName: toolCall.function.name,
          rawArguments: toolCall.function.arguments,
        };
      }
      console.warn(`[ToolCallConverter] Validation warnings for ${toolName}:`, validationResult.errors);
    }
  }

  return {
    valid: true,
    invocation: {
      id: toolCall.id,
      name: toolCall.function.name,
      parameters,
      editInstruction: toolCall.editInstruction,
    },
  };
}

export function convertToolCalls(
  toolCalls: ToolCall[],
  options: { strict?: boolean; throwOnError?: boolean } = {},
): ToolInvocation[] {
  const { strict = true, throwOnError = true } = options;
  const invocations: ToolInvocation[] = [];

  for (const tc of toolCalls) {
    const result = convertToolCall(tc, { strict });

    if (!result.valid) {
      const errorMsg = `Tool call ${result.callId} (${result.toolName}): ${result.error}`;

      if (throwOnError) {
        throw new Error(errorMsg);
      }

      console.error(`[ToolCallConverter] ${errorMsg}`);
      invocations.push({
        id: result.callId,
        name: result.toolName,
        parameters: {},
        editInstruction: tc.editInstruction,
      });
    } else {
      invocations.push(result.invocation);
    }
  }

  return invocations;
}

export function convertToolCallsWithErrorHandling(
  toolCalls: ToolCall[],
  options: {
    strict?: boolean;
    availableTools?: Set<string>;
  } = {},
): ToolCallConversionResult {
  const { strict = true, availableTools } = options;
  const invocations: ToolInvocation[] = [];
  const errors: ValidationError[] = [];

  for (const tc of toolCalls) {
    const result = convertToolCall(tc, { strict, availableTools });

    if (!result.valid) {
      const errorType: ValidationError['errorType'] =
        result.errorType === 'validation' && availableTools && !availableTools.has(tc.function.name)
          ? 'tool_not_found'
          : result.errorType;

      errors.push({
        id: result.callId,
        name: result.toolName,
        error: result.error,
        errorType,
      });
    } else {
      invocations.push(result.invocation);
    }
  }

  return {
    success: true,
    invocations,
    errors: errors.length > 0 ? errors : undefined,
  };
}
