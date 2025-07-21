export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: any;
  raw: string;
}

export interface ParsedContent {
  textParts: string[];
  toolCalls: ParsedToolCall[];
  hasToolCalls: boolean;
}

/**
 * Parses message content that may contain tool calls in the format:
 * <|tool_calls_section_begin|><|tool_call_begin|>toolName:id<|tool_call_argument_begin|>{json}<|tool_call_end|><|tool_calls_section_end|>
 */
export function parseToolCalls(content: string): ParsedContent {
  const result: ParsedContent = {
    textParts: [],
    toolCalls: [],
    hasToolCalls: false,
  };

  // Check if content contains tool calls
  if (!content.includes('<|tool_calls_section_begin|>')) {
    result.textParts = [content];
    return result;
  }

  result.hasToolCalls = true;

  // Split content by tool call sections
  const sections = content.split(/<\|tool_calls_section_begin\|>/);

  // First section is always text before any tool calls
  if (sections[0]) {
    result.textParts.push(sections[0].trim());
  }

  // Process each tool call section
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];

    // Extract tool calls and any text after
    const endMatch = section.match(/<\|tool_calls_section_end\|>(.*?)$/s);
    const toolCallsSection = endMatch
      ? section.replace(endMatch[0], '')
      : section;
    const textAfter = endMatch ? endMatch[1].trim() : '';

    // Parse individual tool calls within the section
    const toolCallMatches = toolCallsSection.matchAll(
      /<\|tool_call_begin\|>(.*?)<\|tool_call_argument_begin\|>(.*?)<\|tool_call_end\|>/gs,
    );

    for (const match of toolCallMatches) {
      const nameAndId = match[1].trim();
      const argumentsStr = match[2].trim();

      // Extract tool name and ID (format: toolName:id or mcp_uuid_toolName:id)
      const nameIdMatch = nameAndId.match(/^(?:mcp_[a-f0-9-]+_)?(.+):(.+)$/);
      if (nameIdMatch) {
        const toolName = nameIdMatch[1];
        const toolId = nameIdMatch[2];

        try {
          const parsedArgs = JSON.parse(argumentsStr);
          result.toolCalls.push({
            id: toolId,
            name: toolName,
            arguments: parsedArgs,
            raw: match[0],
          });
        } catch (error) {
          console.warn(
            'Failed to parse tool call arguments:',
            argumentsStr,
            error,
          );
          // Still add the tool call with raw arguments
          result.toolCalls.push({
            id: toolId,
            name: toolName,
            arguments: argumentsStr,
            raw: match[0],
          });
        }
      }
    }

    // Add any text that comes after the tool calls section
    if (textAfter) {
      result.textParts.push(textAfter);
    }
  }

  return result;
}

/**
 * Removes tool call markup from content, leaving only the text parts
 */
export function stripToolCalls(content: string): string {
  const parsed = parseToolCalls(content);
  return parsed.textParts.join('\n\n').trim();
}

/**
 * Formats tool call arguments for display
 */
export function formatToolArguments(args: any): string {
  if (typeof args === 'string') {
    return args;
  }
  return JSON.stringify(args, null, 2);
}
