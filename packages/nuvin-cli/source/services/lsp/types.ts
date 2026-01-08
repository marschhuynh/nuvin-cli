import type {
	Diagnostic,
	Location,
	Range,
	DocumentSymbol,
	SymbolInformation,
	Hover,
	CallHierarchyItem,
	CallHierarchyIncomingCall,
	CallHierarchyOutgoingCall,
} from 'vscode-languageserver-types';
import type { MessageConnection } from 'vscode-jsonrpc';
import type { ChildProcess } from 'node:child_process';

export type {
	Diagnostic,
	Location,
	Range,
	DocumentSymbol,
	SymbolInformation,
	Hover,
	CallHierarchyItem,
	CallHierarchyIncomingCall,
	CallHierarchyOutgoingCall,
};

export { DiagnosticSeverity, SymbolKind } from 'vscode-languageserver-types';

export interface Position {
	file: string;
	line: number;
	character: number;
}

export interface LSPServerInfo {
	id: string;
	name: string;
	extensions: string[];
	root: (file: string) => Promise<string | undefined>;
	spawn: (root: string) => Promise<LSPServerHandle | undefined>;
}

export interface LSPServerHandle {
	process: ChildProcess;
	initialization?: Record<string, unknown>;
}

export interface LSPClientInfo {
	serverID: string;
	root: string;
	connection: MessageConnection;
	diagnostics: Map<string, Diagnostic[]>;
	capabilities: ServerCapabilities;
	notify: {
		open(input: { path: string }): Promise<void>;
		change(input: { path: string; version: number }): Promise<void>;
		save(input: { path: string }): Promise<void>;
		close(input: { path: string }): Promise<void>;
	};
	request: {
		definition(pos: Position): Promise<Location[]>;
		references(pos: Position): Promise<Location[]>;
		hover(pos: Position): Promise<Hover | null>;
		documentSymbol(uri: string): Promise<(DocumentSymbol | SymbolInformation)[]>;
		workspaceSymbol(query: string): Promise<SymbolInformation[]>;
		implementation(pos: Position): Promise<Location[]>;
		prepareCallHierarchy(pos: Position): Promise<CallHierarchyItem[]>;
		incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[]>;
		outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]>;
	};
	waitForDiagnostics(input: { path: string; timeout?: number }): Promise<void>;
	shutdown(): Promise<void>;
}

export interface ServerCapabilities {
	definitionProvider?: boolean;
	referencesProvider?: boolean;
	hoverProvider?: boolean;
	documentSymbolProvider?: boolean;
	workspaceSymbolProvider?: boolean;
	implementationProvider?: boolean;
	callHierarchyProvider?: boolean;
}

export interface LSPStatus {
	serverID: string;
	serverName: string;
	root: string;
	status: 'connected' | 'connecting' | 'disconnected' | 'error';
	capabilities: ServerCapabilities;
}

export interface LSPServerConfig {
	disabled?: boolean;
	command?: string[];
	extensions?: string[];
	env?: Record<string, string>;
	initialization?: Record<string, unknown>;
}

export interface LSPConfig {
	enabled: boolean;
	servers: Record<string, LSPServerConfig>;
}

export interface LSPEvents {
	'lsp:updated': { status: 'connected' | 'disconnected'; serverId: string };
	'lsp:diagnostics': { path: string; serverId: string; diagnostics: Diagnostic[] };
	'lsp:error': { serverId: string; error: string };
}
