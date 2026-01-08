import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import type {
  InitializeParams,
  InitializeResult,
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  DidSaveTextDocumentParams,
  DidCloseTextDocumentParams,
  TextDocumentPositionParams,
  ReferenceParams,
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  CallHierarchyPrepareParams,
  CallHierarchyIncomingCallsParams,
  CallHierarchyOutgoingCallsParams,
  PublishDiagnosticsParams,
} from 'vscode-languageserver-protocol';
import type {
  LSPClientInfo,
  LSPServerHandle,
  ServerCapabilities,
  Position,
  Diagnostic,
  Location,
  Hover,
  DocumentSymbol,
  SymbolInformation,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
} from './types.js';
import { getLanguageId } from './language.js';

const INITIALIZE_TIMEOUT = 60000;
const DIAGNOSTICS_TIMEOUT = 5000;

export async function createClient(input: {
  serverID: string;
  server: LSPServerHandle;
  root: string;
  onDiagnostics?: (path: string, diagnostics: Diagnostic[]) => void;
}): Promise<LSPClientInfo> {
  const { serverID, server, root, onDiagnostics } = input;
  const { process: proc } = server;

  if (!proc.stdin || !proc.stdout) {
    throw new Error(`LSP server ${serverID} missing stdio streams`);
  }

  const connection = createMessageConnection(new StreamMessageReader(proc.stdout), new StreamMessageWriter(proc.stdin));

  const diagnostics = new Map<string, Diagnostic[]>();
  const pendingDiagnostics = new Map<string, { resolve: () => void; timer: NodeJS.Timeout }>();

  connection.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
    const filePath = params.uri.startsWith('file://') ? decodeURIComponent(params.uri.slice(7)) : params.uri;
    const fileDiagnostics = params.diagnostics as Diagnostic[];
    diagnostics.set(filePath, fileDiagnostics);

    onDiagnostics?.(filePath, fileDiagnostics);

    const pending = pendingDiagnostics.get(filePath);
    if (pending) {
      clearTimeout(pending.timer);
      pendingDiagnostics.delete(filePath);
      pending.resolve();
    }
  });

  connection.listen();

  const initParams: InitializeParams = {
    processId: process.pid,
    rootUri: pathToFileURL(root).href,
    rootPath: root,
    capabilities: {
      textDocument: {
        synchronization: {
          dynamicRegistration: false,
          willSave: false,
          willSaveWaitUntil: false,
          didSave: true,
        },
        completion: { dynamicRegistration: false },
        hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
        definition: { dynamicRegistration: false },
        references: { dynamicRegistration: false },
        documentSymbol: { dynamicRegistration: false },
        implementation: { dynamicRegistration: false },
        callHierarchy: { dynamicRegistration: false },
        publishDiagnostics: { relatedInformation: true },
      },
      workspace: {
        workspaceFolders: true,
        symbol: { dynamicRegistration: false },
      },
    },
    workspaceFolders: [{ uri: pathToFileURL(root).href, name: path.basename(root) }],
    initializationOptions: server.initialization,
  };

  const initResult = await Promise.race([
    connection.sendRequest<InitializeResult>('initialize', initParams),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LSP initialize timeout')), INITIALIZE_TIMEOUT),
    ),
  ]);

  const capabilities: ServerCapabilities = {
    definitionProvider: !!initResult.capabilities.definitionProvider,
    referencesProvider: !!initResult.capabilities.referencesProvider,
    hoverProvider: !!initResult.capabilities.hoverProvider,
    documentSymbolProvider: !!initResult.capabilities.documentSymbolProvider,
    workspaceSymbolProvider: !!initResult.capabilities.workspaceSymbolProvider,
    implementationProvider: !!initResult.capabilities.implementationProvider,
    callHierarchyProvider: !!initResult.capabilities.callHierarchyProvider,
  };

  await connection.sendNotification('initialized', {});

  const openedFiles = new Set<string>();

  const client: LSPClientInfo = {
    serverID,
    root,
    connection,
    diagnostics,
    capabilities,

    notify: {
      async open({ path: filePath }) {
        if (openedFiles.has(filePath)) return;
        openedFiles.add(filePath);

        const content = await fs.promises.readFile(filePath, 'utf-8');
        const languageId = getLanguageId(filePath) || 'plaintext';

        const params: DidOpenTextDocumentParams = {
          textDocument: {
            uri: pathToFileURL(filePath).href,
            languageId,
            version: 1,
            text: content,
          },
        };
        await connection.sendNotification('textDocument/didOpen', params);
      },

      async change({ path: filePath, version }) {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const params: DidChangeTextDocumentParams = {
          textDocument: { uri: pathToFileURL(filePath).href, version },
          contentChanges: [{ text: content }],
        };
        await connection.sendNotification('textDocument/didChange', params);
      },

      async save({ path: filePath }) {
        const params: DidSaveTextDocumentParams = {
          textDocument: { uri: pathToFileURL(filePath).href },
        };
        await connection.sendNotification('textDocument/didSave', params);
      },

      async close({ path: filePath }) {
        openedFiles.delete(filePath);
        const params: DidCloseTextDocumentParams = {
          textDocument: { uri: pathToFileURL(filePath).href },
        };
        await connection.sendNotification('textDocument/didClose', params);
      },
    },

    request: {
      async definition(pos: Position): Promise<Location[]> {
        if (!capabilities.definitionProvider) return [];
        await client.notify.open({ path: pos.file });

        const params: TextDocumentPositionParams = {
          textDocument: { uri: pathToFileURL(pos.file).href },
          position: { line: pos.line, character: pos.character },
        };
        const result = await connection.sendRequest<Location | Location[] | null>('textDocument/definition', params);
        return normalizeLocations(result);
      },

      async references(pos: Position): Promise<Location[]> {
        if (!capabilities.referencesProvider) return [];
        await client.notify.open({ path: pos.file });

        const params: ReferenceParams = {
          textDocument: { uri: pathToFileURL(pos.file).href },
          position: { line: pos.line, character: pos.character },
          context: { includeDeclaration: true },
        };
        const result = await connection.sendRequest<Location[] | null>('textDocument/references', params);
        return result || [];
      },

      async hover(pos: Position): Promise<Hover | null> {
        if (!capabilities.hoverProvider) return null;
        await client.notify.open({ path: pos.file });

        const params: TextDocumentPositionParams = {
          textDocument: { uri: pathToFileURL(pos.file).href },
          position: { line: pos.line, character: pos.character },
        };
        return connection.sendRequest<Hover | null>('textDocument/hover', params);
      },

      async documentSymbol(uri: string): Promise<(DocumentSymbol | SymbolInformation)[]> {
        if (!capabilities.documentSymbolProvider) return [];
        const filePath = uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
        await client.notify.open({ path: filePath });

        const params: DocumentSymbolParams = {
          textDocument: { uri: uri.startsWith('file://') ? uri : pathToFileURL(uri).href },
        };
        const result = await connection.sendRequest<(DocumentSymbol | SymbolInformation)[] | null>(
          'textDocument/documentSymbol',
          params,
        );
        return result || [];
      },

      async workspaceSymbol(query: string): Promise<SymbolInformation[]> {
        if (!capabilities.workspaceSymbolProvider) return [];

        const params: WorkspaceSymbolParams = { query };
        const result = await connection.sendRequest<SymbolInformation[] | null>('workspace/symbol', params);
        return result || [];
      },

      async implementation(pos: Position): Promise<Location[]> {
        if (!capabilities.implementationProvider) return [];
        await client.notify.open({ path: pos.file });

        const params: TextDocumentPositionParams = {
          textDocument: { uri: pathToFileURL(pos.file).href },
          position: { line: pos.line, character: pos.character },
        };
        const result = await connection.sendRequest<Location | Location[] | null>(
          'textDocument/implementation',
          params,
        );
        return normalizeLocations(result);
      },

      async prepareCallHierarchy(pos: Position): Promise<CallHierarchyItem[]> {
        if (!capabilities.callHierarchyProvider) return [];
        await client.notify.open({ path: pos.file });

        const params: CallHierarchyPrepareParams = {
          textDocument: { uri: pathToFileURL(pos.file).href },
          position: { line: pos.line, character: pos.character },
        };
        const result = await connection.sendRequest<CallHierarchyItem[] | null>(
          'textDocument/prepareCallHierarchy',
          params,
        );
        return result || [];
      },

      async incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[]> {
        if (!capabilities.callHierarchyProvider) return [];

        const params: CallHierarchyIncomingCallsParams = { item };
        const result = await connection.sendRequest<CallHierarchyIncomingCall[] | null>(
          'callHierarchy/incomingCalls',
          params,
        );
        return result || [];
      },

      async outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]> {
        if (!capabilities.callHierarchyProvider) return [];

        const params: CallHierarchyOutgoingCallsParams = { item };
        const result = await connection.sendRequest<CallHierarchyOutgoingCall[] | null>(
          'callHierarchy/outgoingCalls',
          params,
        );
        return result || [];
      },
    },

    async waitForDiagnostics({ path: filePath, timeout = DIAGNOSTICS_TIMEOUT }) {
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          pendingDiagnostics.delete(filePath);
          resolve();
        }, timeout);
        pendingDiagnostics.set(filePath, { resolve, timer });
      });
    },

    async shutdown() {
      try {
        await connection.sendRequest('shutdown');
        await connection.sendNotification('exit');
      } catch {
      } finally {
        connection.dispose();
        proc.kill();
      }
    },
  };

  return client;
}

function normalizeLocations(result: Location | Location[] | null | undefined): Location[] {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}
