/**
 * ACP (Agent Client Protocol) Type Definitions
 *
 * ACP is a JSON-RPC 2.0 based protocol for communication between code editors
 * (like Zed, JetBrains IDEs) and AI coding agents.
 *
 * @see https://github.com/anthropics/acp
 */

// =============================================================================
// Protocol Version
// =============================================================================

export const PROTOCOL_VERSION = 1;

// =============================================================================
// Core ID Types
// =============================================================================

/** Unique identifier for a session */
export type SessionId = string;

/** Unique identifier for a tool call */
export type ToolCallId = string;

/** Unique identifier for a permission option */
export type PermissionOptionId = string;

// =============================================================================
// Capabilities
// =============================================================================

/**
 * Capabilities that the agent supports
 */
export type AgentCapabilities = {
  /** Whether the agent supports loading existing sessions */
  loadSession?: boolean;
  /** MCP (Model Context Protocol) capabilities */
  mcpCapabilities?: McpCapabilities;
  /** Capabilities related to prompt handling */
  promptCapabilities?: PromptCapabilities;
  /** Capabilities related to session management */
  sessionCapabilities?: SessionCapabilities;
};

export type McpCapabilities = {
  /** Whether the agent supports MCP servers */
  supported?: boolean;
};

export type PromptCapabilities = {
  /** Whether the agent supports streaming responses */
  streaming?: boolean;
  /** Whether the agent supports cancellation */
  cancellation?: boolean;
};

export type SessionCapabilities = {
  /** Whether the agent supports multiple sessions */
  multipleSessions?: boolean;
  /** Whether the agent supports session persistence */
  persistence?: boolean;
};

/**
 * Capabilities that the client (editor) supports
 */
export type ClientCapabilities = {
  /** File system capabilities */
  fs?: FsCapabilities;
  /** Terminal capabilities */
  terminal?: TerminalCapabilities;
};

export type FsCapabilities = {
  /** Client can read text files */
  readTextFile?: boolean;
  /** Client can write text files */
  writeTextFile?: boolean;
};

export type TerminalCapabilities = {
  /** Client supports terminal execution */
  supported?: boolean;
};

// =============================================================================
// Content Types
// =============================================================================

/**
 * A block of content that can be part of a message
 */
export type ContentBlock = TextContent | ImageContent | ResourceLinkContent | ResourceContent;

export type TextContent = {
  type: 'text';
  text: string;
};

export type ImageContent = {
  type: 'image';
  source: ImageSource;
};

export type ImageSource = {
  type: 'base64';
  mediaType: string;
  data: string;
};

export type ResourceLinkContent = {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
};

export type ResourceContent = {
  type: 'resource';
  resource: EmbeddedResource;
};

/**
 * An embedded resource with content
 */
export type EmbeddedResource = {
  /** URI identifying the resource */
  uri: string;
  /** MIME type of the resource */
  mimeType?: string;
  /** Text content (for text-based resources) */
  text?: string;
  /** Base64-encoded binary content (for binary resources) */
  blob?: string;
};

// =============================================================================
// Initialize Request/Response
// =============================================================================

/**
 * Request sent by client to initialize the ACP connection
 */
export type InitializeRequest = {
  /** Protocol version the client supports */
  protocolVersion: number;
  /** Information about the client */
  clientInfo?: ClientInfo;
  /** Capabilities the client supports */
  clientCapabilities?: ClientCapabilities;
};

export type ClientInfo = {
  /** Name of the client application */
  name: string;
  /** Version of the client application */
  version?: string;
};

/**
 * Response from agent after initialization
 */
export type InitializeResponse = {
  /** Protocol version the agent supports */
  protocolVersion: number;
  /** Information about the agent */
  agentInfo?: AgentInfo;
  /** Capabilities the agent supports */
  agentCapabilities?: AgentCapabilities;
  /** Authentication methods supported by the agent */
  authMethods?: AuthMethod[];
};

export type AgentInfo = {
  /** Name of the agent */
  name: string;
  /** Version of the agent */
  version?: string;
};

/**
 * Authentication method supported by the agent
 */
export type AuthMethod = {
  /** Unique identifier for this auth method */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of this auth method */
  description?: string;
};

// =============================================================================
// Session Types
// =============================================================================

/**
 * Request to create a new session
 */
export type NewSessionRequest = {
  /** Current working directory for the session */
  cwd: string;
  /** MCP servers to connect to */
  mcpServers?: McpServer[];
};

/**
 * Response after creating a new session
 */
export type NewSessionResponse = {
  /** Unique identifier for the created session */
  sessionId: SessionId;
  /** Configuration options for the session */
  configOptions?: ConfigOption[];
  /** Available modes for the session */
  modes?: SessionMode[];
};

/**
 * MCP server configuration - can be stdio, http, or sse based
 */
export type McpServer = McpServerStdio | McpServerHttp | McpServerSse;

export type McpServerStdio = {
  type: 'stdio';
  /** Name of the MCP server */
  name: string;
  /** Command to execute */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
};

export type McpServerHttp = {
  type: 'http';
  /** Name of the MCP server */
  name: string;
  /** HTTP URL to connect to */
  url: string;
  /** Headers to include in requests */
  headers?: Record<string, string>;
};

export type McpServerSse = {
  type: 'sse';
  /** Name of the MCP server */
  name: string;
  /** SSE URL to connect to */
  url: string;
  /** Headers to include in requests */
  headers?: Record<string, string>;
};

/**
 * Configuration option for a session
 */
export type ConfigOption = {
  /** Unique identifier for this option */
  id: string;
  /** Human-readable label */
  label: string;
  /** Description of what this option does */
  description?: string;
  /** Type of the option value */
  type: 'boolean' | 'string' | 'number' | 'select';
  /** Current value */
  value: unknown;
  /** Available choices (for select type) */
  choices?: ConfigOptionChoice[];
};

export type ConfigOptionChoice = {
  /** Value to set when selected */
  value: unknown;
  /** Human-readable label */
  label: string;
};

/**
 * A mode the agent can operate in (e.g., "code", "architect", "ask")
 */
export type SessionMode = {
  /** Unique identifier for this mode */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of this mode */
  description?: string;
};

/**
 * Current state of a session mode
 */
export type SessionModeState = {
  /** Current mode */
  mode: SessionMode;
  /** Available modes */
  availableModes: SessionMode[];
};

// =============================================================================
// Prompt Types
// =============================================================================

/**
 * Request to send a prompt to the agent
 */
export type PromptRequest = {
  /** Session to send the prompt to */
  sessionId: SessionId;
  /** The prompt text */
  prompt: string;
};

/**
 * Response after a prompt has been fully processed
 */
export type PromptResponse = {
  /** Reason why the agent stopped generating */
  stopReason: StopReason;
};

/**
 * Reason why the agent stopped generating a response
 */
export type StopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'max_turn_requests'
  | 'refusal'
  | 'cancelled';

// =============================================================================
// Session Update Notifications
// =============================================================================

/**
 * Union type of all session update notifications
 * Sent from agent to client during prompt processing
 */
export type SessionUpdate =
  | UserMessageChunkUpdate
  | AgentMessageChunkUpdate
  | AgentThoughtChunkUpdate
  | ToolCallUpdate
  | ToolCallStatusUpdate
  | PlanUpdate
  | AvailableCommandsUpdate
  | CurrentModeUpdate
  | ConfigOptionUpdate;

export type UserMessageChunkUpdate = {
  type: 'user_message_chunk';
  chunk: ContentChunk;
};

export type AgentMessageChunkUpdate = {
  type: 'agent_message_chunk';
  chunk: ContentChunk;
};

export type AgentThoughtChunkUpdate = {
  type: 'agent_thought_chunk';
  chunk: ContentChunk;
};

/**
 * Notification that a tool call has started or contains content
 */
export type ToolCallUpdate = {
  type: 'tool_call';
  toolCallId: ToolCallId;
  /** Kind of tool being called */
  kind: ToolKind;
  /** Name of the tool */
  name: string;
  /** Tool call content/arguments */
  content?: ToolCallContent;
  /** Location in code where tool operates */
  location?: ToolCallLocation;
};

/**
 * Notification about tool call status change
 */
export type ToolCallStatusUpdate = {
  type: 'tool_call_update';
  toolCallId: ToolCallId;
  /** Current status of the tool call */
  status: ToolCallStatus;
  /** Result of the tool call (when completed) */
  result?: ToolCallResult;
};

export type PlanUpdate = {
  type: 'plan';
  /** List of plan entries */
  entries: PlanEntry[];
};

export type AvailableCommandsUpdate = {
  type: 'available_commands_update';
  /** List of available commands */
  commands: AvailableCommand[];
};

export type CurrentModeUpdate = {
  type: 'current_mode_update';
  /** The new current mode */
  mode: SessionMode;
};

export type ConfigOptionUpdate = {
  type: 'config_option_update';
  /** The updated config option */
  option: ConfigOption;
};

/**
 * A chunk of content being streamed
 */
export type ContentChunk = {
  /** Text content */
  text?: string;
};

/**
 * Kind of tool being executed
 */
export type ToolKind =
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'command'
  | 'search'
  | 'web'
  | 'mcp'
  | 'other';

/**
 * Status of a tool call
 */
export type ToolCallStatus =
  | 'pending'
  | 'running'
  | 'waiting_permission'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Content/arguments of a tool call
 */
export type ToolCallContent = {
  /** Tool input/arguments as JSON */
  input?: unknown;
  /** Human-readable description of what the tool is doing */
  description?: string;
};

/**
 * Result of a completed tool call
 */
export type ToolCallResult = {
  /** Whether the tool call succeeded */
  success: boolean;
  /** Output from the tool */
  output?: string;
  /** Error message if failed */
  error?: string;
};

/**
 * Location in code where a tool operates
 */
export type ToolCallLocation = {
  /** File path */
  path: string;
  /** Start line (1-based) */
  startLine?: number;
  /** End line (1-based) */
  endLine?: number;
  /** Start column (1-based) */
  startColumn?: number;
  /** End column (1-based) */
  endColumn?: number;
};

/**
 * An entry in a plan
 */
export type PlanEntry = {
  /** Unique identifier for this entry */
  id: string;
  /** Description of the plan step */
  description: string;
  /** Status of this plan entry */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  /** Child entries (for nested plans) */
  children?: PlanEntry[];
};

/**
 * A command available to the user
 */
export type AvailableCommand = {
  /** Command identifier (e.g., "/help", "/clear") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the command does */
  description?: string;
  /** Keyboard shortcut */
  shortcut?: string;
};

// =============================================================================
// Permission Types
// =============================================================================

/**
 * Request from agent to client for permission to perform an action
 */
export type RequestPermissionRequest = {
  /** Session this permission request is for */
  sessionId: SessionId;
  /** Tool call this permission is for */
  toolCallId: ToolCallId;
  /** Title of the permission request */
  title: string;
  /** Detailed description of what permission is being requested */
  description?: string;
  /** Available options for the user to choose */
  options: PermissionOption[];
};

/**
 * Response from client granting or denying permission
 */
export type RequestPermissionResponse = {
  /** The option the user selected */
  selectedOption: PermissionOptionId;
};

/**
 * A permission option presented to the user
 */
export type PermissionOption = {
  /** Unique identifier for this option */
  id: PermissionOptionId;
  /** Human-readable label */
  label: string;
  /** Description of what this option means */
  description?: string;
  /** Whether this is a "deny" option */
  isDeny?: boolean;
  /** Whether this option should be remembered for future requests */
  remember?: boolean;
};

// =============================================================================
// File System Types (Client Methods)
// =============================================================================

/**
 * Request from agent to client to read a text file
 */
export type ReadTextFileRequest = {
  /** Path to the file to read */
  path: string;
};

/**
 * Response from client with file contents
 */
export type ReadTextFileResponse = {
  /** Contents of the file */
  content: string;
};

/**
 * Request from agent to client to write a text file
 */
export type WriteTextFileRequest = {
  /** Path to the file to write */
  path: string;
  /** Content to write to the file */
  content: string;
};

/**
 * Response from client after writing a file
 */
export type WriteTextFileResponse = {
  /** Whether the write was successful */
  success: boolean;
};

// =============================================================================
// Cancel and Session Notification Types
// =============================================================================

/**
 * Notification from client to cancel an ongoing operation
 */
export type CancelNotification = {
  /** Session to cancel operations in */
  sessionId: SessionId;
  /** Specific operation to cancel (optional, cancels all if not specified) */
  operationId?: string;
};

/**
 * Notification about session state changes
 */
export type SessionNotification =
  | SessionCreatedNotification
  | SessionClosedNotification
  | SessionErrorNotification;

export type SessionCreatedNotification = {
  type: 'session_created';
  sessionId: SessionId;
};

export type SessionClosedNotification = {
  type: 'session_closed';
  sessionId: SessionId;
  reason?: string;
};

export type SessionErrorNotification = {
  type: 'session_error';
  sessionId: SessionId;
  error: string;
};

// =============================================================================
// JSON-RPC Types
// =============================================================================

/**
 * JSON-RPC 2.0 request structure
 */
export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
};

/**
 * JSON-RPC 2.0 response structure
 */
export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
};

/**
 * JSON-RPC 2.0 notification (no id, no response expected)
 */
export type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

/**
 * JSON-RPC 2.0 error structure
 */
export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

/**
 * Standard JSON-RPC 2.0 error codes
 */
export const JsonRpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export type JsonRpcErrorCode = (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

// =============================================================================
// ACP Method Names
// =============================================================================

/**
 * ACP method names for JSON-RPC calls
 */
export const AcpMethod = {
  // Lifecycle
  Initialize: 'initialize',
  Shutdown: 'shutdown',

  // Session management
  NewSession: 'session/new',
  LoadSession: 'session/load',
  CloseSession: 'session/close',

  // Prompt handling
  Prompt: 'prompt',
  Cancel: 'cancel',

  // Notifications (agent -> client)
  SessionUpdate: 'session/update',

  // Permission handling
  RequestPermission: 'permission/request',

  // Client methods (agent -> client)
  FsReadTextFile: 'fs/readTextFile',
  FsWriteTextFile: 'fs/writeTextFile',
} as const;

export type AcpMethod = (typeof AcpMethod)[keyof typeof AcpMethod];
