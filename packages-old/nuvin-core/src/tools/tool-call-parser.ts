export type ParseResult<T = unknown> = { success: true; data: T } | { success: false; error: string };

/**
 * Sanitize tool call arguments string from common LLM artifacts.
 * Some models inject XML-like tags (e.g. `</tool_call>`) into the arguments JSON,
 * producing invalid JSON that crashes JSON.parse.
 */
export function sanitizeToolArguments(args: string): string {
  return args.replace(/<\/?tool_call>/g, '');
}

/**
 * Safely parse tool call arguments with sanitization.
 * Returns empty object on malformed input instead of throwing.
 */
export function safeParseToolArguments(args: string | undefined): Record<string, unknown> {
  if (!args) return {};
  try {
    return JSON.parse(sanitizeToolArguments(args)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function parseJSON(jsonString: string): ParseResult<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(jsonString || '{}');

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        success: false,
        error: 'Parsed JSON must be an object, not an array or primitive',
      };
    }

    return { success: true, data: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid JSON syntax',
    };
  }
}
