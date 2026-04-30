import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message } from '@nuvin/nuvin-core';
import * as fsp from 'node:fs/promises';
import { loadHistoryFromFile } from '../source/hooks/useSessionManagement.js';

vi.mock('node:fs/promises');

const mockMessages: Message[] = [
  { id: 'msg-1a', role: 'user', content: 'Hello' },
  { id: 'msg-2a', role: 'assistant', content: 'Hi there' },
];

describe('loadHistoryFromFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads history from /export format', async () => {
    const payload = JSON.stringify({ cli: mockMessages });
    vi.mocked(fsp.readFile).mockResolvedValue(payload as never);

    const result = await loadHistoryFromFile('/tmp/history.json');

    expect(result.kind).toBe('messages');
    if (result.kind === 'messages') {
      expect(result.cliMessages).toEqual(mockMessages);
      expect(result.count).toBe(2);
    }
  });
});
