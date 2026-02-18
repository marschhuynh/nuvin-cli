import { describe, it, expect, vi } from 'vitest';
import { startAcpServer } from '../../source/acp/start.js';

const mockStdin = { on: vi.fn() } as unknown as NodeJS.ReadableStream;
const mockStdout = { write: vi.fn() } as unknown as NodeJS.WritableStream;

const deps = { stdin: mockStdin, stdout: mockStdout, stderr: { write: vi.fn() } as unknown as NodeJS.WritableStream };

describe('ACP start', () => {
  it('creates an ACP server and starts reading stdin', async () => {
    await startAcpServer(deps);
    expect(mockStdin.on).toHaveBeenCalled();
  });
});
