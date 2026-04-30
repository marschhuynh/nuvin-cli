import { describe, it, expect } from 'vitest';
import type { MessageMetadata } from '../source/adapters/index.js';

describe('Footer Cost Display Logic', () => {
  it('should accumulate cost across multiple messages', () => {
    let accumulatedCost = 0;

    const metadata1: MessageMetadata = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cost: 0.0015,
    };

    const metadata2: MessageMetadata = {
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
      cost: 0.003,
      cachedTokens: 150,
    };

    const metadata3: MessageMetadata = {
      promptTokens: 150,
      completionTokens: 75,
      totalTokens: 225,
      cost: 0.00225,
      cachedTokens: 100,
    };

    if (metadata1.cost && metadata1.cost > 0) {
      accumulatedCost += metadata1.cost;
    }

    if (metadata2.cost && metadata2.cost > 0) {
      accumulatedCost += metadata2.cost;
    }

    if (metadata3.cost && metadata3.cost > 0) {
      accumulatedCost += metadata3.cost;
    }

    expect(accumulatedCost).toBeCloseTo(0.00675, 5);
  });

  it('should not accumulate when cost is undefined', () => {
    let accumulatedCost = 0;

    const metadata1: MessageMetadata = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };

    const metadata2: MessageMetadata = {
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
      cost: 0.003,
    };

    if (metadata1.cost && metadata1.cost > 0) {
      accumulatedCost += metadata1.cost;
    }

    if (metadata2.cost && metadata2.cost > 0) {
      accumulatedCost += metadata2.cost;
    }

    expect(accumulatedCost).toBe(0.003);
  });

  it('should handle zero cost', () => {
    let accumulatedCost = 0;

    const metadata: MessageMetadata = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cost: 0,
    };

    if (metadata.cost && metadata.cost > 0) {
      accumulatedCost += metadata.cost;
    }

    expect(accumulatedCost).toBe(0);
  });

  it('should show cached tokens when available', () => {
    const metadata: MessageMetadata = {
      promptTokens: 200,
      completionTokens: 50,
      totalTokens: 250,
      cachedTokens: 150,
      cost: 0.001,
    };

    expect(metadata.cachedTokens).toBeDefined();
    expect(metadata.cachedTokens).toBeGreaterThan(0);
  });

  it('should format cost correctly for display', () => {
    const formatCost = (cost: number): string => {
      if (cost === 0) return '0.00';
      if (cost < 0.01) return cost.toFixed(4);
      if (cost < 1) return cost.toFixed(3);
      return cost.toFixed(2);
    };

    expect(formatCost(0)).toBe('0.00');
    expect(formatCost(0.0001)).toBe('0.0001');
    expect(formatCost(0.00156)).toBe('0.0016');
    expect(formatCost(0.05)).toBe('0.050');
    expect(formatCost(0.999)).toBe('0.999');
    expect(formatCost(1.5)).toBe('1.50');
    expect(formatCost(10.567)).toBe('10.57');
  });
});
