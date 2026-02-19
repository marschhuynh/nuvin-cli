import { describe, it, expect, beforeEach } from 'vitest';
import { CommandHookExecutor } from '../../hooks/command-hook-executor.js';
import { type HookContext, HookEventTypes } from '../../hooks/types.js';

describe('CommandHookExecutor', () => {
  let executor: CommandHookExecutor;

  beforeEach(() => {
    executor = new CommandHookExecutor();
  });

  const createContext = (overrides?: Partial<HookContext>): HookContext => ({
    sessionId: 's1',
    conversationId: 'c1',
    messageId: 'm1',
    hookEvent: HookEventTypes.PreToolUse,
    cwd: process.cwd(),
    ...overrides,
  });

  it('should execute a command and return result', async () => {
    const context = createContext();
    const result = await executor.execute('echo hello', context, 5);

    expect(result.exitCode).toBe(0);
    expect(result.rawOutput?.trim()).toBe('hello');
    expect(result.continue).toBe(true);
  });

  it('should handle command timeout', async () => {
    const context = createContext();
    const result = await executor.execute('sleep 10', context, 1);

    expect(result.exitCode).not.toBe(0);
    expect(result.error).toContain('timed out');
    expect(result.continue).toBe(true); // Timeout should still continue
  });

  it('should parse JSON output with continue flag', async () => {
    const context = createContext();
    const result = await executor.execute('echo \'{"continue": true, "decision": "allow"}\'', context, 5);

    expect(result.continue).toBe(true);
    expect(result.decision).toBe('allow');
  });

  it('should handle continue: false in JSON output', async () => {
    const context = createContext();
    const result = await executor.execute(
      'echo \'{"continue": false, "stopReason": "blocked by policy"}\'',
      context,
      5,
    );

    expect(result.continue).toBe(false);
    expect(result.stopReason).toBe('blocked by policy');
  });

  it('should handle command failure with non-zero exit code', async () => {
    const context = createContext();
    const result = await executor.execute('exit 2', context, 5);

    expect(result.exitCode).toBe(2);
    expect(result.continue).toBe(false); // Exit code 2 means block
  });

  it('should handle exit code 1 and continue', async () => {
    const context = createContext();
    const result = await executor.execute('exit 1', context, 5);

    expect(result.exitCode).toBe(1);
    expect(result.continue).toBe(true); // Exit code 1 continues with error
  });

  it('should set NUVIN_ environment variables', async () => {
    const context = createContext({
      toolName: 'bash_tool',
      sessionId: 'test-session-123',
    });

    const result = await executor.execute('echo $NUVIN_TOOL_NAME-$NUVIN_SESSION_ID', context, 5);

    expect(result.exitCode).toBe(0);
    expect(result.rawOutput?.trim()).toBe('bash_tool-test-session-123');
  });

  it('should track duration', async () => {
    const context = createContext();
    const result = await executor.execute('sleep 0.1', context, 5);

    expect(result.durationMs).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(50); // At least 50ms
  });

  it('should handle invalid JSON as plain text', async () => {
    const context = createContext();
    const result = await executor.execute('echo "not json output"', context, 5);

    expect(result.exitCode).toBe(0);
    expect(result.rawOutput?.trim()).toBe('not json output');
    expect(result.continue).toBe(true);
  });

  it('should parse updatedInput from JSON', async () => {
    const context = createContext();
    const result = await executor.execute(
      'echo \'{"continue": true, "updatedInput": {"cmd": "safe-command"}}\'',
      context,
      5,
    );

    expect(result.continue).toBe(true);
    expect(result.updatedInput).toEqual({ cmd: 'safe-command' });
  });
});
