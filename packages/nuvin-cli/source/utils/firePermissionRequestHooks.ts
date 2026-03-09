import type { ToolCall } from '@nuvin/nuvin-core';
import { HookEventTypes, safeParseToolArguments } from '@nuvin/nuvin-core';
import type { IOrchestratorManager } from '@/services/IOrchestratorManager';

/**
 * Fire permission_request hooks for tools that are actually shown in the approval UI.
 *
 * This is called from the CLI layer after session-approved tools have been filtered out,
 * ensuring the hook only fires when the approval dialog is truly displayed to the user.
 *
 * Note: PermissionRequest hooks are informational (e.g., notifications).
 * They don't block or modify the approval flow.
 */
export async function firePermissionRequestHooks(
  tools: ToolCall[],
  orchestratorManager: IOrchestratorManager | null,
): Promise<void> {
  if (!orchestratorManager) return;

  const orchestrator = orchestratorManager.getOrchestrator();
  const hookPort = orchestrator?.getHookPort();
  if (!hookPort?.hasHooks(HookEventTypes.PermissionRequest)) return;

  const sessionId = orchestratorManager.getSession().sessionId ?? '';

  for (const tc of tools) {
    if (!tc.approvalId) continue;

    const hookContext = {
      sessionId,
      // conversationId/messageId are not available in the CLI layer at this point;
      // acceptable since permission_request hooks are informational only.
      conversationId: '',
      messageId: '',
      hookEvent: HookEventTypes.PermissionRequest,
      cwd: process.cwd(),
      toolName: tc.function.name,
      toolInput: typeof tc.function.arguments === 'string'
        ? safeParseToolArguments(tc.function.arguments)
        : tc.function.arguments as Record<string, unknown>,
      toolUseId: tc.approvalId,
      permissionType: 'tool_approval',
    };

    try {
      await hookPort.executeHook(hookContext);
    } catch (hookError) {
      // Log hook execution error but don't block the approval flow
      console.warn(`[PermissionRequest] hook error for ${tc.function.name}:`, hookError);
    }
  }
}
