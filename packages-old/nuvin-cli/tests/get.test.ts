import { describe, it, expect } from 'vitest';
import { get } from '../source/utils';

describe('get', () => {
  it('should get nested property', () => {
    const obj = { metadata: { stats: { total: 5 } } };
    expect(get(obj, 'metadata.stats.total')).toBe(5);
  });

  it('should return undefined for missing path', () => {
    const obj = { metadata: {} };
    expect(get(obj, 'metadata.stats.total')).toBeUndefined();
  });

  it('should return undefined for null object', () => {
    expect(get(null, 'metadata.stats')).toBeUndefined();
  });

  it('should return undefined for undefined object', () => {
    expect(get(undefined, 'metadata.stats')).toBeUndefined();
  });

  it('should return default value when path not found', () => {
    const obj = { metadata: {} };
    expect(get(obj, 'metadata.stats', { total: 0 } as Record<string, number>)).toEqual({ total: 0 });
  });

  it('should get top-level property', () => {
    const obj = { name: 'test' };
    expect(get(obj, 'name')).toBe('test');
  });

  it('should handle undefined intermediate property', () => {
    const obj = { metadata: undefined } as { metadata?: { stats?: { total: number } } };
    expect(get(obj, 'metadata.stats.total')).toBeUndefined();
  });
});
