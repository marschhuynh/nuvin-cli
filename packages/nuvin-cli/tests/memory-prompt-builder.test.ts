import { describe, expect, it } from 'vitest';
import {
  buildSystemPromptWithMemory,
  stripInjectedMemorySection,
  MEMORY_START_MARKER,
  MEMORY_END_MARKER,
} from '../source/services/memory-prompt-builder.js';

describe('memory-prompt-builder', () => {
  it('injects memory section with markers', () => {
    const prompt = buildSystemPromptWithMemory('base prompt', '## Long-Term Memory\n- fact');
    expect(prompt).toContain(MEMORY_START_MARKER);
    expect(prompt).toContain(MEMORY_END_MARKER);
    expect(prompt).toContain('## Long-Term Memory');
  });

  it('replaces previous injected section idempotently', () => {
    const first = buildSystemPromptWithMemory('base prompt', '## Long-Term Memory\n- fact a');
    const second = buildSystemPromptWithMemory(first, '## Long-Term Memory\n- fact b');
    expect(second.match(/## Long-Term Memory/g)?.length ?? 0).toBe(1);
    expect(second).toContain('fact b');
    expect(second).not.toContain('fact a');
  });

  it('strips legacy appended long-term memory block', () => {
    const legacy = 'base prompt\n\n## Long-Term Memory\n- old fact';
    expect(stripInjectedMemorySection(legacy)).toBe('base prompt');
  });
});
