export type JsonPrimitive = boolean | number | string | null;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

export type JsonSchemaType = "array" | "boolean" | "number" | "object" | "string";

export interface JsonSchemaString {
  type: "string";
}

export interface JsonSchemaNumber {
  type: "number";
}

export interface JsonSchemaBoolean {
  type: "boolean";
}

export interface JsonSchemaArray<TItem extends JsonSchema = JsonSchema> {
  type: "array";
  items: TItem;
}

export interface JsonSchemaObject<
  TProperties extends Record<string, JsonSchema> = Record<string, JsonSchema>,
  TRequired extends readonly string[] | undefined = readonly string[] | undefined,
> {
  type: "object";
  properties: TProperties;
  required?: TRequired;
}

export type JsonSchema =
  | JsonSchemaArray
  | JsonSchemaBoolean
  | JsonSchemaNumber
  | JsonSchemaObject
  | JsonSchemaString;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface AnthropicThinkingBlock {
  type: "anthropic_thinking";
  thinking: string;
  signature: string;
}

export interface AnthropicRedactedThinkingBlock {
  type: "anthropic_redacted_thinking";
  data: string;
}

export interface OpenAiReasoningSummaryText {
  type: "summary_text";
  text: string;
}

export interface OpenAiReasoningBlock {
  type: "openai_reasoning";
  encryptedContent?: string;
  id?: string;
  summary: OpenAiReasoningSummaryText[];
  text?: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: JsonValue;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: JsonValue | string;
  is_error: boolean;
}

export interface AnthropicThinkingWireBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface AnthropicRedactedThinkingWireBlock {
  type: "redacted_thinking";
  data: string;
}

export type AnthropicAssistantContentBlock =
  | AnthropicRedactedThinkingWireBlock
  | AnthropicThinkingWireBlock
  | TextBlock
  | ToolUseBlock;

export type ReasoningVisibility = "continuity-only" | "user-visible";

export type AutoReasoningEffort = "low" | "medium" | "high";

export interface AutoReasoningConfig {
  effort: AutoReasoningEffort;
}

export type AnthropicThinkingDisplay = "omitted" | "summarized";
export type AnthropicThinkingEffort = "low" | "medium" | "high";

export interface AnthropicEnabledThinkingConfig {
  type: "enabled";
  budgetTokens: number;
  display?: AnthropicThinkingDisplay;
  interleaved?: boolean;
}

export interface AnthropicAdaptiveThinkingConfig {
  type: "adaptive";
  display?: AnthropicThinkingDisplay;
  effort?: AnthropicThinkingEffort;
  interleaved?: boolean;
}

export interface AnthropicDisabledThinkingConfig {
  type: "disabled";
}

export type AnthropicThinkingConfig =
  | AnthropicAdaptiveThinkingConfig
  | AnthropicDisabledThinkingConfig
  | AnthropicEnabledThinkingConfig;

export type OpenAiReasoningEffort = "high" | "low" | "medium" | "minimal" | "none" | "xhigh";

export type OpenAiReasoningSummary = "auto" | "concise" | "detailed";

export interface OpenAiReasoningConfig {
  effort?: OpenAiReasoningEffort;
  includeEncryptedContent?: boolean;
  summary?: OpenAiReasoningSummary;
}

export interface ReasoningConfig {
  auto?: AutoReasoningConfig;
  anthropic?: AnthropicThinkingConfig;
  openai?: OpenAiReasoningConfig;
  visibility?: ReasoningVisibility;
}

export interface MessageProviderState {
  anthropicAssistantContent?: AnthropicAssistantContentBlock[];
  openaiResponsesOutput?: OpenAiResponsesOutputItem[];
  openaiResponsesResponseId?: string;
}

export type AssistantContentBlock =
  | AnthropicRedactedThinkingBlock
  | AnthropicThinkingBlock
  | OpenAiReasoningBlock
  | TextBlock
  | ToolUseBlock;

export type ContentBlock = AssistantContentBlock | ToolResultBlock;

export type ContentInput = ContentBlock[] | string | null | undefined;
export type MessageRole = "assistant" | "user";
export type SystemInput = TextBlock[] | string | null | undefined;

export interface Message {
  id?: string;
  role: MessageRole;
  content: ContentBlock[];
  providerState?: MessageProviderState;
}

export interface IdentifiedMessage extends Message {
  id: string;
}

export interface MessageInput {
  id?: string;
  role: MessageRole;
  content?: ContentInput;
  providerState?: MessageProviderState;
}

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: JsonSchemaObject;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens?: number;
}

export interface ModelRequest {
  model: string;
  max_tokens: number;
  reasoning?: ReasoningConfig;
  system: TextBlock[];
  messages: Message[];
  tools: ToolSchema[];
  metadata: {
    session_id: string;
    turn_id: string;
  };
}

export interface ModelResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AssistantContentBlock[];
  stop_reason: "end_turn" | "tool_use";
  stop_sequence: null | string;
  usage: Usage;
  providerState?: MessageProviderState;
}

export interface ChatRequest {
  model: string;
  maxTokens: number;
  reasoning?: ReasoningConfig;
  system: TextBlock[];
  messages: Message[];
  tools: ToolSchema[];
  metadata: {
    sessionId: string;
    turnId: string;
  };
}

export interface ChatResponse {
  id: string;
  content: AssistantContentBlock[];
  stopReason: "end_turn" | "tool_use";
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
  };
  providerState?: MessageProviderState;
}

export interface ContentDeltaChunk {
  type: "content_delta";
  index?: number;
  text?: string;
}

export interface ToolUseDeltaChunk {
  type: "tool_use_delta";
  id: string;
  index: number;
  inputDelta?: string;
  name?: string;
}

export interface AnthropicThinkingDeltaChunk {
  type: "anthropic_thinking_delta";
  index: number;
  thinking: string;
}

export interface AnthropicSignatureDeltaChunk {
  type: "anthropic_signature_delta";
  index: number;
  signature: string;
}

export interface OpenAiReasoningDeltaChunk {
  type: "openai_reasoning_delta";
  contentIndex: number;
  delta: string;
  itemId: string;
  outputIndex: number;
}

export interface OpenAiReasoningSummaryDeltaChunk {
  type: "openai_reasoning_summary_delta";
  delta: string;
  itemId: string;
  outputIndex: number;
  summaryIndex: number;
}

export interface ChatResponseChunk {
  type:
    | "anthropic_signature_delta"
    | "anthropic_thinking_delta"
    | "content_delta"
    | "done"
    | "openai_reasoning_delta"
    | "openai_reasoning_summary_delta"
    | "tool_use_delta";
  contentIndex?: number;
  delta?: string;
  index?: number;
  itemId?: string;
  outputIndex?: number;
  signature?: string;
  summaryIndex?: number;
  text?: string;
  thinking?: string;
  inputDelta?: string;
  name?: string;
  id?: string;
  response?: ChatResponse;
}

export interface ModelLimits {
  contextWindow?: number;
  maxOutput?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  limits?: ModelLimits;
  supportedEndpoints?: string[];
}

export interface ToolResultMeta {
  truncated?: boolean;
  originalBytes?: number;
  transforms: string[];
}

export interface ToolResultChunk {
  output: string;
  structured: JsonObject;
}

export interface ToolOutputEnvelope {
  output: string;
  structured?: JsonObject;
}

export interface ToolResult {
  callId: string;
  toolName: string;
  status: "error" | "ok";
  output: string;
  structured: JsonObject;
  chunks: ToolResultChunk[];
  meta: ToolResultMeta;
}

export interface TurnInput {
  sessionId: string;
  turnId: string;
  streaming?: boolean;
  signal?: AbortSignal;
  system?: SystemInput;
  messages?: MessageInput[];
  message: MessageInput;
}

export interface TurnState {
  sessionId: string;
  turnId: string;
  system: TextBlock[];
  messages: Message[];
  lastResponse?: ChatResponse;
  toolResults: ToolResult[];
  finalMessage?: IdentifiedMessage;
}

export type TurnResultStatus = "completed" | "aborted";

export interface TurnResult {
  status: TurnResultStatus;
  finalMessage?: IdentifiedMessage;
  state: TurnState;
}

export type ProviderCredentialKind = "api-key" | "oauth-token" | "session-token";

export interface ProviderCredential {
  kind: ProviderCredentialKind;
  value: string;
}

export interface ProviderEndpoints {
  api?: string;
  originTracker?: string;
  proxy?: string;
  telemetry?: string;
}

export interface ResolvedProviderSession {
  credential: ProviderCredential;
  endpoints?: ProviderEndpoints;
  metadata?: Record<string, string>;
}

export interface ProviderSessionResolver {
  resolve(signal?: AbortSignal): Promise<ResolvedProviderSession>;
}

export interface PrepareRequestInput {
  sessionId: string;
  turnId: string;
  reasoning?: ReasoningConfig;
  system: TextBlock[];
  messages: Message[];
  tools: ToolSchema[];
  maxTokens?: number;
}

export interface PreparedRequest {
  request: ModelRequest;
  session?: ResolvedProviderSession;
}

export type ProviderRequestMutator = (
  preparedRequest: PreparedRequest,
) => PreparedRequest | Promise<PreparedRequest>;

export interface ChatModel {
  prepareRequest(request: PrepareRequestInput): ModelRequest;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface ModelExecutionOptions {
  signal?: AbortSignal;
}

export interface EngineChatModel {
  model: string;
  maxTokens?: number;
  complete(request: ChatRequest, options?: ModelExecutionOptions): Promise<ChatResponse>;
  stream?(request: ChatRequest, options?: ModelExecutionOptions): AsyncIterable<ChatResponseChunk>;
  getModels?(signal?: AbortSignal): Promise<ModelInfo[]>;
}

export interface BaseChatModelOptions {
  model: string;
  maxTokens?: number;
  reasoning?: ReasoningConfig;
  providerSessionResolver?: ProviderSessionResolver;
  requestMutators?: ProviderRequestMutator[];
}

export interface AgentEventContext {
  sessionId: string;
  turnId: string;
  state: TurnState;
}

export interface ToolExecutionContext extends AgentEventContext {
  signal: AbortSignal;
  toolCallId?: string;
}

export interface ToolRuntimeStartedEvent {
  type: "tool_started";
  toolCall: ToolUseBlock;
}

export interface ToolRuntimeOutputChunkEvent {
  type: "tool_output_chunk";
  toolCall: ToolUseBlock;
  chunk: ToolResultChunk;
}

export interface ToolRuntimeCompletedEvent {
  type: "tool_completed";
  toolCall: ToolUseBlock;
  result: ToolResult;
}

export interface ToolRuntimeRejectedEvent {
  type: "tool_rejected";
  toolCall: ToolUseBlock;
  result: ToolResult;
}

export type ToolRuntimeEvent =
  | ToolRuntimeOutputChunkEvent
  | ToolRuntimeCompletedEvent
  | ToolRuntimeRejectedEvent
  | ToolRuntimeStartedEvent;

export interface AgentUserMessageEvent {
  type: "user_message";
  message: Message;
}

export interface AgentModelRequestEvent {
  type: "model_request";
  request: ChatRequest;
}

export interface AgentModelResponseEvent {
  type: "model_response";
  response: ChatResponse;
}

export interface AgentAssistantMessageEvent {
  type: "assistant_message";
  message: IdentifiedMessage;
}

export interface AgentAssistantChunkEvent {
  type: "assistant_chunk";
  index: number;
  messageId: string;
  chunk: ContentDeltaChunk;
}

export interface AgentToolUseMessageEvent {
  type: "tool_use_message";
  message: IdentifiedMessage;
}

export interface AgentToolUseChunkEvent {
  type: "tool_use_chunk";
  index: number;
  messageId: string;
  chunk: ToolUseDeltaChunk;
}

export interface AgentReasoningMessageEvent {
  type: "reasoning_message";
  message: IdentifiedMessage;
}

export interface AgentReasoningChunkEvent {
  type: "reasoning_chunk";
  index: number;
  messageId: string;
  chunk: AnthropicThinkingDeltaChunk | OpenAiReasoningDeltaChunk | OpenAiReasoningSummaryDeltaChunk;
  text: string;
}

export interface AgentToolCallEvent {
  type: "tool_call";
  toolCall: ToolUseBlock;
}

export interface AgentToolResultEvent {
  type: "tool_result";
  result: ToolResult;
}

export interface AgentToolResultMessageEvent {
  type: "tool_result_message";
  message: Message;
}

export interface AgentFinalMessageEvent {
  type: "final_message";
  message: IdentifiedMessage;
}

export interface AgentTurnCompleteEvent {
  type: "turn_complete";
  state: TurnState;
}

export type AgentLifecycleEvent =
  | AgentAssistantChunkEvent
  | AgentAssistantMessageEvent
  | AgentFinalMessageEvent
  | AgentModelRequestEvent
  | AgentModelResponseEvent
  | AgentReasoningChunkEvent
  | AgentReasoningMessageEvent
  | AgentToolCallEvent
  | AgentToolUseChunkEvent
  | AgentToolUseMessageEvent
  | AgentToolResultEvent
  | AgentToolResultMessageEvent
  | AgentTurnCompleteEvent
  | AgentUserMessageEvent;

export type AgentEvent = AgentLifecycleEvent | ToolRuntimeEvent;

export type ToolRuntimeDispatchDecision =
  | {
      action: "reject";
      reason?: string;
    }
  | {
      action: "run";
    };

export type ToolRuntimeToolCallHandler = (
  toolCall: ToolUseBlock,
  ctx: ToolExecutionContext,
) => Promise<ToolRuntimeDispatchDecision | undefined> | ToolRuntimeDispatchDecision | undefined;

export type ToolRuntimeEventHandler = (
  event: ToolRuntimeEvent,
  ctx: ToolExecutionContext,
) => Promise<void> | void;

export type AgentEventHandler = (event: AgentEvent, ctx: AgentEventContext) => Promise<void> | void;

export interface ToolRuntime {
  listToolSchemas(): ToolSchema[];
  executeCalls(toolCalls: ToolUseBlock[], ctx: ToolExecutionContext): Promise<ToolResult[]>;
  execute(toolCall: ToolUseBlock, ctx: ToolExecutionContext): Promise<ToolResult>;
}

export type InferJsonSchema<TSchema extends JsonSchema> = TSchema extends JsonSchemaString
  ? string
  : TSchema extends JsonSchemaNumber
    ? number
    : TSchema extends JsonSchemaBoolean
      ? boolean
      : TSchema extends JsonSchemaArray<infer TItem>
        ? InferJsonSchema<TItem>[]
        : TSchema extends JsonSchemaObject<infer TProperties, infer TRequired>
          ? Expand<
              RequiredProperties<TProperties, TRequired> &
                OptionalProperties<TProperties, TRequired>
            >
          : never;

type Expand<TValue> = TValue extends infer TObject
  ? { [TKey in keyof TObject]: TObject[TKey] }
  : never;

type RequiredKeyUnion<TRequired extends readonly string[] | undefined> =
  TRequired extends readonly string[] ? TRequired[number] : never;

type OptionalKeyUnion<
  TProperties extends Record<string, JsonSchema>,
  TRequired extends readonly string[] | undefined,
> = Exclude<keyof TProperties, RequiredKeyUnion<TRequired>>;

type RequiredProperties<
  TProperties extends Record<string, JsonSchema>,
  TRequired extends readonly string[] | undefined,
> = {
  [TKey in Extract<keyof TProperties, RequiredKeyUnion<TRequired>>]: InferJsonSchema<
    TProperties[TKey]
  >;
};

type OptionalProperties<
  TProperties extends Record<string, JsonSchema>,
  TRequired extends readonly string[] | undefined,
> = {
  [TKey in OptionalKeyUnion<TProperties, TRequired>]?: InferJsonSchema<TProperties[TKey]>;
};

export type ToolOutputValue = JsonValue | ToolOutputEnvelope;
export type ToolGenerator<
  TYield extends ToolOutputValue = ToolOutputValue,
  TReturn extends ToolOutputValue | undefined = ToolOutputValue | undefined,
> = AsyncGenerator<TYield, TReturn, void>;

export interface ToolDefinition<
  TInput extends JsonObject = JsonObject,
  TYield extends ToolOutputValue = ToolOutputValue,
  TReturn extends ToolOutputValue | undefined = ToolOutputValue | undefined,
  TSchema extends JsonSchemaObject = JsonSchemaObject,
> {
  name: string;
  description: string;
  inputSchema: TSchema;
  execute(input: TInput, ctx: ToolExecutionContext): ToolGenerator<TYield, TReturn>;
}

export type AnyToolDefinition = ToolDefinition<
  JsonObject,
  ToolOutputValue,
  ToolOutputValue | undefined,
  JsonSchemaObject
>;

export type Stage =
  | "afterModelResponse"
  | "afterToolResult"
  | "afterTurnComplete"
  | "beforeAssistantAppend"
  | "beforeFinalOutput"
  | "beforeModelRequest"
  | "beforeToolExecution"
  | "beforeToolResultAppend"
  | "onUserMessage";

export interface PayloadByStage {
  onUserMessage: Message;
  beforeModelRequest: ChatRequest;
  afterModelResponse: ChatResponse;
  beforeToolExecution: ToolUseBlock;
  afterToolResult: ToolResult;
  beforeAssistantAppend: Message;
  beforeFinalOutput: Message;
  beforeToolResultAppend: Message;
  afterTurnComplete: TurnState;
}

export interface ExtensionContext {
  state: TurnState;
}

export type Transformer<S extends Stage> = (
  payload: PayloadByStage[S],
  ctx: ExtensionContext,
) => PayloadByStage[S] | Promise<PayloadByStage[S]>;

export type Observer<S extends Stage> = (
  payload: PayloadByStage[S],
  ctx: ExtensionContext,
) => Promise<void> | void;

export interface TransformerExtensionRegistration<S extends Stage = Stage> {
  id: string;
  stage: S;
  kind: "transformer";
  order: number;
  enabled: boolean;
  run: Transformer<S>;
}

export interface ObserverExtensionRegistration<S extends Stage = Stage> {
  id: string;
  stage: S;
  kind: "observer";
  order: number;
  enabled: boolean;
  run: Observer<S>;
}

export type ExtensionRegistration<S extends Stage = Stage> =
  | ObserverExtensionRegistration<S>
  | TransformerExtensionRegistration<S>;

export type AnyExtensionRegistration = {
  [S in Stage]: ExtensionRegistration<S>;
}[Stage];

export interface ExtensionRegistry {
  register(extension: AnyExtensionRegistration): void;
  runTransformers<S extends Stage>(
    stage: S,
    payload: PayloadByStage[S],
    ctx: ExtensionContext,
  ): Promise<PayloadByStage[S]>;
  runObservers<S extends Stage>(
    stage: S,
    payload: PayloadByStage[S],
    ctx: ExtensionContext,
  ): Promise<void>;
}

export interface RunTurnDeps {
  registry: ExtensionRegistry;
  chatModel: EngineChatModel;
  toolRuntime: ToolRuntime;
  onEvent?: AgentEventHandler;
}

export type AgentInput = MessageInput | string;

export interface AgentSendOptions {
  streaming?: boolean;
  signal?: AbortSignal;
}

export interface AgentOptions {
  sessionId?: string;
  systemPrompt?: string;
  messages?: MessageInput[];
  message?: AgentInput;
  onEvent?: AgentEventHandler;
  onToolCall?: ToolRuntimeToolCallHandler;
  registry?: ExtensionRegistry;
  extensions?: AnyExtensionRegistration[];
  chatModel?: EngineChatModel;
  tools?: AnyToolDefinition[];
}

export interface AgentDefinitionFactoryContext {
  agentId: string;
  parentSessionId?: string;
  runId?: string;
  toolCallId?: string;
}

export interface AgentDefinition {
  id: string;
  description?: string;
  enabled?: boolean;
  allowedChildAgentIds?: string[];
  createOptions(ctx?: AgentDefinitionFactoryContext): AgentOptions;
}

export type ManagedRunStatus = "aborted" | "completed" | "failed" | "idle" | "running";

export interface ManagedRunError {
  message: string;
}

export interface ManagedAgentRun {
  runId: string;
  agentId: string;
  sessionId: string;
  status: ManagedRunStatus;
  depth: number;
  parentRunId?: string;
  originToolCallId?: string;
  result?: TurnResult;
  error?: ManagedRunError;
}

export interface ManagedAgentRunHandle {
  readonly runId: string;
  readonly agentId: string;
  readonly sessionId: string;
  send(input: AgentInput, options?: AgentSendOptions): Promise<TurnResult>;
  snapshot(): ManagedAgentRun;
  wait(signal?: AbortSignal): Promise<ManagedAgentRun>;
}

export interface ManagedRunEvent {
  runId: string;
  agentId: string;
  sessionId: string;
  parentRunId?: string;
  originToolCallId?: string;
  event: AgentEvent;
}

export type ManagedRunEventHandler = (event: ManagedRunEvent) => Promise<void> | void;

export interface RuntimeManagerOptions {
  onEvent?: ManagedRunEventHandler;
}

export interface CreateManagedRunInput {
  agentId: string;
  parentRunId?: string;
  originToolCallId?: string;
}

export interface CompileRequestInput {
  sessionId: string;
  turnId: string;
  reasoning?: ReasoningConfig;
  system?: SystemInput;
  messages: MessageInput[];
  tools?: ToolSchema[];
  model?: string;
  max_tokens?: number;
}

export interface OpenAiInputText {
  type: "input_text";
  text: string;
}

export interface OpenAiInputMessage {
  type: "message";
  role: MessageRole;
  content: OpenAiInputText[];
}

export interface OpenAiFunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

export interface OpenAiFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export interface OpenAiOutputTextPart {
  type: "output_text";
  text: string;
}

export interface OpenAiRefusalPart {
  type: "refusal";
  refusal: string;
}

export interface OpenAiOutputMessage {
  type: "message";
  content?: Array<OpenAiOutputTextPart | OpenAiRefusalPart>;
  role?: string;
  status?: string;
}

export interface OpenAiReasoningOutputItem {
  type: "reasoning";
  content?: Array<{
    text?: string;
    type?: string;
  }>;
  encrypted_content?: string;
  id?: string;
  status?: string;
  summary?: OpenAiReasoningSummaryText[];
  text?: string;
}

export type OpenAiResponsesOutputItem =
  | JsonObject
  | OpenAiFunctionCall
  | OpenAiOutputMessage
  | OpenAiReasoningOutputItem;

export interface OpenAiResponsesReasoningParam {
  effort?: OpenAiReasoningEffort;
  generate_summary?: OpenAiReasoningSummary;
  summary?: OpenAiReasoningSummary;
}

export interface OpenAiFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}

export interface OpenAiResponsesRequest {
  include?: string[];
  model: string;
  instructions: string;
  input: Array<
    OpenAiFunctionCall | OpenAiFunctionCallOutput | OpenAiInputMessage | OpenAiResponsesOutputItem
  >;
  max_output_tokens?: number;
  reasoning?: OpenAiResponsesReasoningParam;
  tools: OpenAiFunctionTool[];
}
