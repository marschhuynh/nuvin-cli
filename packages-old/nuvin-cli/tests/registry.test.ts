import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../source/modules/commands/registry.js';
import type { CommandDefinition, CommandContext } from '../source/modules/commands/types.js';

const createMockConfigFunctions = () => ({
  get: (_key: string) => undefined,
  set: (_key: string, _value: unknown) => {},
  has: (_key: string) => false,
  delete: (_key: string) => false,
});

describe('CommandRegistry', () => {
  it('register adds command to registry', () => {
    const registry = new CommandRegistry();
    const mockCommand: CommandDefinition = {
      id: '/test',
      type: 'function',
      description: 'Test command',
      handler: async () => {},
    };

    registry.register(mockCommand);

    const retrieved = registry.get('/test');
    expect(retrieved).toBe(mockCommand);
  });

  it('register calls initialize hook if present', () => {
    const registry = new CommandRegistry();
    registry.setConfigFunctions(createMockConfigFunctions());

    let initializeCalled = false;
    let receivedContext: CommandContext | undefined;

    const mockCommand: CommandDefinition = {
      id: '/test',
      type: 'function',
      description: 'Test command',
      handler: async () => {},
      initialize: (context) => {
        initializeCalled = true;
        receivedContext = context;
      },
    };

    registry.register(mockCommand);

    expect(initializeCalled).toBe(true);
    expect(receivedContext).toBeTruthy();
    expect(receivedContext?.rawInput).toBe('/test');
  });

  it('get returns undefined for non-existent command', () => {
    const registry = new CommandRegistry();

    const result = registry.get('/non-existent');

    expect(result).toBeUndefined();
  });

  it('list returns all visible commands', () => {
    const registry = new CommandRegistry();
    registry.setConfigFunctions(createMockConfigFunctions());

    const command1: CommandDefinition = {
      id: '/test1',
      type: 'function',
      description: 'Test command 1',
      handler: async () => {},
    };

    const command2: CommandDefinition = {
      id: '/test2',
      type: 'function',
      description: 'Test command 2',
      handler: async () => {},
    };

    registry.register(command1);
    registry.register(command2);

    const commands = registry.list();

    expect(commands.length).toBe(2);
    expect(commands.some((cmd) => cmd.id === '/test1')).toBe(true);
    expect(commands.some((cmd) => cmd.id === '/test2')).toBe(true);
  });

  it('execute runs function command handler', async () => {
    const registry = new CommandRegistry();
    registry.setConfigFunctions(createMockConfigFunctions());

    let handlerCalled = false;

    const mockCommand: CommandDefinition = {
      id: '/test',
      type: 'function',
      description: 'Test command',
      handler: async () => {
        handlerCalled = true;
      },
    };

    registry.register(mockCommand);

    const result = await registry.execute('/test');

    expect(result.success).toBe(true);
    expect(result.commandId).toBe('/test');
    expect(handlerCalled).toBe(true);
  });

  it('execute returns error for unknown command', async () => {
    const registry = new CommandRegistry();
    registry.setConfigFunctions(createMockConfigFunctions());

    const result = await registry.execute('/unknown');

    expect(result.success).toBe(false);
    expect(result.commandId).toBe('/unknown');
    expect(result.error).toBeTruthy();
  });
});
