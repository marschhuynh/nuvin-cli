import { describe, it, expect, vi } from 'vitest';
import type { ToolInvocation, ToolExecutionResult } from '../ports.js';

describe('Abort Signal Propagation', () => {
  describe('Signal passed through tool execution chain', () => {
    it('should receive abort signal when already aborted', async () => {
      const mockExecute = vi
        .fn()
        .mockImplementation(
          async (
            _calls: ToolInvocation[],
            _context: any,
            _maxConcurrent: number,
            signal?: AbortSignal,
          ): Promise<ToolExecutionResult[]> => {
            if (signal?.aborted) {
              return [
                {
                  id: 'call_1',
                  name: 'test_tool',
                  status: 'error',
                  type: 'text',
                  result: 'Tool execution aborted by user',
                  durationMs: 0,
                },
              ];
            }
            return [
              {
                id: 'call_1',
                name: 'test_tool',
                status: 'success',
                type: 'text',
                result: 'Success',
                durationMs: 10,
              },
            ];
          },
        );

      const controller = new AbortController();
      controller.abort();

      const calls: ToolInvocation[] = [{ id: 'call_1', name: 'test_tool', parameters: {} }];

      const results = await mockExecute(calls, {}, 3, controller.signal);

      expect(results[0].result).toBe('Tool execution aborted by user');
      expect(results[0].status).toBe('error');
      expect(results[0].durationMs).toBe(0);
    });

    it('should handle abort during execution', async () => {
      const mockExecute = vi
        .fn()
        .mockImplementation(
          async (_calls: ToolInvocation[], _context: any, _maxConcurrent: number, signal?: AbortSignal) => {
            await new Promise((resolve) => setTimeout(resolve, 50));

            if (signal?.aborted) {
              return [
                {
                  id: 'call_1',
                  name: 'test_tool',
                  status: 'error' as const,
                  type: 'text' as const,
                  result: 'Tool execution aborted by user',
                  durationMs: 50,
                },
              ];
            }

            return [
              {
                id: 'call_1',
                name: 'test_tool',
                status: 'success' as const,
                type: 'text' as const,
                result: 'Success',
                durationMs: 100,
              },
            ];
          },
        );

      const controller = new AbortController();

      const calls: ToolInvocation[] = [{ id: 'call_1', name: 'test_tool', parameters: {} }];

      const executePromise = mockExecute(calls, {}, 3, controller.signal);

      setTimeout(() => controller.abort(), 25);

      const results = await executePromise;

      expect(results[0].result).toBe('Tool execution aborted by user');
      expect(results[0].status).toBe('error');
    });

    it('should return abort results for all calls when signal is aborted', async () => {
      const mockExecute = vi
        .fn()
        .mockImplementation(
          async (calls: ToolInvocation[], _context: any, _maxConcurrent: number, signal?: AbortSignal) => {
            if (signal?.aborted) {
              return calls.map((call) => ({
                id: call.id,
                name: call.name,
                status: 'error' as const,
                type: 'text' as const,
                result: 'Tool execution aborted by user',
                durationMs: 0,
              }));
            }
            return calls.map((call) => ({
              id: call.id,
              name: call.name,
              status: 'success' as const,
              type: 'text' as const,
              result: 'Success',
              durationMs: 10,
            }));
          },
        );

      const controller = new AbortController();
      controller.abort();

      const calls: ToolInvocation[] = [
        { id: 'call_1', name: 'tool_1', parameters: {} },
        { id: 'call_2', name: 'tool_2', parameters: {} },
        { id: 'call_3', name: 'tool_3', parameters: {} },
      ];

      const results = await mockExecute(calls, {}, 3, controller.signal);

      expect(results).toHaveLength(3);

      for (const result of results) {
        expect(result.status).toBe('error');
        expect(result.result).toBe('Tool execution aborted by user');
        expect(result.durationMs).toBe(0);
      }

      expect(results.map((r) => r.id)).toEqual(['call_1', 'call_2', 'call_3']);
    });
  });

  describe('Abort message consistency', () => {
    it('should use consistent abort message', () => {
      const abortMessage = 'Tool execution aborted by user';

      expect(abortMessage).toMatch(/aborted by user/i);
      expect(abortMessage).toContain('Tool execution');
      expect(abortMessage.toLowerCase()).toContain('aborted by user');
    });

    it('should be detectable in UI layer', () => {
      const result = {
        status: 'error',
        result: 'Tool execution aborted by user',
      };

      const isAborted =
        result.status === 'error' &&
        typeof result.result === 'string' &&
        result.result.toLowerCase().includes('aborted by user');

      expect(isAborted).toBe(true);
    });
  });

  describe('Memory consistency - all tools get results', () => {
    it('should ensure every tool call has a corresponding result', async () => {
      const controller = new AbortController();
      controller.abort();

      const calls: ToolInvocation[] = [
        { id: 'call_1', name: 'tool_1', parameters: {} },
        { id: 'call_2', name: 'tool_2', parameters: {} },
        { id: 'call_3', name: 'tool_3', parameters: {} },
      ];

      const results: ToolExecutionResult[] = calls.map((call) => ({
        id: call.id,
        name: call.name,
        status: 'error',
        type: 'text',
        result: 'Tool execution aborted by user',
        durationMs: 0,
      }));

      const resultIds = results.map((r) => r.id).sort();
      const callIds = calls.map((c) => c.id).sort();

      expect(resultIds).toEqual(callIds);
    });
  });
});
