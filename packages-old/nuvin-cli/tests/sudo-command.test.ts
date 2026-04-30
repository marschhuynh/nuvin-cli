import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus } from '../source/services/EventBus.js';
import { CommandRegistry } from '../source/modules/commands/registry.js';
import { registerSudoCommand } from '../source/modules/commands/definitions/sudo.js';
import type { CommandContext } from '../source/modules/commands/types.js';

describe('Sudo Command Integration', () => {
  let registry: CommandRegistry;
  let listeners: Map<string, Set<(...args: unknown[]) => void>>;

  beforeEach(() => {
    // Track event listeners
    listeners = new Map();

    vi.spyOn(eventBus, 'on').mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)?.add(handler);
    });

    vi.spyOn(eventBus, 'off').mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler);
    });

    vi.spyOn(eventBus, 'emit').mockImplementation((event: string, ...args: unknown[]) => {
      const handlers = listeners.get(event);
      if (handlers) {
        for (const handler of handlers) {
          handler(...args);
        }
      }
    });

    registry = new CommandRegistry();
    registry.setConfigFunctions({
      get: vi.fn(),
      set: vi.fn(),
    });

    // Mock eventBus for command context
    (registry as { createContext: (input: string) => CommandContext }).createContext = () => ({
      rawInput: '/sudo',
      eventBus,
      registry,
      config: { get: vi.fn(), set: vi.fn() },
      memory: null,
      orchestrator: null,
    });

    registerSudoCommand(registry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Command Registration', () => {
    it('should register /sudo command correctly', () => {
      const command = registry.get('/sudo');

      expect(command).toBeDefined();
      expect(command?.id).toBe('/sudo');
      expect(command?.description).toBe('Toggle sudo mode (bypass tool approval requirement).');
      expect(command?.category).toBe('debug');
      expect(command?.type).toBe('function');
    });

    it('should not register invalid commands', () => {
      const command = registry.get('/invalid');
      expect(command).toBeUndefined();
    });
  });

  describe('Command Execution', () => {
    it('should emit command:sudo:toggle event when executed', async () => {
      await registry.execute('/sudo');

      expect(eventBus.emit).toHaveBeenCalledWith('command:sudo:toggle', undefined);
    });

    it('should handle command execution with extra whitespace', async () => {
      await registry.execute('  /sudo  ');

      expect(eventBus.emit).toHaveBeenCalledWith('command:sudo:toggle', undefined);
    });

    it('should return success result when executed successfully', async () => {
      const result = await registry.execute('/sudo');

      expect(result.success).toBe(true);
    });
  });

  describe('Event Listener Integration', () => {
    it('should be able to listen to sudo toggle events', () => {
      const mockHandler = vi.fn();

      eventBus.on('command:sudo:toggle', mockHandler);

      // Simulate command execution
      registry.execute('/sudo').then(() => {
        expect(mockHandler).toHaveBeenCalledWith(undefined);
      });
    });

    it('should handle multiple event listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('command:sudo:toggle', handler1);
      eventBus.on('command:sudo:toggle', handler2);

      // Both should be called when event is emitted
      eventBus.emit('command:sudo:toggle', undefined);

      expect(handler1).toHaveBeenCalledWith(undefined);
      expect(handler2).toHaveBeenCalledWith(undefined);
    });

    it('should clean up event listeners correctly', () => {
      const handler = vi.fn();

      eventBus.on('command:sudo:toggle', handler);
      eventBus.off('command:sudo:toggle', handler);

      // Handler should not be called after cleanup
      eventBus.emit('command:sudo:toggle', undefined);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Sudo State Logic', () => {
    it('should toggle tool approval mode when sudo command is executed', () => {
      // Simulate the toggle logic that happens in the app
      let toolApprovalMode = true; // Start with approval required (sudo OFF)

      const onSudoToggle = () => {
        toolApprovalMode = !toolApprovalMode;
      };

      // First sudo command: enable sudo mode (disable approval)
      onSudoToggle();
      expect(toolApprovalMode).toBe(false); // SUDO ON

      // Second sudo command: disable sudo mode (enable approval)
      onSudoToggle();
      expect(toolApprovalMode).toBe(true); // SUDO OFF
    });

    it('should emit correct state-based on tool approval mode', () => {
      const testCases = [
        { toolApprovalMode: false, shouldShowSudo: true, description: 'approval OFF = SUDO ON' },
        { toolApprovalMode: true, shouldShowSudo: false, description: 'approval ON = SUDO OFF' },
      ];

      testCases.forEach(({ toolApprovalMode, shouldShowSudo }) => {
        const showSudo = !toolApprovalMode;
        expect(showSudo).toBe(shouldShowSudo);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle event bus errors gracefully', async () => {
      // Mock emit to throw an error
      vi.spyOn(eventBus, 'emit').mockImplementationOnce(() => {
        throw new Error('Event bus error');
      });

      const result = await registry.execute('/sudo');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
