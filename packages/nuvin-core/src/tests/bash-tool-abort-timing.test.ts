import { describe, it, expect } from 'vitest';
import { BashTool } from '../tools/BashTool.js';

describe('BashTool - Abort Timing Tests', () => {
  describe('Abort during long-running command', () => {
    it('should abort bash command after 3 seconds during 4 second sleep', async () => {
      const tool = new BashTool();
      const controller = new AbortController();

      const command = 'echo "Starting long command..." && sleep 4 && echo "Command completed"';

      const startTime = Date.now();

      const executePromise = tool.execute({ cmd: command, timeoutMs: 10000 }, { signal: controller.signal });

      // Abort after 3 seconds (during the sleep)
      setTimeout(() => {
        controller.abort();
      }, 3000);

      const result = await executePromise;
      const executionTime = Date.now() - startTime;

      // Assertions
      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted by user');

      // Should complete in approximately 3 seconds (with some tolerance)
      expect(executionTime).toBeGreaterThan(2900); // At least 2.9 seconds
      expect(executionTime).toBeLessThan(3500); // Less than 3.5 seconds

      // Should have the "Starting" message but not "completed"
      expect(result.result).toContain('Starting long command');
      expect(result.result).not.toContain('Command completed');
    }, 15000);

    it('should include partial output before abort', async () => {
      const tool = new BashTool();
      const controller = new AbortController();

      const command = 'echo "Line 1" && sleep 1 && echo "Line 2" && sleep 3 && echo "Line 3"';

      const executePromise = tool.execute({ cmd: command, timeoutMs: 10000 }, { signal: controller.signal });

      // Abort after 2 seconds (should see Line 1 and Line 2, but not Line 3)
      setTimeout(() => {
        controller.abort();
      }, 2000);

      const result = await executePromise;

      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted by user');

      // Should always have Line 1 (immediate output)
      expect(result.result).toContain('Line 1');
      
      // Line 2 might or might not be present depending on timing (sleep 1 + abort at 2s)
      // but Line 3 should never be present (requires sleep 3 after Line 2)
      expect(result.result).not.toContain('Line 3');
    }, 15000);

    it('should abort immediately if signal is already aborted', async () => {
      const tool = new BashTool();
      const controller = new AbortController();

      // Abort before execution
      controller.abort();

      const startTime = Date.now();

      const result = await tool.execute({ cmd: 'sleep 10', timeoutMs: 20000 }, { signal: controller.signal });

      const executionTime = Date.now() - startTime;

      expect(result.status).toBe('error');
      expect(result.result).toBe('Command execution aborted by user');

      // Should complete almost immediately (less than 100ms)
      expect(executionTime).toBeLessThan(100);
    });

    it('should abort multiple sequential commands', async () => {
      const tool = new BashTool();
      const controller = new AbortController();

      // Multiple commands that would take 10 seconds total
      const command =
        'echo "Step 1" && sleep 2 && echo "Step 2" && sleep 2 && echo "Step 3" && sleep 2 && echo "Step 4" && sleep 2 && echo "Step 5" && sleep 2 && echo "Done"';

      const startTime = Date.now();

      const executePromise = tool.execute({ cmd: command, timeoutMs: 20000 }, { signal: controller.signal });

      // Abort after 3 seconds (should see Step 1 and Step 2)
      setTimeout(() => {
        controller.abort();
      }, 3000);

      const result = await executePromise;
      const executionTime = Date.now() - startTime;

      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted by user');

      // Should complete around 3 seconds, not 10 seconds
      expect(executionTime).toBeLessThan(4000);
      expect(executionTime).toBeGreaterThan(2900);

      // Should not see "Done" message
      expect(result.result).not.toContain('Done');
    }, 15000);

    it('should abort command that produces continuous output', async () => {
      const tool = new BashTool();
      const controller = new AbortController();

      // Command that produces output with delays — 4 seconds total without abort
      const command =
        'echo "Output 1" && sleep 1 && echo "Output 2" && sleep 1 && echo "Output 3" && sleep 1 && echo "Output 4"';

      const startTime = Date.now();

      const executePromise = tool.execute({ cmd: command, timeoutMs: 20000 }, { signal: controller.signal });

      // Abort after 2.5 seconds — well before the 4-second command finishes
      setTimeout(() => {
        controller.abort();
      }, 2500);

      const result = await executePromise;
      const executionTime = Date.now() - startTime;

      // Core assertion: abort interrupts the command early
      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted by user');
      // Should finish around 2.5s, not 4s
      expect(executionTime).toBeLessThan(3500);
      // Should not reach the final output (which requires all 3 sleeps)
      expect(result.result).not.toContain('Output 4');
    }, 15000);
  });

  describe('Process killing behavior', () => {
    it('should kill process with SIGTERM first, then SIGKILL', async () => {
      const tool = new BashTool();
      const controller = new AbortController();

      // Command that would trap SIGTERM (ignores it)
      const command = 'trap "" TERM; sleep 10';

      const startTime = Date.now();

      const executePromise = tool.execute({ cmd: command, timeoutMs: 20000 }, { signal: controller.signal });

      setTimeout(() => {
        controller.abort();
      }, 1000);

      const result = await executePromise;
      const executionTime = Date.now() - startTime;

      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted by user');

      // Should complete in around 2 seconds (1s wait + 1s for SIGKILL)
      expect(executionTime).toBeGreaterThan(900);
      expect(executionTime).toBeLessThan(2500);
    }, 15000);
  });

  describe('Abort vs Timeout comparison', () => {
    it('should abort faster than timeout', async () => {
      const tool = new BashTool();
      const controller = new AbortController();

      const command = 'sleep 10';

      const startTime = Date.now();

      const executePromise = tool.execute(
        { cmd: command, timeoutMs: 8000 }, // 8 second timeout
        { signal: controller.signal },
      );

      // Abort after 2 seconds
      setTimeout(() => {
        controller.abort();
      }, 2000);

      const result = await executePromise;
      const executionTime = Date.now() - startTime;

      // Should abort at 2 seconds, not wait for 8 second timeout
      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted by user');
      expect(result.result).not.toContain('timeout');
      expect(executionTime).toBeLessThan(3000);
    }, 15000);

    it('should timeout if no abort signal', async () => {
      const tool = new BashTool();

      const command = 'sleep 10';

      const startTime = Date.now();

      const result = await tool.execute(
        { cmd: command, timeoutMs: 2000 }, // 2 second timeout
        { signal: undefined }, // No abort signal
      );

      const executionTime = Date.now() - startTime;

      expect(result.status).toBe('error');
      expect(result.result).toContain('timed out');
      expect(result.result).not.toContain('aborted by user');

      // Should timeout around 2 seconds
      expect(executionTime).toBeGreaterThan(1900);
      expect(executionTime).toBeLessThan(2500);
    }, 15000);
  });
});
