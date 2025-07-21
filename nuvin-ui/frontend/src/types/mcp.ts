// MCP (Model Context Protocol) types and interfaces

// JSON-RPC 2.0 types
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

// MCP Core types
export interface MCPCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: {};
  experimental?: Record<string, any>;
}

export interface MCPClientInfo {
  name: string;
  version: string;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  capabilities?: MCPCapabilities;
}

// MCP Tool types
export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments?: Record<string, any>;
}

export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

// MCP Resource types
export interface MCPResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContents {
  uri: string;
  mimeType?: string;
  content: MCPContent[];
}

// MCP connection and transport types
export interface MCPConnection {
  send(message: JSONRPCRequest | JSONRPCNotification): Promise<void>;
  close(): Promise<void>;
  onMessage(
    handler: (message: JSONRPCResponse | JSONRPCNotification) => void,
  ): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
}

export interface MCPTransportOptions {
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

// Extended MCP Config (building on existing MCPConfig)
export interface MCPConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  description?: string;
}

export interface ExtendedMCPConfig extends MCPConfig {
  status: 'connected' | 'disconnected' | 'error' | 'starting' | 'stopping';
  lastConnected?: Date;
  lastError?: string;
  toolCount: number;
  resourceCount: number;
  capabilities?: MCPCapabilities;
  serverInfo?: MCPServerInfo;
  pid?: number;
}

// MCP Client events
export type MCPClientEvent =
  | { type: 'connected'; serverId: string; serverInfo: MCPServerInfo }
  | { type: 'disconnected'; serverId: string; reason?: string }
  | { type: 'error'; serverId: string; error: Error }
  | { type: 'toolsChanged'; serverId: string; tools: MCPToolSchema[] }
  | { type: 'resourcesChanged'; serverId: string; resources: MCPResource[] };

export interface MCPClientEventHandler {
  (event: MCPClientEvent): void;
}

// MCP initialization
export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  clientInfo: MCPClientInfo;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  serverInfo: MCPServerInfo;
}

// MCP standard methods
export type MCPMethod =
  | 'initialize'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/templates/list'
  | 'resources/read'
  | 'prompts/list'
  | 'prompts/get'
  | 'logging/setLevel'
  | 'notifications/tools/list_changed'
  | 'notifications/resources/list_changed'
  | 'notifications/resources/updated'
  | 'notifications/prompts/list_changed';

// MCP Error codes (following JSON-RPC spec)
export enum MCPErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // MCP-specific error codes
  INITIALIZATION_FAILED = -32000,
  TOOL_NOT_FOUND = -32001,
  RESOURCE_NOT_FOUND = -32002,
  ACCESS_DENIED = -32003,
  TIMEOUT = -32004,
}
