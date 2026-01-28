// packages/nuvin-acp/tests/handler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RequestHandler } from '../source/jsonrpc/handler.js';

describe('RequestHandler', () => {
  it('should route requests to registered methods', async () => {
    const handler = new RequestHandler();
    const mockMethod = vi.fn().mockResolvedValue({ data: 'test' });

    handler.register('test/method', mockMethod);

    const result = await handler.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'test/method',
      params: { foo: 'bar' },
    });

    expect(mockMethod).toHaveBeenCalledWith({ foo: 'bar' });
    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { data: 'test' },
    });
  });

  it('should return method not found for unknown methods', async () => {
    const handler = new RequestHandler();

    const result = await handler.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown',
    });

    expect(result.error?.code).toBe(-32601);
  });
});
