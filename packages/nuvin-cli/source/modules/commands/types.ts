import type { MemoryPort, Message } from '@nuvin/nuvin-core';
import type { TypedEventBus } from '@/services/EventBus.js';
import type { ConfigScope } from '@/config/types.js';
import type { OrchestratorManager } from '@/services/OrchestratorManager.js';

export type CommandId = string;

export interface BaseCommand {
  id: CommandId;
  description: string;
  category?: 'session' | 'ui' | 'debug' | 'integration' | string;
  keywords?: string[];
  shortcut?: string;
  visible?: (ctx: CommandContext) => boolean;
  initialize?: (ctx: CommandContext) => Promise<void> | void;
  beforeInvoke?: (ctx: CommandContext) => Promise<void> | void;
  afterInvoke?: (ctx: CommandContext) => Promise<void> | void;
  onExit?: (ctx: CommandContext) => Promise<void> | void;
  dispose?: () => void;
}

export interface FunctionCommand extends BaseCommand {
  type: 'function';
  handler: (ctx: CommandContext) => Promise<void> | void;
}

export interface ComponentCommand extends BaseCommand {
  type: 'component';
  component: React.ComponentType<CommandComponentProps>;
  createState?: (ctx: CommandContext) => unknown;
  handler?: (ctx: CommandContext) => Promise<void> | void;
}

export type CommandDefinition = FunctionCommand | ComponentCommand;

export interface CommandContext {
  rawInput: string;
  eventBus: TypedEventBus;
  registry: CommandRegistry;
  config: {
    get: <T>(key: string, scope?: ConfigScope) => T | undefined;
    set: (key: string, value: unknown, scope?: ConfigScope) => Promise<void>;
    delete: (key: string, scope?: ConfigScope) => Promise<void>;
  };
  memory: MemoryPort<Message> | null;
  orchestrator: OrchestratorManager | null;
}

export interface CommandComponentProps {
  context: CommandContext;
  deactivate: () => void;
  isActive: boolean;
}

export interface ActiveCommand {
  command: ComponentCommand;
  context: CommandContext;
  state?: unknown;
}

export interface CommandExecutionResult {
  success: boolean;
  commandId: CommandId;
  error?: Error;
}

export interface CommandRegistry {
  register(command: CommandDefinition): void;
  get(id: CommandId): CommandDefinition | undefined;
  find(predicate: (cmd: CommandDefinition) => boolean): CommandDefinition[];
  list(options?: { includeHidden?: boolean }): CommandDefinition[];
  execute(input: string): Promise<CommandExecutionResult>;
  setActive(commandId: CommandId, context: CommandContext): void;
  clearActive(): void;
  getActive(): ActiveCommand | null;
  isCommandActive(id: CommandId): boolean;
}
