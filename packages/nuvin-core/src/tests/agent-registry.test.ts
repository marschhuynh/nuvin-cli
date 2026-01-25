import { describe, it, expect } from 'vitest';
import { AgentRegistry } from '../agent-registry.js';
import type { AgentTemplate } from '../agent-types.js';

describe('AgentRegistry', () => {
  it('should initialize with empty agent list', () => {
    const registry = new AgentRegistry();
    const agents = registry.list();

    expect(agents.length).toBe(0);
  });

  it('should register a new agent', () => {
    const registry = new AgentRegistry();

    const customAgent: AgentTemplate = {
      name: 'Custom Agent',
      description: 'A custom test agent',
      instructions: 'You are a custom agent',
      allowed_tools: ['file_read'],
    };

    registry.register(customAgent);

    expect(registry.exists('Custom Agent')).toBe(true);
    const retrieved = registry.get('Custom Agent');
    expect(retrieved?.name).toBe('Custom Agent');
    expect(retrieved?.temperature).toBe(0.7);
  });

  it('should unregister an agent', () => {
    const registry = new AgentRegistry();

    const customAgent: AgentTemplate = {
      name: 'Temporary Agent',
      description: 'A temporary agent',
      instructions: 'You are temporary',
      allowed_tools: [],
    };

    registry.register(customAgent);
    expect(registry.exists('Temporary Agent')).toBe(true);

    registry.unregister('Temporary Agent');
    expect(registry.exists('Temporary Agent')).toBe(false);
  });

  it('should list all agents', () => {
    const registry = new AgentRegistry();

    // Initially empty
    expect(Array.isArray(registry.list())).toBe(true);
    expect(registry.list().length).toBe(0);

    // Add some agents
    registry.register({
      name: 'Agent 1',
      instructions: 'Test agent 1',
    });
    registry.register({
      name: 'Agent 2',
      instructions: 'Test agent 2',
    });

    const agents = registry.list();
    expect(agents.length).toBe(2);
    const names = agents.map((a) => a.name);
    expect(names).toContain('Agent 1');
    expect(names).toContain('Agent 2');
  });

  it('should return undefined for non-existent agent', () => {
    const registry = new AgentRegistry();
    const agent = registry.get('non-existent');

    expect(agent).toBeUndefined();
  });

  it('should validate agent templates', () => {
    const registry = new AgentRegistry();

    const invalidAgent = {
      id: 'invalid',
    } as unknown as AgentTemplate;

    expect(() => registry.register(invalidAgent)).toThrow(/instructions/);
  });

  it('should get agent with all properties', () => {
    const registry = new AgentRegistry();

    // Register an agent
    registry.register({
      name: 'Test Agent',
      description: 'A test agent',
      instructions: 'You are a test agent',
      allowed_tools: ['file_read', 'web_search'],
    });

    const agent = registry.get('Test Agent');

    expect(agent).toBeDefined();
    expect(agent?.name).toBe('Test Agent');
    expect(agent?.description).toBe('A test agent');
    expect(agent?.instructions).toBe('You are a test agent');
    expect(Array.isArray(agent?.allowed_tools)).toBe(true);
    expect(agent?.allowed_tools).toEqual(['file_read', 'web_search']);
  });
});
