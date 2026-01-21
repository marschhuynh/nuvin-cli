import { createClient } from './client.js';
import { getServerForFile, BUILTIN_SERVERS } from './server.js';
import { eventBus } from '../EventBus.js';
import type {
  LSPClientInfo,
  LSPServerInfo,
  LSPStatus,
  Position,
  Diagnostic,
  Location,
  Hover,
  DocumentSymbol,
  SymbolInformation,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  LSPConfig,
} from './types.js';

export * from './types.js';
export { getLanguageId } from './language.js';

interface State {
  initialized: boolean;
  config: LSPConfig;
  clients: LSPClientInfo[];
  broken: Set<string>;
  spawning: Map<string, Promise<LSPClientInfo | undefined>>;
  fileVersions: Map<string, number>;
}

const state: State = {
  initialized: false,
  config: { enabled: true, servers: {} },
  clients: [],
  broken: new Set(),
  spawning: new Map(),
  fileVersions: new Map(),
};

export namespace LSP {
  export const Event = {
    Updated: 'lsp:updated',
    Diagnostics: 'lsp:diagnostics',
  } as const;

  export async function init(config?: Partial<LSPConfig>): Promise<void> {
    if (state.initialized) return;

    state.config = {
      enabled: config?.enabled ?? process.env.NUVIN_DISABLE_LSP !== 'true',
      servers: config?.servers ?? {},
    };
    state.initialized = true;
  }

  export function isEnabled(): boolean {
    return state.config.enabled;
  }

  export async function status(): Promise<LSPStatus[]> {
    return state.clients.map((client) => {
      const serverInfo = BUILTIN_SERVERS.find((s) => s.id === client.serverID);
      return {
        serverID: client.serverID,
        serverName: serverInfo?.name ?? client.serverID,
        root: client.root,
        status: 'connected' as const,
        capabilities: client.capabilities,
      };
    });
  }

  export async function hasClients(file: string): Promise<boolean> {
    if (!state.config.enabled) return false;
    const server = getServerForFile(file);
    if (!server) return false;
    if (state.broken.has(server.id)) return false;
    return true;
  }

  export async function touchFile(filePath: string, waitDiagnostics = false): Promise<void> {
    if (!state.config.enabled) return;

    const client = await getOrCreateClient(filePath);
    if (!client) return;

    await client.notify.open({ path: filePath });

    if (waitDiagnostics) {
      await client.waitForDiagnostics({ path: filePath });
    }
  }

  export async function diagnostics(): Promise<Record<string, Diagnostic[]>> {
    const result: Record<string, Diagnostic[]> = {};
    for (const client of state.clients) {
      for (const [filePath, diags] of client.diagnostics) {
        result[filePath] = diags;
      }
    }
    return result;
  }

  export async function diagnosticsForFile(filePath: string): Promise<Diagnostic[]> {
    const client = await getOrCreateClient(filePath);
    if (!client) return [];

    await client.notify.open({ path: filePath });
    const nextVersion = (state.fileVersions.get(filePath) ?? 1) + 1;
    state.fileVersions.set(filePath, nextVersion);
    await client.notify.change({ path: filePath, version: nextVersion });
    await client.waitForDiagnostics({ path: filePath });

    return client.diagnostics.get(filePath) ?? [];
  }

  export async function definition(pos: Position): Promise<Location[]> {
    const client = await getOrCreateClient(pos.file);
    if (!client) return [];
    return client.request.definition(pos);
  }

  export async function references(pos: Position): Promise<Location[]> {
    const client = await getOrCreateClient(pos.file);
    if (!client) return [];
    return client.request.references(pos);
  }

  export async function hover(pos: Position): Promise<Hover | null> {
    const client = await getOrCreateClient(pos.file);
    if (!client) return null;
    return client.request.hover(pos);
  }

  export async function documentSymbol(uri: string): Promise<(DocumentSymbol | SymbolInformation)[]> {
    const filePath = uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
    const client = await getOrCreateClient(filePath);
    if (!client) return [];
    return client.request.documentSymbol(uri);
  }

  export async function workspaceSymbol(query: string): Promise<SymbolInformation[]> {
    const results: SymbolInformation[] = [];
    for (const client of state.clients) {
      const symbols = await client.request.workspaceSymbol(query);
      results.push(...symbols);
    }
    return results;
  }

  export async function implementation(pos: Position): Promise<Location[]> {
    const client = await getOrCreateClient(pos.file);
    if (!client) return [];
    return client.request.implementation(pos);
  }

  export async function prepareCallHierarchy(pos: Position): Promise<CallHierarchyItem[]> {
    const client = await getOrCreateClient(pos.file);
    if (!client) return [];
    return client.request.prepareCallHierarchy(pos);
  }

  export async function incomingCalls(pos: Position): Promise<CallHierarchyIncomingCall[]> {
    const client = await getOrCreateClient(pos.file);
    if (!client) return [];
    const items = await client.request.prepareCallHierarchy(pos);
    if (items.length === 0) return [];
    return client.request.incomingCalls(items[0]);
  }

  export async function outgoingCalls(pos: Position): Promise<CallHierarchyOutgoingCall[]> {
    const client = await getOrCreateClient(pos.file);
    if (!client) return [];
    const items = await client.request.prepareCallHierarchy(pos);
    if (items.length === 0) return [];
    return client.request.outgoingCalls(items[0]);
  }

  export async function shutdown(): Promise<void> {
    for (const client of state.clients) {
      eventBus.emit('lsp:status', {
        serverId: client.serverID,
        status: 'disconnected',
        root: client.root,
      });
    }
    const shutdownPromises = state.clients.map((client) => client.shutdown());
    await Promise.allSettled(shutdownPromises);
    state.clients = [];
    state.spawning.clear();
    state.broken.clear();
    state.fileVersions.clear();
    state.initialized = false;
  }

  async function getOrCreateClient(filePath: string): Promise<LSPClientInfo | undefined> {
    if (!state.config.enabled) return undefined;

    const server = getServerForFile(filePath);
    if (!server) return undefined;

    if (state.broken.has(server.id)) return undefined;

    const serverConfig = state.config.servers[server.id];
    if (serverConfig?.disabled) return undefined;

    const root = await server.root(filePath);
    if (!root) return undefined;

    const cacheKey = `${server.id}:${root}`;

    const existing = state.clients.find((c) => c.serverID === server.id && c.root === root);
    if (existing) return existing;

    const spawning = state.spawning.get(cacheKey);
    if (spawning) return spawning;

    const spawnPromise = spawnClient(server, root, cacheKey);
    state.spawning.set(cacheKey, spawnPromise);

    try {
      const client = await spawnPromise;
      return client;
    } finally {
      state.spawning.delete(cacheKey);
    }
  }

  async function spawnClient(
    server: LSPServerInfo,
    root: string,
    _cacheKey: string,
  ): Promise<LSPClientInfo | undefined> {
    try {
      eventBus.emit('lsp:status', {
        serverId: server.id,
        status: 'connecting',
        root,
      });

      const handle = await server.spawn(root);
      if (!handle) {
        state.broken.add(server.id);
        eventBus.emit('lsp:status', {
          serverId: server.id,
          status: 'error',
          root,
        });
        return undefined;
      }

      const client = await createClient({
        serverID: server.id,
        server: handle,
        root,
        onDiagnostics: (path, diagnostics) => {
          eventBus.emit('lsp:diagnostics', {
            path,
            serverId: server.id,
            diagnostics,
          });
        },
      });

      state.clients.push(client);

      eventBus.emit('lsp:status', {
        serverId: server.id,
        status: 'connected',
        root,
      });

      return client;
    } catch (err) {
      console.error(`[LSP] Failed to create client for ${server.id}:`, err);
      state.broken.add(server.id);
      eventBus.emit('lsp:status', {
        serverId: server.id,
        status: 'error',
        root,
      });
      return undefined;
    }
  }
}

export default LSP;
