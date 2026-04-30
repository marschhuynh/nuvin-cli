import { describe, it, expect, beforeEach } from 'vitest';
import { CompositeHookPort } from '../../hooks/composite-hook-port.js';
import { HookRegistry } from '../../hooks/hook-registry.js';
import { HookContext, HookEventTypes } from '../../hooks/types.js';

describe('CompositeHookPort', () => {
  let registry: HookRegistry;
  let port: CompositeHookPort;

  beforeEach(() => {
    registry = new HookRegistry();
    port = new CompositeHookPort(registry);
  });

  const createContext = (overrides?: Partial<HookContext>): HookContext => ({
    sessionId: 's1',
    conversationId: 'c1',
    messageId: 'm1',
    hookEvent: HookEventTypes.PreToolUse,
    cwd: process.cwd(),
    toolName: 'bash_tool',
    ...overrides,
  });

  it('should return continue:true when no hooks registered', async () => {
    const context = createContext();
    const result = await port.executeHook(context);
    
    expect(result.continue).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('should execute matching command hooks', async () => {
    registry.register('test-agent', {
      pre_tool_use: {
        hooks: [
          { matcher: 'bash_tool', command: { command: 'echo "hook ran"' } },
        ],
      },
    });

    const context = createContext();
    const result = await port.executeHook(context);
    
    expect(result.continue).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.rawOutput?.trim()).toBe('hook ran');
  });

  it('should not execute hooks that do not match', async () => {
    registry.register('test-agent', {
      pre_tool_use: {
        hooks: [
          { matcher: 'file_read', command: { command: 'echo "should not run"' } },
        ],
      },
    });

    const context = createContext({ toolName: 'bash_tool' });
    const result = await port.executeHook(context);
    
    expect(result.continue).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.rawOutput).toBeUndefined();
  });

  it('should execute multiple matching hooks in sequence', async () => {
    // Create a temp file to track execution order
    const trackFile = `/tmp/hook-test-${Date.now()}.txt`;
    
    registry.register('test-agent', {
      pre_tool_use: {
        hooks: [
          { command: { command: `echo "first" >> ${trackFile}` } },
          { command: { command: `echo "second" >> ${trackFile}` } },
        ],
      },
    });

    const context = createContext();
    const result = await port.executeHook(context);
    
    expect(result.continue).toBe(true);
    
    // Clean up
    const fs = await import('fs/promises');
    const content = await fs.readFile(trackFile, 'utf-8');
    await fs.unlink(trackFile);
    
    expect(content).toContain('first');
    expect(content).toContain('second');
  });

  it('should stop execution when a hook returns continue:false', async () => {
    const trackFile = `/tmp/hook-test-stop-${Date.now()}.txt`;
    
    registry.register('test-agent', {
      pre_tool_use: {
        hooks: [
          { command: { command: `echo "first" >> ${trackFile} && exit 2` } }, // exit 2 = stop
          { command: { command: `echo "second" >> ${trackFile}` } },
        ],
      },
    });

    const context = createContext();
    const result = await port.executeHook(context);
    
    expect(result.continue).toBe(false);
    
    // Second hook should not have run
    const fs = await import('fs/promises');
    const content = await fs.readFile(trackFile, 'utf-8');
    await fs.unlink(trackFile);
    
    expect(content).toContain('first');
    expect(content).not.toContain('second');
  });

  it('should check hasHooks correctly', () => {
    expect(port.hasHooks(HookEventTypes.PreToolUse)).toBe(false);
    
    registry.register('test-agent', {
      pre_tool_use: {
        hooks: [{ command: { command: 'echo test' } }],
      },
    });
    
    expect(port.hasHooks(HookEventTypes.PreToolUse)).toBe(true);
    expect(port.hasHooks(HookEventTypes.PostToolUse)).toBe(false);
  });

  it('should check hasHooks with matcher', () => {
    registry.register('test-agent', {
      pre_tool_use: {
        hooks: [{ matcher: 'bash_tool', command: { command: 'echo test' } }],
      },
    });
    
    expect(port.hasHooks(HookEventTypes.PreToolUse, 'bash_tool')).toBe(true);
    expect(port.hasHooks(HookEventTypes.PreToolUse, 'file_read')).toBe(false);
  });

  it('should merge updatedInput from hooks', async () => {
    registry.register('test-agent', {
      pre_tool_use: {
        hooks: [
          { command: { command: 'echo \'{"continue": true, "updatedInput": {"cmd": "safe"}}\'' } },
        ],
      },
    });

    const context = createContext();
    const result = await port.executeHook(context);
    
    expect(result.updatedInput).toEqual({ cmd: 'safe' });
  });

  it('should skip disabled hooks', async () => {
    registry.register('test-agent', {
      pre_tool_use: {
        hooks: [
          { command: { command: 'echo "disabled"' }, enabled: false },
          { command: { command: 'echo "enabled"' } },
        ],
      },
    });

    const context = createContext();
    const result = await port.executeHook(context);
    
    expect(result.rawOutput?.trim()).toBe('enabled');
  });
});
