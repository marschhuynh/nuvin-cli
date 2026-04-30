import type { MetricsPort, MetricsSnapshot, UsageData } from './ports.js';

const createEmptySnapshot = (): MetricsSnapshot => ({
  totalTokens: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalCachedTokens: 0,
  totalReasoningTokens: 0,
  requestCount: 0,
  llmCallCount: 0,
  toolCallCount: 0,
  totalTimeMs: 0,
  totalCost: 0,
  currentTokens: 0,
  currentPromptTokens: 0,
  currentCompletionTokens: 0,
  currentCachedTokens: 0,
  currentCost: 0,
});

export class NoopMetricsPort implements MetricsPort {
  recordLLMCall(_usage: UsageData, _cost?: number): void {}
  recordToolCall(): void {}
  recordRequestComplete(_responseTimeMs: number): void {}
  setContextWindow(_limit: number, _usage: number): void {}
  reset(): void {}
  getSnapshot(): MetricsSnapshot {
    return createEmptySnapshot();
  }
}

export type MetricsChangeHandler = (snapshot: MetricsSnapshot) => void;

export class InMemoryMetricsPort implements MetricsPort {
  private snapshot: MetricsSnapshot = createEmptySnapshot();
  private onChange?: MetricsChangeHandler;

  constructor(onChange?: MetricsChangeHandler) {
    this.onChange = onChange;
  }

  private emit(): void {
    this.onChange?.({ ...this.snapshot });
  }

  recordLLMCall(usage: UsageData, cost?: number): void {
    const prompt = usage.prompt_tokens ?? 0;
    const completion = usage.completion_tokens ?? 0;
    const total = usage.total_tokens ?? prompt + completion;
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const reasoning = usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? 0;
    const actualCost = cost ?? usage.cost ?? 0;

    this.snapshot.totalTokens += total;
    this.snapshot.totalPromptTokens += prompt;
    this.snapshot.totalCompletionTokens += completion;
    this.snapshot.totalCachedTokens += cached;
    this.snapshot.totalReasoningTokens += reasoning;
    this.snapshot.totalCost += actualCost;
    this.snapshot.llmCallCount += 1;

    this.snapshot.currentTokens = total;
    this.snapshot.currentPromptTokens = prompt;
    this.snapshot.currentCompletionTokens = completion;
    this.snapshot.currentCachedTokens = cached;
    this.snapshot.currentCost = actualCost;

    if (this.snapshot.contextWindowLimit && prompt > 0) {
      this.snapshot.contextWindowUsage = prompt / this.snapshot.contextWindowLimit;
    }

    this.emit();
  }

  recordToolCall(): void {
    this.snapshot.toolCallCount += 1;
    this.emit();
  }

  recordRequestComplete(responseTimeMs: number): void {
    this.snapshot.requestCount += 1;
    this.snapshot.totalTimeMs += responseTimeMs;
    this.emit();
  }

  setContextWindow(limit: number, usage: number): void {
    this.snapshot.contextWindowLimit = limit;
    this.snapshot.contextWindowUsage = usage;
    this.emit();
  }

  reset(): void {
    this.snapshot = createEmptySnapshot();
    this.emit();
  }

  getSnapshot(): MetricsSnapshot {
    return { ...this.snapshot };
  }

  setOnChange(fn: MetricsChangeHandler): void {
    this.onChange = fn;
  }
}

export { createEmptySnapshot };
