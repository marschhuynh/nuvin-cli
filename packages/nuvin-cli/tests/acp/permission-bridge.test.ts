/**
 * ACP PermissionBridge Tests
 *
 * Tests for the PermissionBridge class that bridges ACP permission requests
 * with Nuvin's tool approval system.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToolCall } from '@nuvin/nuvin-core';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock vscode-jsonrpc before importing server module
vi.mock('vscode-jsonrpc/node.js', () => {
  return {
    createMessageConnection: vi.fn(() => ({
      listen: vi.fn(),
      sendNotification: vi.fn(),
      sendRequest: vi.fn(),
      onRequest: vi.fn(),
      onNotification: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
      dispose: vi.fn(),
    })),
    StreamMessageReader: vi.fn(),
    StreamMessageWriter: vi.fn(),
  };
});

// =============================================================================
// Tests
// =============================================================================

describe('PermissionBridge', () => {
  let mockServer: {
    requestPermission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      requestPermission: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // mapOutcomeToDecision Tests
  // ---------------------------------------------------------------------------

  describe('mapOutcomeToDecision', () => {
    it('should map allow-once to approve', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      const bridge = new PermissionBridge('session_123', mockServer as any);
      const decision = bridge.mapOutcomeToDecision({ selectedOption: 'allow-once' });

      expect(decision).toBe('approve');
    });

    it('should map allow-always to approve_all', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      const bridge = new PermissionBridge('session_123', mockServer as any);
      const decision = bridge.mapOutcomeToDecision({ selectedOption: 'allow-always' });

      expect(decision).toBe('approve_all');
    });

    it('should map reject-once to deny', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      const bridge = new PermissionBridge('session_123', mockServer as any);
      const decision = bridge.mapOutcomeToDecision({ selectedOption: 'reject-once' });

      expect(decision).toBe('deny');
    });

    it('should map reject-always to deny', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      const bridge = new PermissionBridge('session_123', mockServer as any);
      const decision = bridge.mapOutcomeToDecision({ selectedOption: 'reject-always' });

      expect(decision).toBe('deny');
    });

    it('should map unknown option to deny for safety', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      const bridge = new PermissionBridge('session_123', mockServer as any);
      const decision = bridge.mapOutcomeToDecision({ selectedOption: 'unknown-option' });

      expect(decision).toBe('deny');
    });
  });

  // ---------------------------------------------------------------------------
  // requestApproval Tests
  // ---------------------------------------------------------------------------

  describe('requestApproval', () => {
    it('should send permission request to server', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      mockServer.requestPermission.mockResolvedValue({ selectedOption: 'allow-once' });

      const bridge = new PermissionBridge('session_123', mockServer as any);

      const toolCall: ToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'bash_tool',
          arguments: JSON.stringify({ cmd: 'rm -rf /' }),
        },
      };

      await bridge.requestApproval('call_123', toolCall);

      expect(mockServer.requestPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session_123',
          toolCallId: 'tc_call_123',
          title: 'Tool: bash_tool',
        }),
      );
    });

    it('should return approve when user selects allow-once', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      mockServer.requestPermission.mockResolvedValue({ selectedOption: 'allow-once' });

      const bridge = new PermissionBridge('session_123', mockServer as any);

      const toolCall: ToolCall = {
        id: 'call_456',
        type: 'function',
        function: { name: 'file_edit', arguments: '{}' },
      };

      const decision = await bridge.requestApproval('call_456', toolCall);

      expect(decision).toBe('approve');
    });

    it('should return approve_all when user selects allow-always', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      mockServer.requestPermission.mockResolvedValue({ selectedOption: 'allow-always' });

      const bridge = new PermissionBridge('session_123', mockServer as any);

      const toolCall: ToolCall = {
        id: 'call_789',
        type: 'function',
        function: { name: 'bash_tool', arguments: '{}' },
      };

      const decision = await bridge.requestApproval('call_789', toolCall);

      expect(decision).toBe('approve_all');
    });

    it('should return deny when user selects reject-once', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      mockServer.requestPermission.mockResolvedValue({ selectedOption: 'reject-once' });

      const bridge = new PermissionBridge('session_123', mockServer as any);

      const toolCall: ToolCall = {
        id: 'call_reject',
        type: 'function',
        function: { name: 'bash_tool', arguments: '{}' },
      };

      const decision = await bridge.requestApproval('call_reject', toolCall);

      expect(decision).toBe('deny');
    });

    it('should return deny when request fails', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      mockServer.requestPermission.mockRejectedValue(new Error('Connection lost'));

      const bridge = new PermissionBridge('session_123', mockServer as any);

      const toolCall: ToolCall = {
        id: 'call_error',
        type: 'function',
        function: { name: 'bash_tool', arguments: '{}' },
      };

      const decision = await bridge.requestApproval('call_error', toolCall);

      expect(decision).toBe('deny');
    });

    it('should include tool arguments in description', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      mockServer.requestPermission.mockResolvedValue({ selectedOption: 'allow-once' });

      const bridge = new PermissionBridge('session_123', mockServer as any);

      const toolCall: ToolCall = {
        id: 'call_args',
        type: 'function',
        function: {
          name: 'bash_tool',
          arguments: JSON.stringify({ cmd: 'echo hello' }),
        },
      };

      await bridge.requestApproval('call_args', toolCall);

      const requestCall = mockServer.requestPermission.mock.calls[0]?.[0];
      expect(requestCall.description).toContain('bash_tool');
      expect(requestCall.description).toContain('echo hello');
    });

    it('should include permission options in request', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      mockServer.requestPermission.mockResolvedValue({ selectedOption: 'allow-once' });

      const bridge = new PermissionBridge('session_123', mockServer as any);

      const toolCall: ToolCall = {
        id: 'call_opts',
        type: 'function',
        function: { name: 'file_edit', arguments: '{}' },
      };

      await bridge.requestApproval('call_opts', toolCall);

      const requestCall = mockServer.requestPermission.mock.calls[0]?.[0];
      expect(requestCall.options).toBeDefined();
      expect(requestCall.options.length).toBeGreaterThan(0);

      const optionIds = requestCall.options.map((o: { id: string }) => o.id);
      expect(optionIds).toContain('allow-once');
      expect(optionIds).toContain('allow-always');
      expect(optionIds).toContain('reject-once');
    });
  });

  // ---------------------------------------------------------------------------
  // cancel Tests
  // ---------------------------------------------------------------------------

  describe('cancel', () => {
    it('should resolve pending approvals with deny', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      // Create a mock that never resolves
      let resolvePermission: ((value: { selectedOption: string }) => void) | undefined;
      mockServer.requestPermission.mockImplementation(
        () =>
          new Promise<{ selectedOption: string }>((resolve) => {
            resolvePermission = resolve;
          }),
      );

      const bridge = new PermissionBridge('session_123', mockServer as any);

      const toolCall: ToolCall = {
        id: 'call_pending',
        type: 'function',
        function: { name: 'bash_tool', arguments: '{}' },
      };

      // Start the approval request (don't await)
      const approvalPromise = bridge.requestApproval('call_pending', toolCall);

      // Cancel all pending
      bridge.cancel();

      // The approval should resolve with deny
      const decision = await approvalPromise;
      expect(decision).toBe('deny');
    });

    it('should be safe to call cancel with no pending approvals', async () => {
      const { PermissionBridge } = await import('../../source/acp/permission-bridge.js');

      const bridge = new PermissionBridge('session_123', mockServer as any);

      // Should not throw
      expect(() => bridge.cancel()).not.toThrow();
    });
  });
});
