import { describe, expect, it } from 'vitest';
import { resolveMemoryExtractionConfig } from '../source/services/OrchestratorManager.js';

describe('Orchestrator memory extraction policy', () => {
  it('defaults extraction to enabled without relying on env gates', () => {
    const resolved = resolveMemoryExtractionConfig({});
    expect(resolved.enabled).toBe(true);
    expect(resolved.provider).toBeUndefined();
    expect(resolved.model).toBeUndefined();
  });

  it('supports explicit extraction disable via config', () => {
    const resolved = resolveMemoryExtractionConfig({
      extraction: {
        enabled: false,
      },
    });
    expect(resolved.enabled).toBe(false);
  });

  it('supports explicit extraction provider/model from config', () => {
    const resolved = resolveMemoryExtractionConfig({
      extraction: {
        enabled: true,
        provider: 'openrouter',
        model: 'openai/gpt-4.1-mini',
      },
    });
    expect(resolved.enabled).toBe(true);
    expect(resolved.provider).toBe('openrouter');
    expect(resolved.model).toBe('openai/gpt-4.1-mini');
  });
});
