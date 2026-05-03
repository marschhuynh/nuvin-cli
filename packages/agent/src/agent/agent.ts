import { normalizeMessage } from "../formats/message-format.ts";
import type {
  AgentInput,
  AgentOptions,
  AgentSendOptions,
  EngineChatModel,
  ExtensionRegistry,
  Message,
  RunTurnDeps,
  TurnResult,
} from "../shared/types.ts";
import { createInternalToolRuntime } from "../tools/internal-tool-runtime.ts";
import { createExtensionRegistry } from "./extension-registry.ts";
import { runTurn } from "./turn-engine.ts";

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function createTurnId(index: number): string {
  return `turn-${index}`;
}

function createDefaultMessage(message: AgentOptions["message"]): Message | undefined {
  if (message === undefined) {
    return undefined;
  }

  return normalizeUserInput(message);
}

function normalizeUserInput(input: AgentInput): Message {
  if (typeof input === "string") {
    return {
      role: "user",
      content: [
        {
          type: "text",
          text: input,
        },
      ],
    };
  }

  return normalizeMessage(input);
}

function resolveChatModel(options: AgentOptions): EngineChatModel {
  if (!options.chatModel) {
    throw new Error("Agent requires a chatModel");
  }

  return options.chatModel;
}

function createRegistry(options: AgentOptions): ExtensionRegistry {
  if (options.registry) {
    return options.registry;
  }

  const registry = createExtensionRegistry();
  const extensions = options.extensions ?? [];

  for (const extension of extensions) {
    registry.register(extension);
  }

  return registry;
}

export class Agent {
  public readonly deps: RunTurnDeps;
  public readonly sessionId: string;
  public readonly systemPrompt: string;
  public messages: Message[];
  public readonly defaultMessage?: Message;
  public turnIndex: number;

  constructor(options: AgentOptions = {}) {
    this.sessionId = options.sessionId ?? createSessionId();
    this.turnIndex = 0;
    this.systemPrompt = options.systemPrompt ?? "";
    this.messages = (options.messages ?? []).map(normalizeMessage);
    this.defaultMessage = createDefaultMessage(options.message);

    const toolRuntime = createInternalToolRuntime(options.tools ?? [], {
      onEvent: options.onEvent,
      onToolCall: options.onToolCall,
    });

    this.deps = {
      registry: createRegistry(options),
      chatModel: resolveChatModel(options),
      toolRuntime,
      onEvent: options.onEvent,
    };
  }

  async send(
    input: AgentInput | undefined = this.defaultMessage,
    options: AgentSendOptions = {},
  ): Promise<TurnResult> {
    if (!input) {
      throw new Error("Agent.send requires a message when no default message is configured");
    }

    this.turnIndex += 1;

    const result = await runTurn(
      {
        sessionId: this.sessionId,
        turnId: createTurnId(this.turnIndex),
        streaming: options.streaming,
        signal: options.signal,
        system: this.systemPrompt,
        messages: this.messages,
        message: normalizeUserInput(input),
      },
      this.deps,
    );

    this.messages = result.state.messages.map(normalizeMessage);
    return result;
  }
}
