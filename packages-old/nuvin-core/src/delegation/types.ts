import type { AssignParams, SpecialistAgentConfig, SpecialistAgentResult, AgentTemplate } from '../agent-types.js';
import type { ToolExecutionContext } from '../tools/types.js';

export interface AgentCatalog {
  list(): AgentTemplate[];
  get(agentId: string): AgentTemplate | undefined;
}

export interface SpecialistAgentFactoryInput {
  template: AgentTemplate;
  params: AssignParams;
  context?: ToolExecutionContext;
  currentDepth: number;
}

export interface SpecialistAgentFactory {
  create(input: SpecialistAgentFactoryInput): SpecialistAgentConfig | Promise<SpecialistAgentConfig>;
}

export interface AgentCommandRunner {
  run(config: SpecialistAgentConfig, context?: ToolExecutionContext): Promise<SpecialistAgentResult>;
}

export interface DelegationResult {
  success: boolean;
  summary?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface BackgroundDelegationResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface DelegationService {
  setEnabledAgents(enabledAgents: Record<string, boolean>): void;
  listEnabledAgents(): AgentTemplate[];
  delegate(params: AssignParams, context?: ToolExecutionContext): Promise<DelegationResult>;
  delegateBackground?(params: AssignParams, context?: ToolExecutionContext): Promise<BackgroundDelegationResult>;
  getBackgroundResult?(sessionId: string, blocking?: boolean): Promise<DelegationResult | null>;
  isBackgroundAgentRunning?(sessionId: string): boolean;
}
