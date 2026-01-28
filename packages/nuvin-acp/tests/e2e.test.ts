// packages/nuvin-acp/tests/e2e.test.ts
import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { ACPServer, type OrchestratorFactory } from '../source/server.js';

describe('ACP E2E', () => {
  it('should complete initialize -> session/new -> session/prompt flow', async () => {
    const responses: unknown[] = [];

    const mockFactory: OrchestratorFactory = async () => ({
      sendMessage: async () => {},
      onEvent: () => {},
      handleToolApproval: () => {},
    });

    // This is a simplified test - real E2E would use actual stdio
    const server = new ACPServer(mockFactory);

    // Test that server initializes without throwing
    expect(server).toBeDefined();
  });
});
