// packages/nuvin-acp/source/protocol/types.ts

// Session ID
export type SessionId = string;
export type ToolCallId = string;

// Capabilities
export type ClientCapabilities = {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
};

export type AgentCapabilities = {
  loadSession?: boolean;
  promptCapabilities?: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
};

export type Implementation = {
  name: string;
  title?: string;
  version: string;
};

// Initialize
export type InitializeParams = {
  _meta?: Record<string, unknown>;
  protocolVersion: number;
  clientCapabilities?: ClientCapabilities;
  clientInfo?: Implementation;
};

export type InitializeResult = {
  _meta?: Record<string, unknown>;
  protocolVersion: number;
  agentCapabilities?: AgentCapabilities;
  agentInfo?: Implementation;
  authMethods?: Array<{ id: string; name: string }>;
};

// Session
export type McpServerStdio = {
  name: string;
  command: string;
  args: string[];
  env?: Array<{ name: string; value: string }>;
};

export type NewSessionParams = {
  _meta?: Record<string, unknown>;
  cwd: string;
  mcpServers?: McpServerStdio[];
};

export type NewSessionResult = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
};

// Session Load
export type LoadSessionParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  cwd: string;
  mcpServers: McpServerStdio[];
};

export type LoadSessionResult = {
  _meta?: Record<string, unknown>;
  modes?: SessionModeState;
};

// Session Mode
export type SetSessionModeParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  modeId: string;
};

export type SetSessionModeResult = {
  _meta?: Record<string, unknown>;
};

export type SessionMode = {
  id: string;
  name: string;
  description?: string;
};

export type SessionModeState = {
  availableModes: SessionMode[];
  currentModeId: string;
};

// Authentication
export type AuthenticateParams = {
  _meta?: Record<string, unknown>;
  methodId: string;
};

export type AuthenticateResult = {
  _meta?: Record<string, unknown>;
};

export type AuthMethod = {
  id: string;
  name: string;
  description?: string;
};

// File System Methods
export type ReadTextFileParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  path: string;
  line?: number;
  limit?: number;
};

export type ReadTextFileResult = {
  _meta?: Record<string, unknown>;
  content: string;
};

export type WriteTextFileParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  path: string;
  content: string;
};

export type WriteTextFileResult = {
  _meta?: Record<string, unknown>;
};

// Terminal Methods
export type CreateTerminalParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  outputByteLimit?: number;
};

export type CreateTerminalResult = {
  _meta?: Record<string, unknown>;
  terminalId: string;
};

export type TerminalOutputParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  terminalId: string;
};

export type TerminalOutputResult = {
  _meta?: Record<string, unknown>;
  output: string;
  truncated: boolean;
  exitStatus?: TerminalExitStatus;
};

export type TerminalExitStatus = {
  exitCode?: number;
  signal?: string;
};

export type KillTerminalParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  terminalId: string;
};

export type KillTerminalResult = {
  _meta?: Record<string, unknown>;
};

export type ReleaseTerminalParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  terminalId: string;
};

export type ReleaseTerminalResult = {
  _meta?: Record<string, unknown>;
};

export type WaitForTerminalExitParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  terminalId: string;
};

export type WaitForTerminalExitResult = {
  _meta?: Record<string, unknown>;
  exitCode?: number;
  signal?: string;
};

// Content
export type TextContent = { type: 'text'; text: string };
export type ImageContent = { type: 'image'; data: string; mimeType: string };
export type ResourceLink = { type: 'resource_link'; uri: string; name: string; mimeType?: string };
export type EmbeddedResource = {
  type: 'resource';
  resource: { uri: string; mimeType?: string; text?: string }
};

export type ContentBlock = TextContent | ImageContent | ResourceLink | EmbeddedResource;

// Prompt
export type PromptParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  prompt: ContentBlock[];
};

export type StopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

export type PromptResult = {
  _meta?: Record<string, unknown>;
  stopReason: StopReason;
};

// Cancel (notification)
export type CancelParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
};

// Session Updates
export type ToolKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'switch_mode' | 'other';
export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type AgentMessageChunk = {
  sessionUpdate: 'agent_message_chunk';
  content: TextContent;
};

export type AgentThoughtChunk = {
  sessionUpdate: 'agent_thought_chunk';
  content: TextContent;
};

// Tool Call Content Types
export type ToolCallContentItem =
  | { type: 'content'; content: ContentBlock }
  | { type: 'diff'; diff: Diff }
  | { type: 'terminal'; terminalId: string };

export type Diff = {
  path: string;
  oldText: string | null;
  newText: string;
};

export type ToolCallLocation = {
  path: string;
  line?: number;
};

// Extended ToolCallUpdate with locations and full content
export type ToolCallUpdate = {
  sessionUpdate: 'tool_call';
  toolCallId: ToolCallId;
  title: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  content?: ToolCallContentItem[];
  locations?: ToolCallLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
};

// Extended ToolCallStatusUpdate
export type ToolCallStatusUpdate = {
  sessionUpdate: 'tool_call_update';
  toolCallId: ToolCallId;
  status?: ToolCallStatus;
  content?: ToolCallContentItem[];
  locations?: ToolCallLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
  title?: string;
  kind?: ToolKind;
};

// Slash Commands
export type AvailableCommand = {
  name: string;
  description: string;
  input?: {
    hint: string;
  };
};

export type AvailableCommandsUpdate = {
  sessionUpdate: 'available_commands_update';
  availableCommands: AvailableCommand[];
};

// Plan Entry Types
export type PlanEntryPriority = 'high' | 'medium' | 'low';
export type PlanEntryStatus = 'pending' | 'in_progress' | 'completed';

export type PlanEntry = {
  content: string;
  priority: PlanEntryPriority;
  status: PlanEntryStatus;
};

export type PlanUpdate = {
  sessionUpdate: 'plan';
  entries: PlanEntry[];
};

// Mode Update
export type CurrentModeUpdate = {
  sessionUpdate: 'current_mode_update';
  currentModeId: string;
};

// User Message Chunk (for streaming user input)
export type UserMessageChunk = {
  sessionUpdate: 'user_message_chunk';
  content: TextContent;
};

// Extended SessionUpdate union
export type SessionUpdate =
  | AgentMessageChunk
  | AgentThoughtChunk
  | ToolCallUpdate
  | ToolCallStatusUpdate
  | AvailableCommandsUpdate
  | PlanUpdate
  | CurrentModeUpdate
  | UserMessageChunk;

export type SessionUpdateParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  update: SessionUpdate;
};

// Permission
export type PermissionOptionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';

export type PermissionOption = {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
};

export type RequestPermissionParams = {
  _meta?: Record<string, unknown>;
  sessionId: SessionId;
  toolCall: {
    toolCallId: ToolCallId;
    title?: string;
    kind?: ToolKind;
    rawInput?: unknown;
  };
  options: PermissionOption[];
};

export type RequestPermissionResult = {
  _meta?: Record<string, unknown>;
  outcome:
    | { outcome: 'cancelled' }
    | { outcome: 'selected'; optionId: string };
};
