import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultSpecialistAgentFactory } from '../delegation/agent-factory.js';
import { InMemoryMemory } from '../persistent/memory.js';
import type { AgentTemplate, AssignParams } from '../agent-types.js';
import type { Message, MemoryPort } from '../ports.js';

describe('Session Resumption', () => {
  let factory: DefaultSpecialistAgentFactory;
  let memory: InMemoryMemory<Message>;
  let createMemoryForAgent: (agentKey: string) => MemoryPort<Message>;

  const template: AgentTemplate = {
    name: 'code-investigator',
    description: 'Investigates code',
    instructions: 'You are an investigator.',
    allowed_tools: ['file_read', 'grep_tool'],
  };

  beforeEach(async () => {
    memory = new InMemoryMemory<Message>();

    // Seed previous session data directly in memory
    await memory.set('prev-session-123', [
      { id: '1', role: 'user', content: 'Find all API endpoints', timestamp: new Date().toISOString() },
      { id: '2', role: 'assistant', content: 'Found 5 endpoints in src/api/', timestamp: new Date().toISOString() },
    ]);

    // Create memory factory that returns memory with agentKey as conversation ID
    createMemoryForAgent = (agentKey: string) => {
      return {
        get: async (_conversationId: string) => memory.get(agentKey),
        set: async (_conversationId: string, messages: Message[]) => memory.set(agentKey, messages),
        append: async (_conversationId: string, messages: Message[]) => memory.append(agentKey, messages),
        delete: async (_conversationId: string) => memory.delete(agentKey),
        keys: async () => memory.keys(),
        clear: async () => memory.clear(),
        exportSnapshot: async () => memory.exportSnapshot(),
        importSnapshot: async (snapshot: Record<string, Message[]>) => memory.importSnapshot(snapshot),
      };
    };

    factory = new DefaultSpecialistAgentFactory({
      idGenerator: (base) => `${base}-new-id`,
      createMemoryForAgent,
    });
  });

  it('should load previous messages when resuming', async () => {
    const params: AssignParams = {
      agent: 'code-investigator',
      task: 'Now check security of those endpoints',
      resume: 'prev-session-123',
    };

    const config = await factory.create({ template, params, context: undefined, currentDepth: 0 });

    expect(config.previousMessages).toBeDefined();
    expect(config.previousMessages).toHaveLength(2);
    expect(config.previousMessages?.[0].content).toBe('Find all API endpoints');
    expect(config.previousMessages?.[1].content).toBe('Found 5 endpoints in src/api/');
  });

  it('should reuse session ID when resuming', async () => {
    const params: AssignParams = {
      agent: 'code-investigator',
      task: 'Continue analysis',
      resume: 'prev-session-123',
    };

    const config = await factory.create({ template, params, context: undefined, currentDepth: 0 });

    expect(config.agentId).toBe('prev-session-123');
  });

  it('should generate new session ID when resume session not found', async () => {
    const params: AssignParams = {
      agent: 'code-investigator',
      task: 'Continue analysis',
      resume: 'non-existent-session',
    };

    const config = await factory.create({ template, params, context: undefined, currentDepth: 0 });

    expect(config.agentId).toBe('code-investigator-new-id');
    expect(config.previousMessages).toBeUndefined();
  });

  it('should start fresh session when not resuming', async () => {
    const params: AssignParams = {
      agent: 'code-investigator',
      task: 'Analyze code',
    };

    const config = await factory.create({ template, params, context: undefined, currentDepth: 0 });

    expect(config.agentId).toBe('code-investigator-new-id');
    expect(config.previousMessages).toBeUndefined();
  });

  it('should include agentType for storage key', async () => {
    const params: AssignParams = {
      agent: 'code-investigator',
      task: 'Analyze code',
    };

    const config = await factory.create({ template, params, context: undefined, currentDepth: 0 });

    expect(config.agentType).toBe('code-investigator');
  });
});
