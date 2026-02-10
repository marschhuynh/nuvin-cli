import { describe, it, expect } from 'vitest';
import { routeAcpRequest } from '../../source/acp/router.js';

const server = {
  handleInitialize: async () => ({ protocolVersion: 1 }),
};

describe('ACP router', () => {
  it('routes initialize to server handler', async () => {
    const response = await routeAcpRequest(server as never, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });
    expect(response.result.protocolVersion).toBe(1);
  });
});
