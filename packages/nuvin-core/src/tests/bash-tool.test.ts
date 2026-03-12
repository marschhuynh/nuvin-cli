import { describe, it, expect } from 'vitest';
import { BashTool } from '../tools/BashTool.js';

describe('BashTool', () => {
  const tool = new BashTool();

  describe('basic execution', () => {
    it('should execute simple commands', async () => {
      const result = await tool.execute({ cmd: 'echo "hello world"' });
      expect(result.status).toBe('success');
      expect(result.result).toContain('hello world');
    });

    it('should return error on non-zero exit code', async () => {
      const result = await tool.execute({ cmd: 'exit 1' });
      expect(result.status).toBe('error');
      expect(result.metadata?.code).toBe(1);
    });

    it('should handle stderr output', async () => {
      const result = await tool.execute({ cmd: 'echo "error" >&2; exit 1' });
      expect(result.status).toBe('error');
      expect(result.result).toContain('error');
    });
  });

  describe('working directory', () => {
    it('should respect cwd parameter', async () => {
      const result = await tool.execute({ cmd: 'pwd', cwd: '/tmp' });
      expect(result.status).toBe('success');
      expect(result.result).toContain('/tmp');
    });
  });

  describe('timeout', () => {
    it('should timeout long-running commands', async () => {
      const result = await tool.execute({ cmd: 'sleep 10', timeoutMs: 100 });
      expect(result.status).toBe('error');
      expect(result.result).toContain('timed out');
    }, 1000);

    it('should not timeout quick commands', async () => {
      const result = await tool.execute({ cmd: 'echo "fast"', timeoutMs: 5000 });
      expect(result.status).toBe('success');
      expect(result.result).toContain('fast');
    });
  });

  describe('output handling', () => {
    it('should capture stdout', async () => {
      const result = await tool.execute({ cmd: 'echo "line1"; echo "line2"' });
      expect(result.status).toBe('success');
      expect(result.result).toContain('line1');
      expect(result.result).toContain('line2');
    });

    it('should combine stdout and stderr', async () => {
      const result = await tool.execute({ cmd: 'echo "out"; echo "err" >&2' });
      expect(result.status).toBe('success');
      expect(result.result).toContain('out');
      expect(result.result).toContain('err');
    });

    it('should strip ANSI codes', async () => {
      const result = await tool.execute({ cmd: 'echo -e "\\033[31mred\\033[0m"' });
      expect(result.status).toBe('success');
      expect(result.result).toContain('red');
      expect(result.result).not.toMatch(/\033\[[0-9;]*m/);
    });
  });

  describe('command variants', () => {
    it('should handle pipes', async () => {
      const result = await tool.execute({ cmd: 'echo "hello" | grep "hello"' });
      expect(result.status).toBe('success');
      expect(result.result).toContain('hello');
    });

    it('should handle command substitution', async () => {
      const result = await tool.execute({ cmd: 'echo "Date: $(date +%Y)"' });
      expect(result.status).toBe('success');
      expect(result.result).toContain('Date:');
    });

    it('should handle multiline commands', async () => {
      const result = await tool.execute({
        cmd: 'echo "line1"\necho "line2"',
      });
      expect(result.status).toBe('success');
      expect(result.result).toContain('line1');
      expect(result.result).toContain('line2');
    });
  });

  describe('error handling', () => {
    it('should handle command not found', async () => {
      const result = await tool.execute({ cmd: 'nonexistentcommand12345' });
      expect(result.status).toBe('error');
    });

    it('should handle syntax errors', async () => {
      const result = await tool.execute({ cmd: 'false' });
      expect(result.status).toBe('error');
    });
  });

  describe('metadata', () => {
    it('should include exit code in metadata', async () => {
      const result = await tool.execute({ cmd: 'exit 42' });
      expect(result.metadata?.code).toBe(42);
    });

    it('should include cwd in metadata', async () => {
      const result = await tool.execute({ cmd: 'echo "test"', cwd: '/tmp' });
      expect(result.metadata?.cwd).toBe('/tmp');
    });
  });

  describe('output truncation', () => {
    it('should truncate large stdout with system-reminder', async () => {
      // Generate ~25KB: 300 lines × 100 chars ≈ 30KB, well above 20KB limit
      // Note: truncation kills the process so exit code may be non-zero
      const result = await tool.execute({ cmd: 'python3 -c "print(\'x\' * 100 + \'\\n\', end=\'\') ; [print(\'-\' * 100) for _ in range(300)]"' });
      expect(result.result).toContain('<system-reminder>');
      expect(result.result).toContain('Command output was truncated');
      expect(result.result).toContain('Use more specific commands');
      expect(result.metadata?.truncated).toBe(true);
    });

    it('should not truncate small output', async () => {
      const result = await tool.execute({ cmd: 'echo "small output"' });
      expect(result.status).toBe('success');
      expect(result.result).not.toContain('<system-reminder>');
      expect(result.metadata?.truncated).toBe(false);
    });

    it('should include system-reminder when truncated output causes non-zero exit', async () => {
      // Generate large output then exit non-zero — truncation overrides failure status
      const result = await tool.execute({ cmd: 'python3 -c "import sys; [print(\'-\' * 100) for _ in range(300)]; sys.exit(1)"' });
      expect(result.status).toBe('success');
      expect(result.result).toContain('<system-reminder>');
      expect(result.result).toContain('Command output was truncated');
    });
  });
});
