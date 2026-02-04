/**
 * Permission Bridge - Bridges ACP permission requests with Nuvin tool approval
 *
 * Handles the translation between ACP's permission request/response protocol
 * and Nuvin's tool approval decision system.
 */

import type { ToolApprovalDecision, ToolCall } from '@nuvin/nuvin-core';

import type { ACPServer } from './server.js';
import type {
  SessionId,
  ToolCallId,
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from './types.js';
import { acpLogger } from './logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Pending approval request with its resolution controls
 */
interface PendingApproval {
  toolCallId: string;
  resolve: (decision: ToolApprovalDecision) => void;
  reject: (error: Error) => void;
}

// =============================================================================
// Permission Options
// =============================================================================

/**
 * Standard permission options presented to the user
 */
const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    id: 'allow-once',
    label: 'Allow',
    description: 'Allow this tool call once',
    isDeny: false,
    remember: false,
  },
  {
    id: 'allow-always',
    label: 'Allow always',
    description: 'Allow this tool and remember for future calls',
    isDeny: false,
    remember: true,
  },
  {
    id: 'reject-once',
    label: 'Reject',
    description: 'Reject this tool call',
    isDeny: true,
    remember: false,
  },
];

// =============================================================================
// PermissionBridge Class
// =============================================================================

/**
 * Bridges ACP permission requests with Nuvin's tool approval system.
 *
 * Handles the flow:
 * 1. Agent wants to execute a tool requiring approval
 * 2. PermissionBridge sends ACP `session/request_permission` to client
 * 3. Client shows dialog to user and returns their decision
 * 4. PermissionBridge maps ACP response to Nuvin's ToolApprovalDecision
 *
 * @example
 * ```typescript
 * const bridge = new PermissionBridge(sessionId, server);
 *
 * // When a tool needs approval
 * const decision = await bridge.requestApproval(toolCall.id, toolCall);
 * if (decision === 'approve' || decision === 'approve_all') {
 *   // Execute the tool
 * }
 * ```
 */
export class PermissionBridge {
  private readonly sessionId: SessionId;
  private readonly server: ACPServer;
  private readonly pendingApprovals: Map<string, PendingApproval> = new Map();

  /**
   * Create a new PermissionBridge
   *
   * @param sessionId - The ACP session ID
   * @param server - The ACP server to send requests through
   */
  constructor(sessionId: SessionId, server: ACPServer) {
    this.sessionId = sessionId;
    this.server = server;
  }

  /**
   * Request approval for a tool call from the client.
   *
   * Sends an ACP permission request to the client and waits for the user's
   * decision. Maps the ACP response to a Nuvin ToolApprovalDecision.
   *
   * @param toolCallId - Unique identifier for the tool call
   * @param toolCall - The tool call requiring approval
   * @returns Promise resolving to the user's approval decision
   */
  async requestApproval(
    toolCallId: string,
    toolCall: ToolCall,
  ): Promise<ToolApprovalDecision> {
    // Create ACP-style tool call ID
    const acpToolCallId: ToolCallId = `tc_${toolCallId}`;

    acpLogger.debug(`[PERMISSION:${this.sessionId}] Requesting approval for tool: ${toolCall.function.name}, id: ${toolCallId}`);

    // Parse tool arguments for display
    let toolArgs: unknown;
    try {
      toolArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      toolArgs = toolCall.function.arguments;
    }

    // Build the permission request
    const request: RequestPermissionRequest = {
      sessionId: this.sessionId,
      toolCallId: acpToolCallId,
      title: `Tool: ${toolCall.function.name}`,
      description: this.buildDescription(toolCall.function.name, toolArgs),
      options: PERMISSION_OPTIONS,
    };

    // Create a promise that can be resolved externally (for cancellation)
    const cancellationPromise = new Promise<ToolApprovalDecision>((resolve) => {
      this.pendingApprovals.set(toolCallId, {
        toolCallId,
        resolve,
        reject: () => resolve('deny'),
      });
    });

    try {
      // Race between the permission request and cancellation
      const permissionPromise = this.server.requestPermission(request).then(
        (response) => {
          const decision = this.mapOutcomeToDecision(response);
          acpLogger.debug(`[PERMISSION:${this.sessionId}] Got response for tool ${toolCall.function.name}: ${response.selectedOption} -> ${decision}`);
          return decision;
        },
        (error) => {
          acpLogger.error(`[PERMISSION:${this.sessionId}] Permission request failed`, error);
          return 'deny' as ToolApprovalDecision;
        },
      );

      return await Promise.race([permissionPromise, cancellationPromise]);
    } catch (error) {
      // If request failed (e.g., cancelled, connection error), deny
      acpLogger.error(`[PERMISSION:${this.sessionId}] Unexpected error in requestApproval`, error);
      return 'deny';
    } finally {
      // Clean up pending approval tracking
      this.pendingApprovals.delete(toolCallId);
    }
  }

  /**
   * Cancel all pending approval requests.
   *
   * Resolves all pending approvals with 'deny' decision.
   * Call this when the session is being closed or the prompt is cancelled.
   */
  cancel(): void {
    acpLogger.debug(`[PERMISSION:${this.sessionId}] Cancelling ${this.pendingApprovals.size} pending approvals`);
    for (const [toolCallId, pending] of this.pendingApprovals) {
      pending.resolve('deny');
      this.pendingApprovals.delete(toolCallId);
    }
  }

  /**
   * Map an ACP permission response to a Nuvin tool approval decision.
   *
   * @param response - The ACP permission response from the client
   * @returns The corresponding Nuvin tool approval decision
   */
  mapOutcomeToDecision(response: RequestPermissionResponse): ToolApprovalDecision {
    const selectedOption = response.selectedOption;

    switch (selectedOption) {
      case 'allow-once':
        return 'approve';

      case 'allow-always':
        return 'approve_all';

      case 'reject-once':
      case 'reject-always':
        return 'deny';

      default:
        // Unknown option, default to deny for safety
        return 'deny';
    }
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a human-readable description of the tool call for the permission dialog.
   */
  private buildDescription(toolName: string, args: unknown): string {
    const lines: string[] = [];
    lines.push(`The agent wants to execute the "${toolName}" tool.`);

    if (args && typeof args === 'object') {
      lines.push('');
      lines.push('Arguments:');
      lines.push('```json');
      lines.push(JSON.stringify(args, null, 2));
      lines.push('```');
    }

    return lines.join('\n');
  }
}
