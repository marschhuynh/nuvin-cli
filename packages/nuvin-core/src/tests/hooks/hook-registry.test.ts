import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry } from '../../hooks/hook-registry.js';
import { HookEventTypes, type HooksConfig } from '../../hooks/types.js';

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  it('should register hooks from a source', () => {
    const config: HooksConfig = {
      pre_tool_use: {
        hooks: [{ matcher: 'Bash', command: { command: './check.sh' } }],
      },
    };
    registry.register('test-agent', config);
    expect(registry.getHooksForEvent(HookEventTypes.PreToolUse)).toHaveLength(1);
  });

  it('should match hooks by tool name pattern', () => {
    const config: HooksConfig = {
      pre_tool_use: {
        hooks: [
          { matcher: 'Write|Edit', command: { command: './lint.sh' } },
          { matcher: 'Bash', command: { command: './check.sh' } },
        ],
      },
    };
    registry.register('test', config);

    const matching = registry.getMatchingHooks(HookEventTypes.PreToolUse, 'Write');
    expect(matching).toHaveLength(1);
    expect(matching[0].matcher).toBe('Write|Edit');
  });

  it('should match all hooks when no matcher specified', () => {
    const config: HooksConfig = {
      post_tool_use: {
        hooks: [
          { command: { command: './audit.sh' } }, // No matcher
        ],
      },
    };
    registry.register('test', config);

    const matching = registry.getMatchingHooks(HookEventTypes.PostToolUse, 'AnyTool');
    expect(matching).toHaveLength(1);
  });

  it('should return empty array for no matching hooks', () => {
    const config: HooksConfig = {
      pre_tool_use: {
        hooks: [{ matcher: 'Read', command: { command: './check.sh' } }],
      },
    };
    registry.register('test', config);

    const matching = registry.getMatchingHooks(HookEventTypes.PreToolUse, 'Bash');
    expect(matching).toHaveLength(0);
  });

  it('should unregister hooks by source', () => {
    const config: HooksConfig = {
      pre_tool_use: { hooks: [{ command: { command: './check.sh' } }] },
    };
    registry.register('test', config);
    expect(registry.getHooksForEvent(HookEventTypes.PreToolUse)).toHaveLength(1);

    registry.unregister('test');
    expect(registry.getHooksForEvent(HookEventTypes.PreToolUse)).toHaveLength(0);
  });

  it('should merge hooks from multiple sources', () => {
    registry.register('source1', {
      pre_tool_use: { hooks: [{ matcher: 'Bash', command: { command: './check1.sh' } }] },
    });
    registry.register('source2', {
      pre_tool_use: { hooks: [{ matcher: 'Write', command: { command: './check2.sh' } }] },
    });

    const all = registry.getHooksForEvent(HookEventTypes.PreToolUse);
    expect(all).toHaveLength(2);
  });

  it('should check if hooks exist for event', () => {
    expect(registry.hasHooks(HookEventTypes.PreToolUse)).toBe(false);

    registry.register('test', {
      pre_tool_use: { hooks: [{ command: { command: './check.sh' } }] },
    });

    expect(registry.hasHooks(HookEventTypes.PreToolUse)).toBe(true);
    expect(registry.hasHooks(HookEventTypes.PostToolUse)).toBe(false);
  });

  it('should check if hooks exist for event with matcher', () => {
    registry.register('test', {
      pre_tool_use: { hooks: [{ matcher: 'Bash', command: { command: './check.sh' } }] },
    });

    expect(registry.hasHooks(HookEventTypes.PreToolUse, 'Bash')).toBe(true);
    expect(registry.hasHooks(HookEventTypes.PreToolUse, 'Write')).toBe(false);
  });

  it('should clear all registered hooks', () => {
    registry.register('source1', {
      pre_tool_use: { hooks: [{ command: { command: './check1.sh' } }] },
    });
    registry.register('source2', {
      post_tool_use: { hooks: [{ command: { command: './check2.sh' } }] },
    });

    registry.clear();

    expect(registry.getHooksForEvent(HookEventTypes.PreToolUse)).toHaveLength(0);
    expect(registry.getHooksForEvent(HookEventTypes.PostToolUse)).toHaveLength(0);
  });
});
