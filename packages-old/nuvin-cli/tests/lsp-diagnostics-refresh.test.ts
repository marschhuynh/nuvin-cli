import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { LSP } from '../source/services/lsp/index.js';
import { createClient } from '../source/services/lsp/client.js';

const mockEventBus = vi.hoisted(() => ({ emit: vi.fn() }));

const mockedServer = vi.hoisted(() => ({
  id: 'ts',
  name: 'TypeScript',
  extensions: ['.ts'],
  root: vi.fn(async () => '/repo'),
  spawn: vi.fn(async () => ({})),
}));

vi.mock('../source/services/EventBus.js', () => ({ eventBus: mockEventBus }));

vi.mock('../source/services/lsp/server.js', () => ({
  BUILTIN_SERVERS: [mockedServer],
  getServerForFile: vi.fn(() => mockedServer),
  getServersForFile: vi.fn(() => [mockedServer]),
}));

vi.mock('../source/services/lsp/client.js', () => ({
  createClient: vi.fn(),
}));

describe('LSP diagnostics refresh', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await LSP.shutdown();
    await LSP.init();
  });

  afterEach(async () => {
    await LSP.shutdown();
  });

  it('refreshes diagnostics by sending change notification', async () => {
    const diagnostics = new Map<string, Diagnostic[]>([['/repo/file.ts', []]]);
    const notify = {
      open: vi.fn(async () => undefined),
      change: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const client = {
      serverID: 'ts',
      root: '/repo',
      connection: {} as never,
      diagnostics,
      capabilities: {},
      notify,
      request: {
        definition: vi.fn(async () => []),
        references: vi.fn(async () => []),
        hover: vi.fn(async () => null),
        documentSymbol: vi.fn(async () => []),
        workspaceSymbol: vi.fn(async () => []),
        implementation: vi.fn(async () => []),
        prepareCallHierarchy: vi.fn(async () => []),
        incomingCalls: vi.fn(async () => []),
        outgoingCalls: vi.fn(async () => []),
      },
      waitForDiagnostics: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
    };

    vi.mocked(createClient).mockResolvedValue(client);

    await LSP.diagnosticsForFile('/repo/file.ts');

    expect(notify.open).toHaveBeenCalledWith({ path: '/repo/file.ts' });
    expect(notify.change).toHaveBeenCalledWith({ path: '/repo/file.ts', version: 2 });
    expect(client.waitForDiagnostics).toHaveBeenCalledWith({ path: '/repo/file.ts' });
  });
});
