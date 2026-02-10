import { AgentEventTypes } from '@nuvin/nuvin-core';
import { AcpServer } from '../../source/acp/server.js';
import { routeAcpRequest } from '../../source/acp/router.js';
import { TypedEventBus } from '../../source/services/EventBus.js';

export function createInMemoryAcpHarness() {
  const updates: Array<{ update: { sessionUpdate: string } }> = [];

  const transport = {
    send: (message: any) => {
      if (message?.method === 'session/update' && message.params) {
        updates.push(message.params as { update: { sessionUpdate: string } });
      }
    },
  };

  const eventBus = new TypedEventBus();

  const orchestratorManager = {
    init: async () => undefined,
    createNewConversation: async () => ({ sessionId: 'sess_1', sessionDir: '/tmp/sess_1', memory: {} }),
    switchToSession: async () => undefined,
    send: async () => {
      eventBus.emit('agent:event', {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'default',
        messageId: 'msg-1',
        delta: 'Hello',
      });

      return {
        id: 'msg-1',
        content: 'Hello',
        role: 'assistant',
        timestamp: new Date().toISOString(),
      };
    },
    getOrchestrator: () => ({ handleToolApproval: () => {} }),
  } as const;

  const server = new AcpServer({ transport, orchestratorManager: orchestratorManager as never, eventBus });

  async function runPrompt(promptText: string) {
    await routeAcpRequest(server, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: 1, clientCapabilities: {} },
    });

    const sessionResponse = await routeAcpRequest(server, {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: { cwd: process.cwd(), mcpServers: [] },
    });

    const sessionId = (sessionResponse?.result as { sessionId: string }).sessionId;

    const promptResponse = await routeAcpRequest(server, {
      jsonrpc: '2.0',
      id: 3,
      method: 'session/prompt',
      params: { sessionId, prompt: { content: [{ type: 'text', text: promptText }] } },
    });

    return {
      updates,
      final: promptResponse?.result as { stopReason?: string },
    };
  }

  return { runPrompt };
}
