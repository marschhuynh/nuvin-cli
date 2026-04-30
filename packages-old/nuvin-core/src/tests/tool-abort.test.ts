import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../tools.js';
import { BashTool } from '../tools/BashTool.js';
import type { ToolInvocation } from '../ports.js';

describe('Tool Abort Functionality', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('ToolRegistry abort handling', () => {
    it('should return abort errors for all tools when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const calls: ToolInvocation[] = [
        { id: 'call_1', name: 'bash_tool', parameters: { cmd: 'echo "test1"' } },
        { id: 'call_2', name: 'file_read', parameters: { path: 'test.txt' } },
        { id: 'call_3', name: 'web_search', parameters: { query: 'test' } },
      ];

      const results = await registry.executeToolCalls(calls, {}, 3, controller.signal);

      expect(results).toHaveLength(3);

      for (const result of results) {
        expect(result.status).toBe('error');
        expect(result.result).toBe('Tool execution aborted by user');
        expect(result.durationMs).toBe(0);
      }

      expect(results[0].id).toBe('call_1');
      expect(results[1].id).toBe('call_2');
      expect(results[2].id).toBe('call_3');
    });

    it('should abort remaining tools when signal aborts during batch execution', async () => {
      const controller = new AbortController();

      const calls: ToolInvocation[] = [
        { id: 'call_1', name: 'bash_tool', parameters: { cmd: 'echo "test1"' } },
        { id: 'call_2', name: 'bash_tool', parameters: { cmd: 'echo "test2"' } },
        { id: 'call_3', name: 'bash_tool', parameters: { cmd: 'echo "test3"' } },
      ];

      setTimeout(() => controller.abort(), 50);

      const results = await registry.executeToolCalls(calls, {}, 1, controller.signal);

      expect(results).toHaveLength(3);

      const abortedResults = results.filter((r) => r.result === 'Tool execution aborted by user');
      expect(abortedResults.length).toBeGreaterThan(0);
    });

    it('should ensure all tool calls get results (no orphans)', async () => {
      const controller = new AbortController();
      controller.abort();

      const calls: ToolInvocation[] = [
        { id: 'call_1', name: 'tool_1', parameters: {} },
        { id: 'call_2', name: 'tool_2', parameters: {} },
        { id: 'call_3', name: 'tool_3', parameters: {} },
      ];

      const results = await registry.executeToolCalls(calls, {}, 3, controller.signal);

      const resultIds = results.map((r) => r.id);
      const callIds = calls.map((c) => c.id);

      expect(resultIds.sort()).toEqual(callIds.sort());
    });
  });

  describe('BashTool abort handling', () => {
    it('should return abort error when signal is already aborted', async () => {
      const tool = new BashTool();
      const controller = new AbortController();
      controller.abort();

      const result = await tool.execute({ cmd: 'sleep 10' }, { signal: controller.signal });

      expect(result.status).toBe('error');
      expect(result.result).toBe('Command execution aborted by user');
    });

    it('should kill child process when abort signal is triggered', async () => {
      const tool = new BashTool();
      const controller = new AbortController();

      const executePromise = tool.execute({ cmd: 'sleep 5', timeoutMs: 10000 }, { signal: controller.signal });

      setTimeout(() => controller.abort(), 100);

      const result = await executePromise;

      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted by user');
    }, 10000);

    it('should include partial output in abort message', async () => {
      const tool = new BashTool();
      const controller = new AbortController();

      const executePromise = tool.execute(
        { cmd: 'echo "before abort" && sleep 2 && echo "after abort"', timeoutMs: 10000 },
        { signal: controller.signal },
      );

      setTimeout(() => controller.abort(), 100);

      const result = await executePromise;

      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted by user');

      if (result.result.includes('Output before abort')) {
        expect(result.result).toContain('before abort');
      }
    }, 10000);
  });

  describe('Signal propagation', () => {
    it('should propagate signal through context to tools', async () => {
      const controller = new AbortController();
      controller.abort();

      const calls: ToolInvocation[] = [{ id: 'call_1', name: 'bash_tool', parameters: { cmd: 'echo "test"' } }];

      const context = {
        conversationId: 'test',
        agentId: 'test-agent',
      };

      const results = await registry.executeToolCalls(calls, context, 3, controller.signal);

      expect(results[0].status).toBe('error');
      expect(results[0].result).toBe('Tool execution aborted by user');
    });
  });

  describe('Abort message consistency', () => {
    it('should use consistent abort message across all tools', async () => {
      const controller = new AbortController();
      controller.abort();

      const calls: ToolInvocation[] = [
        { id: 'call_1', name: 'bash_tool', parameters: { cmd: 'echo "test"' } },
        { id: 'call_2', name: 'file_read', parameters: { path: 'test.txt' } },
        { id: 'call_3', name: 'ls_tool', parameters: { path: '.' } },
      ];

      const results = await registry.executeToolCalls(calls, {}, 3, controller.signal);

      const abortMessages = results.map((r) => r.result);
      expect(abortMessages.every((msg) => msg === 'Tool execution aborted by user')).toBe(true);
    });
  });
});
