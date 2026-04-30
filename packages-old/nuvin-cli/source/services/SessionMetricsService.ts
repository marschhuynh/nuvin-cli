import { InMemoryMetricsPort, type MetricsSnapshot, type UsageData, createEmptySnapshot } from '@nuvin/nuvin-core';

export type { MetricsSnapshot };

export type MetricsSubscriber = (conversationId: string, snapshot: MetricsSnapshot) => void;

export class SessionMetricsService {
  private ports: Map<string, InMemoryMetricsPort> = new Map();
  private subscribers: Set<MetricsSubscriber> = new Set();

  private getOrCreatePort(conversationId: string): InMemoryMetricsPort {
    if (this.ports.has(conversationId)) {
      return this.ports.get(conversationId) as InMemoryMetricsPort;
    }

    const port = new InMemoryMetricsPort((snapshot) => {
      this.notifySubscribers(conversationId, snapshot);
    });
    this.ports.set(conversationId, port);
    return port;
  }

  private notifySubscribers(conversationId: string, snapshot: MetricsSnapshot): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(conversationId, snapshot);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  recordLLMCall(conversationId: string, usage: UsageData, cost?: number): void {
    this.getOrCreatePort(conversationId).recordLLMCall(usage, cost);
  }

  recordToolCall(conversationId: string): void {
    this.getOrCreatePort(conversationId).recordToolCall();
  }

  recordRequestComplete(conversationId: string, responseTimeMs: number): void {
    this.getOrCreatePort(conversationId).recordRequestComplete(responseTimeMs);
  }

  setContextWindow(conversationId: string, limit: number, usage: number): void {
    this.getOrCreatePort(conversationId).setContextWindow(limit, usage);
  }

  reset(conversationId: string): void {
    const port = this.ports.get(conversationId);
    if (port) {
      port.reset();
      this.notifySubscribers(conversationId, createEmptySnapshot());
    }
  }

  getSnapshot(conversationId: string): MetricsSnapshot {
    const port = this.ports.get(conversationId);
    return port ? port.getSnapshot() : createEmptySnapshot();
  }

  subscribe(fn: MetricsSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  unsubscribe(fn: MetricsSubscriber): void {
    this.subscribers.delete(fn);
  }
}

export const sessionMetricsService = new SessionMetricsService();
