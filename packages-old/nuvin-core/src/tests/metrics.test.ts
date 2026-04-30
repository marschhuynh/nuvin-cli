import { describe, it, expect, vi } from 'vitest';
import { InMemoryMetricsPort, NoopMetricsPort, createEmptySnapshot } from '../metrics.js';

describe('InMemoryMetricsPort', () => {
  describe('recordLLMCall', () => {
    it('should update token metrics', () => {
      const port = new InMemoryMetricsPort();

      port.recordLLMCall({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      });

      const snapshot = port.getSnapshot();
      expect(snapshot.totalTokens).toBe(150);
      expect(snapshot.totalPromptTokens).toBe(100);
      expect(snapshot.totalCompletionTokens).toBe(50);
      expect(snapshot.currentTokens).toBe(150);
      expect(snapshot.currentPromptTokens).toBe(100);
      expect(snapshot.currentCompletionTokens).toBe(50);
      expect(snapshot.llmCallCount).toBe(1);
    });

    it('should accumulate totals across multiple calls', () => {
      const port = new InMemoryMetricsPort();

      port.recordLLMCall({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
      port.recordLLMCall({ prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 });

      const snapshot = port.getSnapshot();
      expect(snapshot.totalTokens).toBe(450);
      expect(snapshot.totalPromptTokens).toBe(300);
      expect(snapshot.totalCompletionTokens).toBe(150);
      expect(snapshot.currentTokens).toBe(300);
      expect(snapshot.currentPromptTokens).toBe(200);
      expect(snapshot.llmCallCount).toBe(2);
    });

    it('should emit onChange when recording LLM call', () => {
      const onChange = vi.fn();
      const port = new InMemoryMetricsPort(onChange);

      port.recordLLMCall({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          totalTokens: 150,
          currentPromptTokens: 100,
        }),
      );
    });
  });

  describe('contextWindowUsage auto-update', () => {
    it('should NOT update contextWindowUsage if contextWindowLimit is not set', () => {
      const port = new InMemoryMetricsPort();

      port.recordLLMCall({ prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050 });

      const snapshot = port.getSnapshot();
      expect(snapshot.contextWindowLimit).toBeUndefined();
      expect(snapshot.contextWindowUsage).toBeUndefined();
    });

    it('should auto-update contextWindowUsage when contextWindowLimit is set and recordLLMCall is called', () => {
      const port = new InMemoryMetricsPort();

      port.setContextWindow(10000, 0);
      port.recordLLMCall({ prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050 });

      const snapshot = port.getSnapshot();
      expect(snapshot.contextWindowLimit).toBe(10000);
      expect(snapshot.contextWindowUsage).toBe(0.1);
    });

    it('should update contextWindowUsage on each LLM call', () => {
      const onChange = vi.fn();
      const port = new InMemoryMetricsPort(onChange);

      port.setContextWindow(10000, 0);
      onChange.mockClear();

      port.recordLLMCall({ prompt_tokens: 2000, completion_tokens: 100, total_tokens: 2100 });
      expect(port.getSnapshot().contextWindowUsage).toBe(0.2);

      port.recordLLMCall({ prompt_tokens: 5000, completion_tokens: 200, total_tokens: 5200 });
      expect(port.getSnapshot().contextWindowUsage).toBe(0.5);

      port.recordLLMCall({ prompt_tokens: 8500, completion_tokens: 300, total_tokens: 8800 });
      expect(port.getSnapshot().contextWindowUsage).toBe(0.85);
    });

    it('should NOT update contextWindowUsage when prompt_tokens is 0', () => {
      const port = new InMemoryMetricsPort();

      port.setContextWindow(10000, 0.5);
      port.recordLLMCall({ prompt_tokens: 0, completion_tokens: 50, total_tokens: 50 });

      const snapshot = port.getSnapshot();
      expect(snapshot.contextWindowUsage).toBe(0.5);
    });

    it('should emit onChange with updated contextWindowUsage', () => {
      const onChange = vi.fn();
      const port = new InMemoryMetricsPort(onChange);

      port.setContextWindow(10000, 0);
      onChange.mockClear();

      port.recordLLMCall({ prompt_tokens: 3000, completion_tokens: 100, total_tokens: 3100 });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          contextWindowLimit: 10000,
          contextWindowUsage: 0.3,
          currentPromptTokens: 3000,
        }),
      );
    });
  });

  describe('setContextWindow', () => {
    it('should set context window limit and usage', () => {
      const port = new InMemoryMetricsPort();

      port.setContextWindow(128000, 0.25);

      const snapshot = port.getSnapshot();
      expect(snapshot.contextWindowLimit).toBe(128000);
      expect(snapshot.contextWindowUsage).toBe(0.25);
    });

    it('should emit onChange when setting context window', () => {
      const onChange = vi.fn();
      const port = new InMemoryMetricsPort(onChange);

      port.setContextWindow(128000, 0.5);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          contextWindowLimit: 128000,
          contextWindowUsage: 0.5,
        }),
      );
    });
  });

  describe('recordToolCall', () => {
    it('should increment tool call count', () => {
      const port = new InMemoryMetricsPort();

      port.recordToolCall();
      port.recordToolCall();

      const snapshot = port.getSnapshot();
      expect(snapshot.toolCallCount).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset all metrics to empty state', () => {
      const port = new InMemoryMetricsPort();

      port.setContextWindow(10000, 0.5);
      port.recordLLMCall({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
      port.recordToolCall();

      port.reset();

      const snapshot = port.getSnapshot();
      expect(snapshot.totalTokens).toBe(0);
      expect(snapshot.llmCallCount).toBe(0);
      expect(snapshot.toolCallCount).toBe(0);
      expect(snapshot.contextWindowLimit).toBeUndefined();
      expect(snapshot.contextWindowUsage).toBeUndefined();
    });
  });
});

describe('NoopMetricsPort', () => {
  it('should return empty snapshot', () => {
    const port = new NoopMetricsPort();

    port.recordLLMCall({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
    port.recordToolCall();
    port.setContextWindow(10000, 0.5);

    const snapshot = port.getSnapshot();
    expect(snapshot.totalTokens).toBe(0);
    expect(snapshot.llmCallCount).toBe(0);
  });
});

describe('createEmptySnapshot', () => {
  it('should create snapshot with all zero values', () => {
    const snapshot = createEmptySnapshot();

    expect(snapshot.totalTokens).toBe(0);
    expect(snapshot.totalPromptTokens).toBe(0);
    expect(snapshot.totalCompletionTokens).toBe(0);
    expect(snapshot.currentTokens).toBe(0);
    expect(snapshot.llmCallCount).toBe(0);
    expect(snapshot.toolCallCount).toBe(0);
    expect(snapshot.contextWindowLimit).toBeUndefined();
    expect(snapshot.contextWindowUsage).toBeUndefined();
  });
});

describe('contextWindowUsage real-time update flow', () => {
  it('should update contextWindowUsage immediately when limit is set before LLM call', () => {
    const snapshots: any[] = [];
    const port = new InMemoryMetricsPort((snapshot) => snapshots.push({ ...snapshot }));

    port.setContextWindow(100000, 0);

    port.recordLLMCall({ prompt_tokens: 5200, completion_tokens: 300, total_tokens: 5500 });

    expect(snapshots.length).toBe(2);

    const afterLLMCall = snapshots[1];
    expect(afterLLMCall.contextWindowLimit).toBe(100000);
    expect(afterLLMCall.contextWindowUsage).toBeCloseTo(0.052, 3);
    expect(afterLLMCall.currentPromptTokens).toBe(5200);
  });

  it('should update contextWindowUsage on subsequent LLM calls as context grows', () => {
    const snapshots: any[] = [];
    const port = new InMemoryMetricsPort((snapshot) => snapshots.push({ ...snapshot }));

    port.setContextWindow(128000, 0);

    port.recordLLMCall({ prompt_tokens: 10000, completion_tokens: 500, total_tokens: 10500 });
    expect(port.getSnapshot().contextWindowUsage).toBeCloseTo(0.078, 3);

    port.recordLLMCall({ prompt_tokens: 25000, completion_tokens: 1000, total_tokens: 26000 });
    expect(port.getSnapshot().contextWindowUsage).toBeCloseTo(0.195, 3);

    port.recordLLMCall({ prompt_tokens: 50000, completion_tokens: 2000, total_tokens: 52000 });
    expect(port.getSnapshot().contextWindowUsage).toBeCloseTo(0.391, 3);
  });

  it('should preserve contextWindowLimit after reset if set again', () => {
    const port = new InMemoryMetricsPort();

    port.setContextWindow(100000, 0);
    port.recordLLMCall({ prompt_tokens: 5000, completion_tokens: 200, total_tokens: 5200 });
    expect(port.getSnapshot().contextWindowUsage).toBe(0.05);

    port.reset();
    expect(port.getSnapshot().contextWindowLimit).toBeUndefined();
    expect(port.getSnapshot().contextWindowUsage).toBeUndefined();

    port.setContextWindow(100000, 0);
    port.recordLLMCall({ prompt_tokens: 3000, completion_tokens: 100, total_tokens: 3100 });
    expect(port.getSnapshot().contextWindowUsage).toBe(0.03);
  });
});
