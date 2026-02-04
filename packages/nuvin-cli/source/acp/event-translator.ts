/**
 * ACP Event Translator
 *
 * Translates Nuvin's AgentEvent stream to ACP SessionUpdate notifications.
 * This is the bridge between the orchestrator's event system and the ACP protocol.
 *
 * @module acp/event-translator
 */

import type { AgentEvent, ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';
import type { ACPServer } from './server.js';
import type {
  SessionId,
  ToolCallId,
  SessionUpdate,
  ToolKind,
  ToolCallResult,
  ToolCallLocation,
} from './types.js';
import { acpLogger } from './logger.js';

// =============================================================================
// Tool Kind Mapping
// =============================================================================

/**
 * Map Nuvin tool names to ACP ToolKind values
 */
const TOOL_KIND_MAP: Record<string, ToolKind> = {
  file_read: 'file_read',
  file_edit: 'file_edit',
  file_new: 'file_write',
  bash_tool: 'command',
  web_search: 'web',
  web_fetch: 'web',
  grep_tool: 'search',
  glob_tool: 'search',
  ls_tool: 'file_read',
  lsp: 'other',
  todo_write: 'other',
  assign_task: 'other',
  skill: 'other',
  ask_user_tool: 'other',
};

// =============================================================================
// EventTranslator Class
// =============================================================================

/**
 * Translates AgentEvents from the orchestrator into ACP SessionUpdate
 * notifications that are sent to the connected client.
 *
 * The translator maintains state to track tool calls across events,
 * mapping Nuvin's tool call IDs to ACP's tool call ID format.
 *
 * @example
 * ```typescript
 * const translator = new EventTranslator('session_123', server);
 *
 * // Subscribe to agent events
 * eventBus.on('agent:event', (event) => {
 *   translator.translate(event);
 * });
 * ```
 */
export class EventTranslator {
  /** Session ID for this translator */
  private readonly sessionId: SessionId;

  /** Reference to ACP server for sending updates */
  private readonly server: ACPServer;

  /** Map of Nuvin tool call IDs to ACP tool call IDs */
  private readonly toolCallMap: Map<string, ToolCallId>;

  /** Map of sub-agent IDs to their tool call IDs */
  private readonly subAgentToolCalls: Map<string, ToolCallId>;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Create a new EventTranslator.
   *
   * @param sessionId - The session ID to use for updates
   * @param server - The ACP server to send updates through
   */
  constructor(sessionId: SessionId, server: ACPServer) {
    this.sessionId = sessionId;
    this.server = server;
    this.toolCallMap = new Map();
    this.subAgentToolCalls = new Map();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Translate an AgentEvent to ACP SessionUpdate(s) and send to client.
   *
   * Some events map directly to a single update, while others may produce
   * multiple updates (e.g., ToolCalls event with multiple tool calls).
   *
   * @param event - The AgentEvent to translate
   */
  translate(event: AgentEvent): void {
    switch (event.type) {
      case 'assistant_chunk':
        this.handleAssistantChunk(event);
        break;

      case 'reasoning_chunk':
        this.handleReasoningChunk(event);
        break;

      case 'tool_calls':
        this.handleToolCalls(event);
        break;

      case 'tool_result':
        this.handleToolResult(event);
        break;

      case 'tool_approval_required':
        this.handleToolApprovalRequired(event);
        break;

      case 'sub_agent_started':
        this.handleSubAgentStarted(event);
        break;

      case 'sub_agent_completed':
        this.handleSubAgentCompleted(event);
        break;

      case 'error':
        this.handleError(event);
        break;

      // Events that don't map to ACP updates (yet)
      case 'message_started':
      case 'assistant_message':
      case 'stream_finish':
      case 'done':
      case 'tool_approval_response':
      case 'mcp_stderr':
      case 'sub_agent_tool_call':
      case 'sub_agent_tool_result':
      case 'sub_agent_metrics':
      case 'user_question_required':
      case 'user_question_response':
        // These events don't have direct ACP mappings or are handled elsewhere
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle AssistantChunk event - streaming text from assistant
   */
  private handleAssistantChunk(
    event: Extract<AgentEvent, { type: 'assistant_chunk' }>,
  ): void {
    this.sendUpdate({
      type: 'agent_message_chunk',
      chunk: { text: event.delta },
    });
  }

  /**
   * Handle ReasoningChunk event - streaming reasoning/thinking from assistant
   */
  private handleReasoningChunk(
    event: Extract<AgentEvent, { type: 'reasoning_chunk' }>,
  ): void {
    this.sendUpdate({
      type: 'agent_thought_chunk',
      chunk: { text: event.delta },
    });
  }

  /**
   * Handle ToolCalls event - LLM requested tool execution
   */
  private handleToolCalls(
    event: Extract<AgentEvent, { type: 'tool_calls' }>,
  ): void {
    for (const toolCall of event.toolCalls) {
      // Generate ACP tool call ID and store mapping
      const acpToolCallId = this.createToolCallId(toolCall.id);
      this.toolCallMap.set(toolCall.id, acpToolCallId);

      // Parse tool arguments
      const input = this.safeParseJson(toolCall.function.arguments);

      // Extract location if this is a file operation
      const location = this.extractLocation(toolCall, input);

      this.sendUpdate({
        type: 'tool_call',
        toolCallId: acpToolCallId,
        kind: this.mapToolKind(toolCall.function.name),
        name: toolCall.function.name,
        content: {
          input,
          description: this.formatToolTitle(toolCall),
        },
        ...(location && { location }),
      });
    }
  }

  /**
   * Handle ToolApprovalRequired event - tool needs user approval
   */
  private handleToolApprovalRequired(
    event: Extract<AgentEvent, { type: 'tool_approval_required' }>,
  ): void {
    // Update tool call status to waiting_permission
    for (const toolCall of event.toolCalls) {
      const acpToolCallId = this.toolCallMap.get(toolCall.id);
      if (acpToolCallId) {
        this.sendUpdate({
          type: 'tool_call_update',
          toolCallId: acpToolCallId,
          status: 'waiting_permission',
        });
      }
    }
  }

  /**
   * Handle ToolResult event - tool execution completed
   */
  private handleToolResult(
    event: Extract<AgentEvent, { type: 'tool_result' }>,
  ): void {
    const { result } = event;

    // Look up the ACP tool call ID
    const acpToolCallId = this.toolCallMap.get(result.id);
    if (!acpToolCallId) {
      // Tool call wasn't tracked, create ID on the fly
      const newId = this.createToolCallId(result.id);
      this.toolCallMap.set(result.id, newId);
      return this.sendToolResultUpdate(newId, result);
    }

    this.sendToolResultUpdate(acpToolCallId, result);
  }

  /**
   * Handle SubAgentStarted event - sub-agent began execution
   */
  private handleSubAgentStarted(
    event: Extract<AgentEvent, { type: 'sub_agent_started' }>,
  ): void {
    // Create a tool call for the sub-agent
    const acpToolCallId = this.createToolCallId(event.toolCallId);
    this.subAgentToolCalls.set(event.agentId, acpToolCallId);

    this.sendUpdate({
      type: 'tool_call',
      toolCallId: acpToolCallId,
      kind: 'other',
      name: 'sub_agent',
      content: {
        input: { agentId: event.agentId, agentName: event.agentName },
        description: `Sub-agent: ${event.agentName}`,
      },
    });

    // Mark as running
    this.sendUpdate({
      type: 'tool_call_update',
      toolCallId: acpToolCallId,
      status: 'running',
    });
  }

  /**
   * Handle SubAgentCompleted event - sub-agent finished execution
   */
  private handleSubAgentCompleted(
    event: Extract<AgentEvent, { type: 'sub_agent_completed' }>,
  ): void {
    const acpToolCallId = this.subAgentToolCalls.get(event.agentId);
    if (!acpToolCallId) {
      return;
    }

    const success = event.status === 'success';

    this.sendUpdate({
      type: 'tool_call_update',
      toolCallId: acpToolCallId,
      status: success ? 'completed' : 'failed',
      result: {
        success,
        output: event.resultMessage,
        error: success ? undefined : event.resultMessage,
      },
    });

    // Clean up the mapping
    this.subAgentToolCalls.delete(event.agentId);
  }

  /**
   * Handle Error event - an error occurred during processing
   */
  private handleError(
    event: Extract<AgentEvent, { type: 'error' }>,
  ): void {
    // Send error as agent message chunk
    this.sendUpdate({
      type: 'agent_message_chunk',
      chunk: { text: `Error: ${event.error}` },
    });
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /**
   * Send a session update to the client.
   */
  private sendUpdate(update: SessionUpdate): void {
    try {
      acpLogger.debug(`[TRANSLATOR:${this.sessionId}] Sending update: ${update.type}`);
      this.server.sendSessionUpdate(this.sessionId, update);
    } catch (error) {
      acpLogger.error(`[TRANSLATOR:${this.sessionId}] Failed to send update`, error);
    }
  }

  /**
   * Send a tool result update to the client.
   */
  private sendToolResultUpdate(acpToolCallId: ToolCallId, result: ToolExecutionResult): void {
    const success = result.status === 'success';
    const acpResult = this.resultToAcpResult(result);

    this.sendUpdate({
      type: 'tool_call_update',
      toolCallId: acpToolCallId,
      status: success ? 'completed' : 'failed',
      result: acpResult,
    });
  }

  /**
   * Create an ACP tool call ID from a Nuvin tool call ID.
   */
  private createToolCallId(nuvinId: string): ToolCallId {
    return `tc_${nuvinId}`;
  }

  /**
   * Map a Nuvin tool name to an ACP ToolKind.
   */
  private mapToolKind(toolName: string): ToolKind {
    // Check direct mapping first
    if (toolName in TOOL_KIND_MAP) {
      return TOOL_KIND_MAP[toolName]!;
    }

    // Check for MCP tools
    if (toolName.startsWith('mcp_')) {
      return 'mcp';
    }

    // Default to 'other'
    return 'other';
  }

  /**
   * Format a human-readable title for a tool call.
   */
  private formatToolTitle(toolCall: ToolCall): string {
    const { name, arguments: argsJson } = toolCall.function;
    const args = this.safeParseJson(argsJson);

    switch (name) {
      case 'file_read':
        return `Read: ${args?.path ?? 'file'}`;

      case 'file_edit':
        return `Edit: ${args?.file_path ?? 'file'}`;

      case 'file_new':
        return `Create: ${args?.file_path ?? 'file'}`;

      case 'bash_tool':
        return `Run: ${this.truncate(args?.cmd as string, 50) ?? 'command'}`;

      case 'web_search':
        return `Search: ${this.truncate(args?.query as string, 50) ?? 'query'}`;

      case 'web_fetch':
        return `Fetch: ${args?.url ?? 'URL'}`;

      case 'grep_tool':
        return `Grep: ${this.truncate(args?.pattern as string, 30) ?? 'pattern'}`;

      case 'glob_tool':
        return `Glob: ${args?.pattern ?? 'pattern'}`;

      case 'ls_tool':
        return `List: ${args?.path ?? '.'}`;

      case 'lsp':
        return `LSP: ${args?.operation ?? 'operation'}`;

      case 'todo_write':
        return 'Update TODO list';

      case 'assign_task':
        return `Assign task to: ${args?.agent ?? 'agent'}`;

      case 'skill':
        return `Load skill: ${args?.name ?? 'skill'}`;

      default:
        return name;
    }
  }

  /**
   * Extract file location from tool call if applicable.
   */
  private extractLocation(
    toolCall: ToolCall,
    args: Record<string, unknown> | undefined,
  ): ToolCallLocation | undefined {
    if (!args) return undefined;

    const name = toolCall.function.name;

    // Extract path from various tool arguments
    let path: string | undefined;

    switch (name) {
      case 'file_read':
      case 'ls_tool':
        path = args.path as string;
        break;

      case 'file_edit':
      case 'file_new':
        path = args.file_path as string;
        break;

      case 'lsp':
        path = args.filePath as string;
        break;
    }

    if (!path) return undefined;

    // Build location object
    const location: ToolCallLocation = { path };

    // Add line information if available
    if (typeof args.lineStart === 'number') {
      location.startLine = args.lineStart;
    }
    if (typeof args.lineEnd === 'number') {
      location.endLine = args.lineEnd;
    }
    if (typeof args.line === 'number') {
      location.startLine = args.line;
      location.endLine = args.line;
    }

    return location;
  }

  /**
   * Convert a ToolExecutionResult to an ACP ToolCallResult.
   */
  private resultToAcpResult(result: ToolExecutionResult): ToolCallResult {
    const success = result.status === 'success';

    // Format output based on result type
    let output: string;
    if (result.type === 'json') {
      output = JSON.stringify(result.result, null, 2);
    } else if (typeof result.result === 'string') {
      output = result.result;
    } else {
      output = JSON.stringify(result.result);
    }

    // Truncate very long outputs
    if (output.length > 10000) {
      output = output.slice(0, 10000) + '\n... (truncated)';
    }

    return {
      success,
      output: success ? output : undefined,
      error: success ? undefined : output,
    };
  }

  /**
   * Safely parse a JSON string, returning undefined on failure.
   */
  private safeParseJson(json: string | undefined): Record<string, unknown> | undefined {
    if (!json) return undefined;

    try {
      const parsed = JSON.parse(json);
      return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Truncate a string to a maximum length.
   */
  private truncate(str: string | undefined, maxLen: number): string | undefined {
    if (!str) return undefined;
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
  }
}
