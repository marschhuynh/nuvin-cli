import { describe, it, expect } from 'vitest';
import { createInMemoryAcpHarness } from '../testUtils/acpHarness.js';

describe('ACP integration', () => {
  it('streams responses and returns stopReason', async () => {
    const result = await createInMemoryAcpHarness().runPrompt('hello');
    expect(result.updates.some((u) => u.update.sessionUpdate === 'agent_message_chunk')).toBe(true);
    expect(result.final.stopReason).toBeDefined();
  });
});
