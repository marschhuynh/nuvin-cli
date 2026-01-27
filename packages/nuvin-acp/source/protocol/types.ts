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
  protocolVersion: number;
  clientCapabilities?: ClientCapabilities;
  clientInfo?: Implementation;
};

export type InitializeResult = {
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
  cwd: string;
  mcpServers?: McpServerStdio[];
};

export type NewSessionResult = {
  sessionId: SessionId;
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
  sessionId: SessionId;
  prompt: ContentBlock[];
};

export type StopReason = 'end_turn' | 'max_tokens' | 'cancelled' | 'refusal';

export type PromptResult = {
  stopReason: StopReason;
};

// Cancel (notification)
export type CancelParams = {
  sessionId: SessionId;
};

// Session Updates
export type ToolKind = 'read' | 'edit' | 'delete' | 'search' | 'execute' | 'fetch' | 'other';
export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type AgentMessageChunk = {
  sessionUpdate: 'agent_message_chunk';
  content: TextContent;
};

export type AgentThoughtChunk = {
  sessionUpdate: 'agent_thought_chunk';
  content: TextContent;
};

export type ToolCallUpdate = {
  sessionUpdate: 'tool_call';
  toolCallId: ToolCallId;
  title: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  rawInput?: unknown;
};

export type ToolCallStatusUpdate = {
  sessionUpdate: 'tool_call_update';
  toolCallId: ToolCallId;
  status?: ToolCallStatus;
  content?: Array<{ type: 'content'; content: TextContent }>;
  rawOutput?: unknown;
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

export type SessionUpdate =
  | AgentMessageChunk
  | AgentThoughtChunk
  | ToolCallUpdate
  | ToolCallStatusUpdate
  | AvailableCommandsUpdate;

export type SessionUpdateParams = {
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
  outcome:
    | { outcome: 'cancelled' }
    | { outcome: 'selected'; optionId: string };
};
