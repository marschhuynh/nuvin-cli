import { describe, it, expect, vi } from 'vitest';
import { routeAcpRequest, type AcpRequestHandler } from '../../source/acp/router.js';

function createMockHandler(): AcpRequestHandler {
  return {
    handleInitialize: vi.fn().mockResolvedValue({ protocolVersion: 1 }),
    handleSessionNew: vi.fn().mockResolvedValue({ sessionId: 's1' }),
    handleSessionList: vi.fn().mockResolvedValue({ sessions: [], nextCursor: null }),
    handleSessionLoad: vi.fn().mockResolvedValue({}),
    handleSessionPrompt: vi.fn().mockResolvedValue({ stopReason: 'end_turn' }),
    handleSessionCancel: vi.fn().mockResolvedValue({}),
    handleSessionSetConfigOption: vi.fn().mockResolvedValue({ ok: true }),
    handleSessionSetModel: vi.fn().mockResolvedValue({ ok: true, kind: 'model' }),
    handleSessionSetMode: vi.fn().mockResolvedValue({ ok: true, kind: 'mode' }),
    handleSessionResponsePermission: vi.fn().mockResolvedValue({}),
  };
}

describe('ACP router', () => {
  it('routes initialize to server handler', async () => {
    const server = createMockHandler();
    const response = await routeAcpRequest(server, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });
    expect(response?.result).toEqual({ protocolVersion: 1 });
    expect(server.handleInitialize).toHaveBeenCalled();
  });

  it('routes session/set_model to compatibility handler', async () => {
    const server = createMockHandler();
    const response = await routeAcpRequest(server, {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/set_model',
      params: { sessionId: 's1', modelId: 'openai/gpt-4o' },
    });
    expect(response?.result).toEqual({ ok: true, kind: 'model' });
  });

  it('routes session/set_mode to compatibility handler', async () => {
    const server = createMockHandler();
    const response = await routeAcpRequest(server, {
      jsonrpc: '2.0',
      id: 3,
      method: 'session/set_mode',
      params: { sessionId: 's1', modeId: 'main' },
    });
    expect(response?.result).toEqual({ ok: true, kind: 'mode' });
  });

  it('returns null for notifications (no id) on known methods', async () => {
    const server = createMockHandler();
    const response = await routeAcpRequest(server, {
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: { sessionId: 's1' },
    });
    expect(response).toBeNull();
    expect(server.handleSessionCancel).toHaveBeenCalled();
  });

  it('returns null for notifications on unknown methods', async () => {
    const server = createMockHandler();
    const response = await routeAcpRequest(server, {
      jsonrpc: '2.0',
      method: 'completely/unknown',
      params: {},
    });
    expect(response).toBeNull();
  });

  it('returns method-not-found error for unknown methods with an id', async () => {
    const server = createMockHandler();
    const response = await routeAcpRequest(server, {
      jsonrpc: '2.0',
      id: 99,
      method: 'completely/unknown',
      params: {},
    });
    expect(response?.error?.code).toBe(-32601);
    expect(response?.id).toBe(99);
  });

  it('catches handler errors and returns JSON-RPC error response', async () => {
    const server = createMockHandler();
    (server.handleSessionPrompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const response = await routeAcpRequest(server, {
      jsonrpc: '2.0',
      id: 10,
      method: 'session/prompt',
      params: { sessionId: 's1', prompt: [{ type: 'text', text: 'hi' }] },
    });
    expect(response?.error?.code).toBe(-32000);
    expect(response?.error?.message).toBe('boom');
  });

  it('routes all recognized methods without errors', async () => {
    const server = createMockHandler();
    const methods = [
      'initialize',
      'session/new',
      'session/list',
      'session/load',
      'session/prompt',
      'session/cancel',
      'session/set_config_option',
      'session/set_model',
      'session/set_mode',
      'session/response_permission',
    ];

    for (const method of methods) {
      const response = await routeAcpRequest(server, {
        jsonrpc: '2.0',
        id: 1,
        method,
        params: {},
      });
      expect(response?.error).toBeUndefined();
    }
  });
});
