// packages/nuvin-acp/source/session-manager.ts
import * as crypto from 'node:crypto';
import type { SessionId, McpServerStdio } from './protocol/types.js';

export type Session = {
  id: SessionId;
  cwd: string;
  mcpServers: McpServerStdio[];
  createdAt: Date;
  abortController: AbortController;
};

export type CreateSessionParams = {
  cwd: string;
  mcpServers?: McpServerStdio[];
};

export class SessionManager {
  private sessions = new Map<SessionId, Session>();

  create(params: CreateSessionParams): Session {
    const id = `sess_${crypto.randomUUID()}`;

    const session: Session = {
      id,
      cwd: params.cwd,
      mcpServers: params.mcpServers ?? [],
      createdAt: new Date(),
      abortController: new AbortController(),
    };

    this.sessions.set(id, session);
    return session;
  }

  get(id: SessionId): Session | undefined {
    return this.sessions.get(id);
  }

  delete(id: SessionId): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.abortController.abort();
      this.sessions.delete(id);
      return true;
    }
    return false;
  }

  cancel(id: SessionId): void {
    const session = this.sessions.get(id);
    if (session) {
      session.abortController.abort();
      session.abortController = new AbortController();
    }
  }
}
