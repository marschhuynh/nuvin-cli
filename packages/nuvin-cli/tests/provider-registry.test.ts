import { describe, it, expect } from 'vitest';
import {
  ALL_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_ITEMS,
  PROVIDER_OPTIONS,
  isFactoryProvider,
  isSpecialProvider,
} from '../source/config/providers.js';

describe('Provider Registry', () => {
  it('should include all factory providers', () => {
    expect(ALL_PROVIDERS).toContain('openrouter');
    expect(ALL_PROVIDERS).toContain('deepinfra');
    expect(ALL_PROVIDERS).toContain('zai');
    expect(ALL_PROVIDERS).toContain('moonshot');
  });

  it('should include all special providers', () => {
    expect(ALL_PROVIDERS).toContain('github');
    expect(ALL_PROVIDERS).toContain('anthropic');
  });

  it('should have labels for all providers', () => {
    for (const provider of ALL_PROVIDERS) {
      expect(PROVIDER_LABELS[provider]).toBeDefined();
      expect(PROVIDER_LABELS[provider]).toBeTruthy();
    }
  });

  it('should have items for all providers', () => {
    expect(PROVIDER_ITEMS.length).toBe(ALL_PROVIDERS.length);

    for (const provider of ALL_PROVIDERS) {
      const item = PROVIDER_ITEMS.find((i) => i.value === provider);
      expect(item).toBeDefined();
      expect(item?.label).toBe(PROVIDER_LABELS[provider]);
    }
  });

  it('should have options for all providers', () => {
    expect(PROVIDER_OPTIONS.length).toBe(ALL_PROVIDERS.length);

    for (const provider of ALL_PROVIDERS) {
      const option = PROVIDER_OPTIONS.find((o) => o.value === provider);
      expect(option).toBeDefined();
      expect(option?.label).toContain(PROVIDER_LABELS[provider]);
    }
  });

  it('should correctly identify factory providers', () => {
    expect(isFactoryProvider('openrouter')).toBe(true);
    expect(isFactoryProvider('deepinfra')).toBe(true);
    expect(isFactoryProvider('zai')).toBe(true);
    expect(isFactoryProvider('moonshot')).toBe(true);

    expect(isFactoryProvider('github')).toBe(false);
    expect(isFactoryProvider('anthropic')).toBe(false);
  });

  it('should correctly identify special providers', () => {
    expect(isSpecialProvider('github')).toBe(true);
    expect(isSpecialProvider('anthropic')).toBe(true);

    expect(isSpecialProvider('openrouter')).toBe(false);
    expect(isSpecialProvider('deepinfra')).toBe(false);
    expect(isSpecialProvider('zai')).toBe(false);
    expect(isSpecialProvider('moonshot')).toBe(false);
  });

  it('should have no duplicates in ALL_PROVIDERS', () => {
    const uniqueProviders = new Set(ALL_PROVIDERS);
    expect(uniqueProviders.size).toBe(ALL_PROVIDERS.length);
  });
});
