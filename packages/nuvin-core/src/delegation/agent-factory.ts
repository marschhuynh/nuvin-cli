import * as os from 'node:os';
import { buildInjectedSystem, renderTemplate } from '../prompt-utils.js';
import type { SpecialistAgentConfig } from '../agent-types.js';
import type { SpecialistAgentFactory, SpecialistAgentFactoryInput } from './types.js';
import type { MemoryPort, Message } from '../ports.js';

type SystemContext = {
  timeISO: string;
  platform: NodeJS.Platform;
  arch: string;
  tempDir: string;
  workspaceDir: string;
};

type AgentInfo = {
  id: string;
  name: string;
  description: string;
};

type SystemContextProvider = () => SystemContext;
type AgentListProvider = () => AgentInfo[];

type IdGenerator = (baseId: string) => string;

const defaultSystemContext: SystemContextProvider = () => ({
  timeISO: new Date().toLocaleString(),
  platform: process.platform,
  arch: process.arch,
  tempDir: os.tmpdir?.() ?? '',
  workspaceDir: process.cwd(),
});

const defaultIdGenerator: IdGenerator = (baseId: string) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${baseId}-${timestamp}-${random}`;
};

export class DefaultSpecialistAgentFactory implements SpecialistAgentFactory {
  constructor(
    private readonly options?: {
      systemContextProvider?: SystemContextProvider;
      agentListProvider?: AgentListProvider;
      idGenerator?: IdGenerator;
      createMemoryForAgent?: (agentKey: string) => MemoryPort<Message>;
    },
  ) {}

  async create(input: SpecialistAgentFactoryInput): Promise<SpecialistAgentConfig> {
    const template = input.template;
    const params = input.params;
    const context = input.context;

    const systemContext = this.options?.systemContextProvider?.() ?? defaultSystemContext();
    const availableAgents = this.options?.agentListProvider?.() ?? [];

    const injectedSystem = buildInjectedSystem(
      {
        today: systemContext.timeISO,
        platform: systemContext.platform,
        arch: systemContext.arch,
        tempDir: systemContext.tempDir,
        workspaceDir: systemContext.workspaceDir,
        availableAgents,
      },
      { withSubAgent: false },
    );

    const renderedSystemPrompt = renderTemplate(
      `${template.instructions}
<env>
{{injectedSystem}}
</env>`,
      { injectedSystem },
    );

    const agentType = template.name ?? params.agent;
    const idBase = agentType;

    // Handle session resumption
    let sessionId: string;
    let previousMessages: SpecialistAgentConfig['previousMessages'];

    if (params.resume && this.options?.createMemoryForAgent) {
      // Load previous messages from agent's memory file
      const agentKey = params.resume; // e.g., "code-investigator:abc123"
      const memory = this.options.createMemoryForAgent(agentKey);
      const messages = await memory.get('default');

      if (messages.length > 0) {
        // Session found - reuse session ID and load previous messages
        sessionId = params.resume;
        previousMessages = messages;
      } else {
        // Session not found - generate new ID
        sessionId = this.options?.idGenerator?.(idBase) ?? defaultIdGenerator(idBase);
      }
    } else {
      sessionId = this.options?.idGenerator?.(idBase) ?? defaultIdGenerator(idBase);
    }

    return {
      agentId: sessionId,
      agentName: template.name ?? params.agent,
      agentType,
      taskDescription: params.task,
      instructions: renderedSystemPrompt,
      allowed_tools: template.allowed_tools ?? [],
      provider: template.provider,
      model: template.model,
      temperature: template.temperature,
      max_tokens: template.max_tokens,
      top_p: template.top_p,
      timeout_ms: template.timeout_ms,
      share_context: template.share_context ?? false,
      stream: template.stream ?? true,
      delegatingMemory: undefined,
      delegationDepth: input.currentDepth + 1,
      conversationId: context?.conversationId,
      messageId: context?.messageId,
      toolCallId: typeof context?.toolCallId === 'string' ? context.toolCallId : undefined,
      resumeSessionId: params.resume,
      previousMessages,
    } satisfies SpecialistAgentConfig;
  }
}
