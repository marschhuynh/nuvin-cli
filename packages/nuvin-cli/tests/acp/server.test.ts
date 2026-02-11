import { describe, it, expect, vi } from 'vitest';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { AcpServer } from '../../source/acp/server.js';
import { commandRegistry } from '../../source/modules/commands/registry.js';
import { TypedEventBus } from '../../source/services/EventBus.js';

const mockTransport = {
  send: vi.fn(),
};

const mockOrchestrator = {
  init: vi.fn(),
  send: vi.fn().mockResolvedValue({ id: 'msg', content: 'ok', role: 'assistant', timestamp: new Date().toISOString() }),
  getConfig: vi.fn(),
  getAvailableProviders: vi.fn().mockReturnValue(['echo', 'zai']),
  getAvailableModels: vi.fn().mockImplementation(async (provider?: string) => {
    if (provider === 'echo') return ['echo-model'];
    if (provider === 'zai') return ['glm-4.7'];
    return [];
  }),
  getAvailableAgents: vi.fn().mockReturnValue([
    { agentId: 'main', name: 'Default', description: 'Nuvin default agent behavior' },
    { agentId: 'code-reviewer', name: 'code-reviewer', description: 'Review code quality and correctness.' },
  ]),
  getActiveAgentId: vi.fn().mockReturnValue('main'),
  swapToMain: vi.fn().mockResolvedValue(undefined),
  swapToAgent: vi.fn().mockResolvedValue(undefined),
  updateConfig: vi.fn(),
  getStatus: vi.fn(),
  getSession: vi.fn().mockReturnValue({ sessionId: 'sess_1', sessionDir: '/tmp/sess_1' }),
  createNewConversation: vi.fn().mockResolvedValue({ sessionId: 'sess_1', sessionDir: '/tmp/sess_1', memory: {} }),
};

describe('AcpServer', () => {
  it('responds to initialize with protocolVersion and capabilities', async () => {
    const server = new AcpServer({ transport: mockTransport, orchestratorManager: mockOrchestrator as never });
    const result = await server.handleInitialize({ protocolVersion: 1, clientCapabilities: {} });
    expect(result.protocolVersion).toBe(1);
    expect(result.agentCapabilities).toBeDefined();
    expect(result.agentCapabilities.promptCapabilities).toEqual({
      image: true,
      audio: false,
    });
    expect(result.agentCapabilities.sessionCapabilities).toEqual({
      loadSession: true,
      list: {},
      configureSession: {
        userConfigurable: {
          model: true,
          modes: true,
          modelReasoningEffort: false,
          configOptions: true,
        },
      },
      auth: {
        supportsAuthChange: false,
      },
    });
  });

  it('emits descriptive tool call titles', async () => {
    const sent: any[] = [];
    const eventBus = new TypedEventBus();
    const server = new AcpServer({
      transport: { send: (message) => sent.push(message) },
      orchestratorManager: mockOrchestrator as never,
      eventBus,
    });

    await server.handleInitialize({ protocolVersion: 1, clientCapabilities: {} });
    await server.handleSessionNew({ cwd: process.cwd(), mcpServers: [] });

    eventBus.emit('agent:event', {
      type: AgentEventTypes.ToolCalls,
      conversationId: 'default',
      messageId: 'msg-1',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'bash_tool',
            arguments: JSON.stringify({ cmd: 'git status --short' }),
          },
        },
      ],
    } as never);

    const update = sent.find((message) => message?.method === 'session/update');
    expect(update?.params?.update?.sessionUpdate).toBe('tool_call');
    expect(update?.params?.update?.title).toContain('Command');
    expect(update?.params?.update?.title).toContain('git status --short');
  });

  it('returns dynamic modes in session/new payload', async () => {
    const server = new AcpServer({ transport: mockTransport, orchestratorManager: mockOrchestrator as never });

    const result = (await server.handleSessionNew({ cwd: process.cwd(), mcpServers: [] })) as Record<string, unknown>;
    expect(result).toHaveProperty('modes');
    expect(result).not.toHaveProperty('agents');

    expect(result.modes).toEqual({
      currentModeId: 'main',
      availableModes: [
        { id: 'main', name: 'Default', description: 'Nuvin default agent behavior' },
        { id: 'code-reviewer', name: 'code-reviewer', description: 'Review code quality and correctness.' },
      ],
    });
  });

  it('returns paginated sessions for session/list', async () => {
    const server = new AcpServer({ transport: mockTransport, orchestratorManager: mockOrchestrator as never });
    const fakeSessions = Array.from({ length: 55 }, (_, i) => ({
      sessionId: `s${i}`,
      cwd: '/tmp/work',
      title: `Session ${i}`,
      updatedAt: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
    vi.spyOn(server as any, 'listPersistedSessions').mockReturnValue(fakeSessions);

    const first = (await server.handleSessionList({ cwd: '/tmp/work' })) as {
      sessions: Array<{ sessionId: string }>;
      nextCursor: string | null;
    };
    expect(first.sessions).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();

    const second = (await server.handleSessionList({
      cwd: '/tmp/work',
      cursor: first.nextCursor ?? undefined,
    })) as {
      sessions: Array<{ sessionId: string }>;
      nextCursor: string | null;
    };
    expect(second.sessions).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
  });

  it('emits available_commands_update after session/new', async () => {
    const sent: any[] = [];
    const listSpy = vi.spyOn(commandRegistry, 'list').mockReturnValue([
      { id: '/clear', type: 'function', description: 'Clear messages', handler: vi.fn() } as never,
    ]);

    const server = new AcpServer({
      transport: { send: (message) => sent.push(message) },
      orchestratorManager: mockOrchestrator as never,
    });

    await server.handleInitialize({ protocolVersion: 1, clientCapabilities: {} });
    await server.handleSessionNew({ cwd: process.cwd(), mcpServers: [] });
    server.flushDeferredUpdates();

    const commandsUpdate = sent.find(
      (message) => message?.method === 'session/update' && message?.params?.update?.sessionUpdate === 'available_commands_update',
    );
    expect(commandsUpdate?.params?.update?.availableCommands).toEqual([
      { name: 'clear', description: 'Clear messages' },
    ]);

    listSpy.mockRestore();
  });

  it('handles slash command prompts via command registry without forwarding to orchestrator', async () => {
    const sent: any[] = [];
    const getSpy = vi.spyOn(commandRegistry, 'get').mockReturnValue({
      id: '/clear',
      type: 'function',
      description: 'Clear messages',
      handler: vi.fn(),
    } as never);
    const executeSpy = vi
      .spyOn(commandRegistry, 'execute')
      .mockResolvedValue({ success: true, commandId: '/clear' });

    const localOrchestrator = {
      ...mockOrchestrator,
      send: vi.fn().mockResolvedValue({ id: 'msg', content: 'ok', role: 'assistant', timestamp: new Date().toISOString() }),
    };

    const server = new AcpServer({
      transport: { send: (message) => sent.push(message) },
      orchestratorManager: localOrchestrator as never,
    });

    await server.handleInitialize({ protocolVersion: 1, clientCapabilities: {} });
    const created = (await server.handleSessionNew({ cwd: process.cwd(), mcpServers: [] })) as { sessionId: string };
    const result = await server.handleSessionPrompt({
      sessionId: created.sessionId,
      prompt: [{ type: 'text', text: '/clear' }],
    });

    expect(result).toEqual({ stopReason: 'end_turn' });
    expect(executeSpy).toHaveBeenCalledWith('/clear');
    expect(localOrchestrator.send).not.toHaveBeenCalled();

    const commandAck = sent.find(
      (message) => message?.method === 'session/update' && message?.params?.update?.sessionUpdate === 'agent_message_chunk',
    );
    expect(commandAck?.params?.update?.content?.text ?? '').toContain('Command /clear executed');

    getSpy.mockRestore();
    executeSpy.mockRestore();
  });

  it('responds with available commands when slash command is unknown', async () => {
    const sent: any[] = [];
    const getSpy = vi.spyOn(commandRegistry, 'get').mockReturnValue(undefined);
    const listSpy = vi.spyOn(commandRegistry, 'list').mockReturnValue([
      { id: '/clear', type: 'function', description: 'Clear messages', handler: vi.fn() } as never,
    ]);

    const localOrchestrator = {
      ...mockOrchestrator,
      send: vi.fn().mockResolvedValue({ id: 'msg', content: 'ok', role: 'assistant', timestamp: new Date().toISOString() }),
    };

    const server = new AcpServer({
      transport: { send: (message) => sent.push(message) },
      orchestratorManager: localOrchestrator as never,
    });

    await server.handleInitialize({ protocolVersion: 1, clientCapabilities: {} });
    const created = (await server.handleSessionNew({ cwd: process.cwd(), mcpServers: [] })) as { sessionId: string };
    const result = await server.handleSessionPrompt({
      sessionId: created.sessionId,
      prompt: [{ type: 'text', text: '/init' }],
    });

    expect(result).toEqual({ stopReason: 'end_turn' });
    expect(localOrchestrator.send).not.toHaveBeenCalled();

    const messageUpdate = sent.find(
      (message) => message?.method === 'session/update' && message?.params?.update?.sessionUpdate === 'agent_message_chunk',
    );
    expect(messageUpdate?.params?.update?.content?.text ?? '').toContain('Command /init is not supported by Nuvin.');
    expect(messageUpdate?.params?.update?.content?.text ?? '').toContain('/clear');

    getSpy.mockRestore();
    listSpy.mockRestore();
  });

  it('returns model options aggregated from all available providers', async () => {
    const server = new AcpServer({ transport: mockTransport, orchestratorManager: mockOrchestrator as never });
    const result = (await server.handleSessionNew({ cwd: process.cwd(), mcpServers: [] })) as {
      configOptions?: Array<{ id: string; options: Array<{ value: string }> }>;
    };

    const modelOption = result.configOptions?.find((option) => option.id === 'model');
    expect(modelOption).toBeDefined();

    const modelIds = modelOption?.options.map((option) => option.value) ?? [];
    expect(modelIds).toContain('echo-model');
    expect(modelIds).toContain('glm-4.7');

    const models = (result as { models?: { availableModels: Array<{ modelId: string; description?: string }> } }).models
      ?.availableModels;
    const byId = new Map((models ?? []).map((model) => [model.modelId, model.description ?? '']));
    expect(byId.get('echo-model')).toContain('echo');
    expect(byId.get('glm-4.7')).toContain('zai');
  });

  it('filters endpoint-style model paths such as /models from ACP model options', async () => {
    const configState: any = {
      activeProvider: 'nvidia',
      model: '/models',
      requireToolApproval: true,
      thinking: 'MEDIUM',
      session: { memPersist: true },
      providers: {
        nvidia: {
          model: 'openai/gpt-oss-120b',
          defaultModel: 'openai/gpt-oss-120b',
          models: '/models',
        },
      },
    };

    const localOrchestrator = {
      ...mockOrchestrator,
      getAvailableProviders: vi.fn().mockReturnValue(['nvidia']),
      getAvailableModels: vi.fn().mockResolvedValue([]),
    };

    const server = new AcpServer({
      transport: mockTransport,
      orchestratorManager: localOrchestrator as never,
      configManager: {
        getConfig: () => configState,
        loadConfig: (next: Record<string, unknown>) => Object.assign(configState, next),
      } as never,
    });

    const result = (await server.handleSessionNew({ cwd: process.cwd(), mcpServers: [] })) as {
      models: { currentModelId: string; availableModels: Array<{ modelId: string }> };
      configOptions: Array<{ id: string; options: Array<{ value: string }> }>;
    };

    expect(result.models.currentModelId).not.toBe('/models');
    expect(result.models.availableModels.map((m) => m.modelId)).not.toContain('/models');
    const modelOption = result.configOptions.find((option) => option.id === 'model');
    expect(modelOption?.options.map((option) => option.value)).not.toContain('/models');
  });

  it('disambiguates duplicate humanized model names', async () => {
    const configState: any = {
      activeProvider: 'github',
      model: '',
      requireToolApproval: true,
      thinking: 'MEDIUM',
      session: { memPersist: true },
      providers: {},
    };

    const localOrchestrator = {
      ...mockOrchestrator,
      getAvailableProviders: vi.fn().mockReturnValue(['github']),
      getAvailableModels: vi.fn().mockResolvedValue(['claude-opus-4.5', 'claude-opus-41']),
    };

    const server = new AcpServer({
      transport: mockTransport,
      orchestratorManager: localOrchestrator as never,
      configManager: {
        getConfig: () => configState,
        loadConfig: (next: Record<string, unknown>) => Object.assign(configState, next),
      } as never,
    });

    const result = (await server.handleSessionNew({ cwd: process.cwd(), mcpServers: [] })) as {
      models: { availableModels: Array<{ modelId: string; name: string }> };
    };

    const names = new Map(result.models.availableModels.map((entry) => [entry.modelId, entry.name]));
    expect(names.get('claude-opus-4.5')).toBe('Opus (claude-opus-4.5)');
    expect(names.get('claude-opus-41')).toBe('Opus (claude-opus-41)');
  });

  it('handleSessionCancel clears pending permission requests', async () => {
    const eventBus = new TypedEventBus();
    const mockApproval = vi.fn();
    const localOrchestrator = {
      ...mockOrchestrator,
      getOrchestrator: vi.fn().mockReturnValue({ handleToolApproval: mockApproval }),
    };

    const server = new AcpServer({
      transport: { send: vi.fn() },
      orchestratorManager: localOrchestrator as never,
      eventBus,
    });

    await server.handleInitialize({ protocolVersion: 1, clientCapabilities: {} });
    await server.handleSessionNew({ cwd: process.cwd(), mcpServers: [] });

    // Simulate a pending permission request by emitting a tool call with approval requirement.
    eventBus.emit('agent:event', {
      type: AgentEventTypes.ToolCalls,
      conversationId: 'default',
      messageId: 'msg-1',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function',
          requiresApproval: true,
          approvalId: 'approval-1',
          function: { name: 'bash_tool', arguments: JSON.stringify({ cmd: 'echo hi' }) },
        },
      ],
    } as never);

    await server.handleSessionCancel({});

    // Approval was denied as part of cancel.
    expect(mockApproval).toHaveBeenCalledWith('approval-1', 'deny');

    // A response arriving after cancel should be silently handled.
    server.handleClientResponse({ id: 1, result: { outcome: { outcome: 'selected', optionId: 'allow_once' } } });
    // Should not crash — the pending request was cleared.
  });

  it('handleClientResponse logs warning for stale permission IDs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const server = new AcpServer({
      transport: { send: vi.fn() },
      orchestratorManager: mockOrchestrator as never,
    });

    // Response with an ID that was never registered as pending.
    server.handleClientResponse({ id: 999, result: { outcome: { outcome: 'selected', optionId: 'allow_once' } } });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown request id=999'),
    );
    warnSpy.mockRestore();
  });

  it('handleClientResponse ignores messages with no id', async () => {
    const server = new AcpServer({
      transport: { send: vi.fn() },
      orchestratorManager: mockOrchestrator as never,
    });

    // Should be a no-op, no errors.
    server.handleClientResponse({ result: {} });
  });
});

describe('AcpServer.humanizeModelName', () => {
  it.each([
    ['claude-sonnet-4-20250514', 'Sonnet'],
    ['claude-opus-4.5', 'Opus'],
    ['claude-3.5-haiku-20241022', 'Haiku'],
    ['default', 'Default (recommended)'],
  ])('Anthropic: %s → %s', async (modelId, expected) => {
    const { AcpModelResolver } = await import('../../source/acp/model-resolver.js');
    const resolver = new AcpModelResolver(mockOrchestrator as never, { getConfig: () => ({}) } as never);
    expect(resolver.humanizeModelName(modelId)).toBe(expected);
  });

  it.each([
    ['gpt-4o', 'GPT-4O'],
    ['o3-mini', 'O3-MINI'],
    ['gpt-4.1-nano', 'GPT-4.1-NANO'],
  ])('OpenAI: %s → %s', async (modelId, expected) => {
    const { AcpModelResolver } = await import('../../source/acp/model-resolver.js');
    const resolver = new AcpModelResolver(mockOrchestrator as never, { getConfig: () => ({}) } as never);
    expect(resolver.humanizeModelName(modelId)).toBe(expected);
  });

  it.each([
    ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
    ['gemini-flash', 'Gemini Flash'],
  ])('Google: %s → %s', async (modelId, expected) => {
    const { AcpModelResolver } = await import('../../source/acp/model-resolver.js');
    const resolver = new AcpModelResolver(mockOrchestrator as never, { getConfig: () => ({}) } as never);
    expect(resolver.humanizeModelName(modelId)).toBe(expected);
  });

  it.each([
    ['llama-3.3-70b', 'Llama 3.3 70B'],
    ['llama-4-scout', 'Llama 4 SCOUT'],
  ])('Meta: %s → %s', async (modelId, expected) => {
    const { AcpModelResolver } = await import('../../source/acp/model-resolver.js');
    const resolver = new AcpModelResolver(mockOrchestrator as never, { getConfig: () => ({}) } as never);
    expect(resolver.humanizeModelName(modelId)).toBe(expected);
  });

  it.each([
    ['mistral-large', 'Mistral Large'],
    ['codestral-latest', 'Codestral Latest'],
  ])('Mistral: %s → %s', async (modelId, expected) => {
    const { AcpModelResolver } = await import('../../source/acp/model-resolver.js');
    const resolver = new AcpModelResolver(mockOrchestrator as never, { getConfig: () => ({}) } as never);
    expect(resolver.humanizeModelName(modelId)).toBe(expected);
  });

  it.each([
    ['deepseek-r1', 'DeepSeek R1'],
    ['deepseek-coder-v2', 'DeepSeek Coder V2'],
  ])('DeepSeek: %s → %s', async (modelId, expected) => {
    const { AcpModelResolver } = await import('../../source/acp/model-resolver.js');
    const resolver = new AcpModelResolver(mockOrchestrator as never, { getConfig: () => ({}) } as never);
    expect(resolver.humanizeModelName(modelId)).toBe(expected);
  });

  it('falls back to raw ID for unknown models', async () => {
    const { AcpModelResolver } = await import('../../source/acp/model-resolver.js');
    const resolver = new AcpModelResolver(mockOrchestrator as never, { getConfig: () => ({}) } as never);
    expect(resolver.humanizeModelName('custom-company/my-model-v3')).toBe('custom-company/my-model-v3');
  });
});
