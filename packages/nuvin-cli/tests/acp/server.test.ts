import { describe, it, expect, vi } from 'vitest';
import { AcpServer } from '../../source/acp/server.js';

const mockTransport = {
  send: vi.fn(),
};

const mockOrchestrator = {
  init: vi.fn(),
  send: vi.fn().mockResolvedValue({ id: 'msg', content: 'ok', role: 'assistant', timestamp: new Date().toISOString() }),
  getConfig: vi.fn(),
  getStatus: vi.fn(),
  getSession: vi.fn().mockReturnValue({ sessionId: 'sess_1', sessionDir: '/tmp/sess_1' }),
};

describe('AcpServer', () => {
  it('responds to initialize with protocolVersion and capabilities', async () => {
    const server = new AcpServer({ transport: mockTransport, orchestratorManager: mockOrchestrator as never });
    const result = await server.handleInitialize({ protocolVersion: 1, clientCapabilities: {} });
    expect(result.protocolVersion).toBe(1);
    expect(result.agentCapabilities).toBeDefined();
  });
});
