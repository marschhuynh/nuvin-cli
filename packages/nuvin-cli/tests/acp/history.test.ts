import { describe, it, expect, vi } from 'vitest';
import * as fsp from 'node:fs/promises';
import { loadSessionHistoryUpdates } from '../../source/acp/history.js';

vi.mock('node:fs/promises');

describe('ACP history replay', () => {
  it('replays user and assistant messages as ACP updates', async () => {
    const history = JSON.stringify({
      cli: [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi' },
      ],
    });
    vi.mocked(fsp.readFile).mockResolvedValue(history as never);

    const updates = await loadSessionHistoryUpdates('/tmp/history.cli.json');
    expect(updates).toHaveLength(2);
    expect(updates[0].update.sessionUpdate).toBe('user_message_chunk');
    expect(updates[1].update.sessionUpdate).toBe('agent_message_chunk');
  });
});
