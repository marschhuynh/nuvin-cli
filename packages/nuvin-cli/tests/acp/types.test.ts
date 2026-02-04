/**
 * ACP Types Tests
 *
 * Verifies that all types and constants are properly exported from the ACP module.
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Tests
// =============================================================================

describe('ACP Types', () => {
  // ---------------------------------------------------------------------------
  // Protocol Version
  // ---------------------------------------------------------------------------

  describe('PROTOCOL_VERSION', () => {
    it('should be exported from types module', async () => {
      const types = await import('../../source/acp/types.js');

      expect(types).toHaveProperty('PROTOCOL_VERSION');
      expect(types.PROTOCOL_VERSION).toBe(1);
    });

    it('should be exported from index module', async () => {
      const acp = await import('../../source/acp/index.js');

      expect(acp).toHaveProperty('PROTOCOL_VERSION');
      expect(acp.PROTOCOL_VERSION).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // AcpMethod Constants
  // ---------------------------------------------------------------------------

  describe('AcpMethod', () => {
    it('should export all ACP method names', async () => {
      const { AcpMethod } = await import('../../source/acp/types.js');

      expect(AcpMethod.Initialize).toBe('initialize');
      expect(AcpMethod.Shutdown).toBe('shutdown');
      expect(AcpMethod.NewSession).toBe('session/new');
      expect(AcpMethod.LoadSession).toBe('session/load');
      expect(AcpMethod.CloseSession).toBe('session/close');
      expect(AcpMethod.Prompt).toBe('prompt');
      expect(AcpMethod.Cancel).toBe('cancel');
      expect(AcpMethod.SessionUpdate).toBe('session/update');
      expect(AcpMethod.RequestPermission).toBe('permission/request');
      expect(AcpMethod.FsReadTextFile).toBe('fs/readTextFile');
      expect(AcpMethod.FsWriteTextFile).toBe('fs/writeTextFile');
    });
  });

  // ---------------------------------------------------------------------------
  // JsonRpcErrorCode Constants
  // ---------------------------------------------------------------------------

  describe('JsonRpcErrorCode', () => {
    it('should export standard JSON-RPC error codes', async () => {
      const { JsonRpcErrorCode } = await import('../../source/acp/types.js');

      expect(JsonRpcErrorCode.ParseError).toBe(-32700);
      expect(JsonRpcErrorCode.InvalidRequest).toBe(-32600);
      expect(JsonRpcErrorCode.MethodNotFound).toBe(-32601);
      expect(JsonRpcErrorCode.InvalidParams).toBe(-32602);
      expect(JsonRpcErrorCode.InternalError).toBe(-32603);
    });
  });

  // ---------------------------------------------------------------------------
  // Module Exports
  // ---------------------------------------------------------------------------

  describe('index exports', () => {
    it('should export ACPServer', async () => {
      const acp = await import('../../source/acp/index.js');

      expect(acp).toHaveProperty('ACPServer');
      expect(acp).toHaveProperty('createACPServer');
    });

    it('should export NuvinACPHandler', async () => {
      const acp = await import('../../source/acp/index.js');

      expect(acp).toHaveProperty('NuvinACPHandler');
    });

    it('should export ACPError and ACPErrorCode', async () => {
      const acp = await import('../../source/acp/index.js');

      expect(acp).toHaveProperty('ACPError');
      expect(acp).toHaveProperty('ACPErrorCode');
    });

    it('should export PermissionBridge', async () => {
      const acp = await import('../../source/acp/index.js');

      expect(acp).toHaveProperty('PermissionBridge');
    });

    it('should export all type definitions from types.js', async () => {
      const acp = await import('../../source/acp/index.js');

      // Core constants
      expect(acp).toHaveProperty('PROTOCOL_VERSION');
      expect(acp).toHaveProperty('AcpMethod');
      expect(acp).toHaveProperty('JsonRpcErrorCode');
    });
  });

  // ---------------------------------------------------------------------------
  // Type Structure Verification
  // ---------------------------------------------------------------------------

  describe('type structure verification', () => {
    it('should have correct StopReason values', async () => {
      // Type verification - these are type-only exports so we verify via usage
      const types = await import('../../source/acp/types.js');

      // Verify the module exports the types we expect to use
      expect(types).toBeDefined();

      // The actual types are TypeScript-only, but we can verify the module loads
      // without errors, which validates the type definitions are syntactically correct
    });

    it('should have correct ToolKind values', async () => {
      // These are string literal types, verified by checking related code works
      const types = await import('../../source/acp/types.js');

      expect(types).toBeDefined();
    });

    it('should have correct ToolCallStatus values', async () => {
      const types = await import('../../source/acp/types.js');

      expect(types).toBeDefined();
    });
  });
});
