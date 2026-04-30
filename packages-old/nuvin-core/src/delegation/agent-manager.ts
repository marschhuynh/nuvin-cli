import { SimpleId } from '../id.js';

export interface AgentSession {
  id: string;
  agentType: string;
  parentConversationId: string;
  state: 'pending' | 'running' | 'completed' | 'failed';
  taskDescription: string;
  startTime: number;
  endTime?: number;
  result?: string;
  error?: string;
  metrics?: {
    tokensUsed?: number;
    toolCallsExecuted?: number;
    executionTimeMs?: number;
  };
}

export interface AgentStateManager {
  create(agentType: string, parentConvoId: string, taskDescription: string): string;
  get(sessionId: string): AgentSession | undefined;
  update(sessionId: string, updates: Partial<AgentSession>): void;
  getRunning(): AgentSession[];
  getByParent(parentConvoId: string): AgentSession[];
  getAllSessions(): AgentSession[];
  cleanup(maxAgeMs: number): number;
}

export class DefaultAgentStateManager implements AgentStateManager {
  private sessions = new Map<string, AgentSession>();
  private idGenerator = new SimpleId();

  create(agentType: string, parentConvoId: string, taskDescription: string): string {
    const id = this.idGenerator.uuid();
    const session: AgentSession = {
      id,
      agentType,
      parentConversationId: parentConvoId,
      state: 'pending',
      taskDescription,
      startTime: Date.now(),
    };
    this.sessions.set(id, session);
    return id;
  }

  get(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  update(sessionId: string, updates: Partial<AgentSession>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
    }
  }

  getRunning(): AgentSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.state === 'running');
  }

  getByParent(parentConvoId: string): AgentSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.parentConversationId === parentConvoId);
  }

  getAllSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  cleanup(maxAgeMs: number): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.state !== 'running' && now - session.startTime > maxAgeMs) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
