import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultAgentStateManager } from '../delegation/agent-manager.js';

describe('AgentStateManager', () => {
  let manager: DefaultAgentStateManager;

  beforeEach(() => {
    manager = new DefaultAgentStateManager();
  });

  it('should create a session with pending state', () => {
    const id = manager.create('code-investigator', 'cli', 'Analyze auth');
    const session = manager.get(id);

    expect(session).toBeDefined();
    expect(session?.state).toBe('pending');
    expect(session?.agentType).toBe('code-investigator');
    expect(session?.parentConversationId).toBe('cli');
    expect(session?.taskDescription).toBe('Analyze auth');
  });

  it('should update session state', () => {
    const id = manager.create('test-agent', 'cli', 'Test task');
    manager.update(id, { state: 'running' });

    expect(manager.get(id)?.state).toBe('running');
  });

  it('should update session with result and metrics', () => {
    const id = manager.create('test-agent', 'cli', 'Test task');
    manager.update(id, {
      state: 'completed',
      endTime: Date.now(),
      result: 'Found 5 issues',
      metrics: {
        tokensUsed: 1000,
        toolCallsExecuted: 3,
        executionTimeMs: 5000,
      },
    });

    const session = manager.get(id);
    expect(session?.state).toBe('completed');
    expect(session?.result).toBe('Found 5 issues');
    expect(session?.metrics?.tokensUsed).toBe(1000);
  });

  it('should return running sessions', () => {
    const id1 = manager.create('agent1', 'cli', 'Task 1');
    const id2 = manager.create('agent2', 'cli', 'Task 2');
    const id3 = manager.create('agent3', 'cli', 'Task 3');

    manager.update(id1, { state: 'running' });
    manager.update(id2, { state: 'completed' });
    manager.update(id3, { state: 'running' });

    const running = manager.getRunning();
    expect(running).toHaveLength(2);
    expect(running.map((s) => s.id)).toContain(id1);
    expect(running.map((s) => s.id)).toContain(id3);
  });

  it('should return sessions by parent', () => {
    const id1 = manager.create('agent1', 'cli', 'Task 1');
    const id2 = manager.create('agent2', 'other-parent', 'Task 2');
    const id3 = manager.create('agent3', 'cli', 'Task 3');

    const cliSessions = manager.getByParent('cli');
    expect(cliSessions).toHaveLength(2);
    expect(cliSessions.map((s) => s.id)).toContain(id1);
    expect(cliSessions.map((s) => s.id)).toContain(id3);
  });

  it('should return all sessions', () => {
    manager.create('agent1', 'cli', 'Task 1');
    manager.create('agent2', 'cli', 'Task 2');
    manager.create('agent3', 'cli', 'Task 3');

    const all = manager.getAllSessions();
    expect(all).toHaveLength(3);
  });

  it('should cleanup old sessions', () => {
    const id = manager.create('agent', 'cli', 'Task');
    manager.update(id, { state: 'completed' });

    const session = manager.get(id)!;
    session.startTime = Date.now() - 100000;

    const removed = manager.cleanup(50000);
    expect(removed).toBe(1);
    expect(manager.get(id)).toBeUndefined();
  });

  it('should not cleanup running sessions', () => {
    const id = manager.create('agent', 'cli', 'Task');
    manager.update(id, { state: 'running' });

    const session = manager.get(id)!;
    session.startTime = Date.now() - 100000;

    const removed = manager.cleanup(50000);
    expect(removed).toBe(0);
    expect(manager.get(id)).toBeDefined();
  });

  it('should not cleanup sessions within maxAge', () => {
    const id = manager.create('agent', 'cli', 'Task');
    manager.update(id, { state: 'completed' });

    const removed = manager.cleanup(50000);
    expect(removed).toBe(0);
    expect(manager.get(id)).toBeDefined();
  });

  it('should handle update on non-existent session', () => {
    manager.update('non-existent', { state: 'running' });
    expect(manager.get('non-existent')).toBeUndefined();
  });
});
