import type { TypedEventBus } from '../services/EventBus.js';
import { eventBus } from '../services/EventBus.js';

export type AcpInitializeParams = {
  protocolVersion: number;
  clientCapabilities: unknown;
};

export type AcpInitializeResult = {
  protocolVersion: number;
  agentCapabilities: {
    loadSession: boolean;
    promptCapabilities: {
      image: boolean;
      embeddedContext: boolean;
    };
  };
  agentInfo: { name: string; title: string; version: string };
  authMethods: unknown[];
};

export class AcpServer {
  private eventBus: TypedEventBus;

  constructor(
    private deps: {
      transport: { send: (msg: unknown) => void };
      orchestratorManager: unknown;
      eventBus?: TypedEventBus;
    },
  ) {
    this.eventBus = deps.eventBus ?? eventBus;
  }

  async handleInitialize(params: AcpInitializeParams): Promise<AcpInitializeResult> {
    return {
      protocolVersion: params.protocolVersion,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: true, embeddedContext: true },
      },
      agentInfo: { name: 'nuvin', title: 'Nuvin', version: '0.0.0' },
      authMethods: [],
    };
  }
}
