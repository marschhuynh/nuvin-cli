// packages/nuvin-acp/tests/session-manager.test.ts
import { describe, it, expect } from 'vitest';
import { SessionManager } from '../source/session-manager.js';

describe('SessionManager', () => {
  it('should create a session with unique ID', () => {
    const manager = new SessionManager();

    const session = manager.create({ cwd: '/tmp/test' });

    expect(session.id).toBeDefined();
    expect(session.cwd).toBe('/tmp/test');
  });

  it('should retrieve session by ID', () => {
    const manager = new SessionManager();
    const session = manager.create({ cwd: '/tmp/test' });

    const retrieved = manager.get(session.id);

    expect(retrieved).toBe(session);
  });

  it('should return undefined for unknown session', () => {
    const manager = new SessionManager();

    expect(manager.get('unknown')).toBeUndefined();
  });
});
