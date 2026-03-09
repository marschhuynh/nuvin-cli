import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookEventTypes } from '@nuvin/nuvin-core';
import type { HookPort } from '@nuvin/nuvin-core';
import type { ToolCall } from '@nuvin/nuvin-core';
import type { IOrchestratorManager } from '@/services/IOrchestratorManager';
import { firePermissionRequestHooks } from '@/utils/firePermissionRequestHooks.js';

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tc-1',
    type: 'function',
    function: { name: 'bash_tool', arguments: '{"cmd":"echo hi"}' },
    requiresApproval: true,
    approvalId: 'approval-1',
    ...overrides,
  } as ToolCall;
}

function makeOrchestratorManager(hookPort: HookPort | null, sessionId = 'sess-1'): IOrchestratorManager {
  const orchestrator = hookPort
    ? { getHookPort: vi.fn().mockReturnValue(hookPort) }
    : { getHookPort: vi.fn().mockReturnValue(null) };

  return {
    getOrchestrator: vi.fn().mockReturnValue(orchestrator),
    getSession: vi.fn().mockReturnValue({ sessionId, sessionDir: null }),
  } as unknown as IOrchestratorManager;
}

describe('firePermissionRequestHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fire permission_request hook for each tool needing approval', async () => {
    const hookPort: HookPort = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(true),
    };
    const manager = makeOrchestratorManager(hookPort);
    const tools = [makeToolCall(), makeToolCall({ id: 'tc-2', approvalId: 'approval-2', function: { name: 'write_file', arguments: '{}' } })];

    await firePermissionRequestHooks(tools, manager);

    expect(hookPort.executeHook).toHaveBeenCalledTimes(2);
    expect(hookPort.executeHook).toHaveBeenCalledWith(
      expect.objectContaining({
        hookEvent: HookEventTypes.PermissionRequest,
        toolName: 'bash_tool',
        toolUseId: 'approval-1',
        permissionType: 'tool_approval',
        sessionId: 'sess-1',
      })
    );
    expect(hookPort.executeHook).toHaveBeenCalledWith(
      expect.objectContaining({
        hookEvent: HookEventTypes.PermissionRequest,
        toolName: 'write_file',
        toolUseId: 'approval-2',
        permissionType: 'tool_approval',
      })
    );
  });

  it('should parse tool arguments from string', async () => {
    const hookPort: HookPort = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(true),
    };
    const manager = makeOrchestratorManager(hookPort);
    const tools = [makeToolCall({ function: { name: 'bash_tool', arguments: '{"cmd":"ls -la"}' } })];

    await firePermissionRequestHooks(tools, manager);

    expect(hookPort.executeHook).toHaveBeenCalledWith(
      expect.objectContaining({
        toolInput: { cmd: 'ls -la' },
      })
    );
  });

  it('should do nothing when orchestratorManager is null', async () => {
    // No error should be thrown
    await expect(firePermissionRequestHooks([makeToolCall()], null)).resolves.toBeUndefined();
  });

  it('should do nothing when orchestrator returns no hook port', async () => {
    const manager = makeOrchestratorManager(null);
    // Should resolve without error
    await expect(firePermissionRequestHooks([makeToolCall()], manager)).resolves.toBeUndefined();
  });

  it('should do nothing when no PermissionRequest hooks are registered', async () => {
    const hookPort: HookPort = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(false),
    };
    const manager = makeOrchestratorManager(hookPort);

    await firePermissionRequestHooks([makeToolCall()], manager);

    expect(hookPort.executeHook).not.toHaveBeenCalled();
  });

  it('should skip tools without an approvalId', async () => {
    const hookPort: HookPort = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(true),
    };
    const manager = makeOrchestratorManager(hookPort);
    // One tool with approvalId, one without
    const tools = [
      makeToolCall({ approvalId: 'approval-1' }),
      makeToolCall({ id: 'tc-2', approvalId: undefined }),
    ];

    await firePermissionRequestHooks(tools, manager);

    expect(hookPort.executeHook).toHaveBeenCalledTimes(1);
    expect(hookPort.executeHook).toHaveBeenCalledWith(
      expect.objectContaining({ toolUseId: 'approval-1' })
    );
  });

  it('should handle hook execution errors gracefully without blocking', async () => {
    const hookPort: HookPort = {
      executeHook: vi.fn().mockRejectedValue(new Error('Hook failed')),
      hasHooks: vi.fn().mockReturnValue(true),
    };
    const manager = makeOrchestratorManager(hookPort);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw
    await expect(firePermissionRequestHooks([makeToolCall()], manager)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[PermissionRequest]'),
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });

  it('should use empty string for conversationId and messageId', async () => {
    const hookPort: HookPort = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(true),
    };
    const manager = makeOrchestratorManager(hookPort);

    await firePermissionRequestHooks([makeToolCall()], manager);

    expect(hookPort.executeHook).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '',
        messageId: '',
      })
    );
  });
});
